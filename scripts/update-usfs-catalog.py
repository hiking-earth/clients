#!/usr/bin/env python3
"""USDA Forest Service trail discovery; named segments grouped by trail_cn."""
import datetime,json,pathlib,urllib.request,urllib.parse,time,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0'
dest=ROOT/'shared/data/catalog/usfs.json'
previous=json.loads(dest.read_text()) if dest.exists() else {'routes':[]}
state_path=ROOT/'shared/data/catalog/usfs-backfill-state.json'
# The snapshot and its cursor are one authoritative atomic checkpoint.
# Older snapshots migrate from the separate compatibility state file.
state=previous.get('backfill')
if not isinstance(state,dict):
    state=json.loads(state_path.read_text()) if state_path.exists() else {'nextObjectId':None,'completedCycles':0}
state=dict(state)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
# A legacy partial cycle has no membership evidence; restart from the top.
if state.get('reconciliationVersion')!=1:
    state.update({'nextObjectId':None,'reconciliationVersion':1,'cycleStartedAt':now})
if state.get('nextObjectId') is None:
    state['cycleStartedAt']=now
if state.get('nextObjectId') is not None and (not isinstance(state['nextObjectId'],int) or isinstance(state['nextObjectId'],bool) or state['nextObjectId']<=0):
    raise SystemExit('Invalid saved cursor; retained previous snapshot')
if not isinstance(state.get('cycleStartedAt'),str):raise SystemExit('Invalid saved cycle; retained previous snapshot')
cycle=state['cycleStartedAt'];cycle_complete=False
cursor=state.get('nextObjectId');next_cursor=cursor
records={r['id']:r for r in previous['routes']}; seen=set()
# Refresh the newest page and advance a persistent historical keyset cursor.
# Publish neither cursor nor snapshot if any requested page fails.
for page in range(5):
    historical=page>0
    where="trail_name IS NOT NULL AND hiker_pedestrian_restricted IS NULL"
    requested_cursor=next_cursor if historical else None
    if historical and next_cursor is not None:where+=' AND objectid < '+str(int(next_cursor))
    offset=page*1000
    params={'f':'json','where':where,'outFields':'objectid,trail_name,trail_cn,trail_no,managing_org,gis_miles,hiker_pedestrian_managed,hiker_pedestrian_accpt,hiker_pedestrian_restricted','returnGeometry':'true','outSR':4326,'geometryPrecision':4,'maxAllowableOffset':0.005,'resultOffset':0,'resultRecordCount':1000,'orderByFields':'objectid DESC'}
    result=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(SOURCE+'/query?'+urllib.parse.urlencode(params),timeout=60) as response:
                raw=response.read(20*1024*1024+1)
            if len(raw)>20*1024*1024:raise ValueError('Source response too large')
            result=json.loads(raw)
            if 'error' in result:raise ValueError(str(result['error']))
            if not isinstance(result.get('features'),list):raise ValueError('Missing source feature list')
            if result.get('exceededTransferLimit') is not None and not isinstance(result['exceededTransferLimit'],bool):raise ValueError('Invalid source pagination flag')
            break
        except Exception as exc:
            print('source page',offset,'attempt',attempt+1,str(exc),flush=True)
            if attempt==2:raise SystemExit('Incomplete source response; retained previous snapshot')
            time.sleep(5*(attempt+1))
    features=result.get('features',[])
    if not all(isinstance(f,dict) and isinstance(f.get('attributes'),dict) and isinstance(f['attributes'].get('objectid'),int) and not isinstance(f['attributes']['objectid'],bool) for f in features):
        raise SystemExit('Invalid source identity; retained previous snapshot')
    ids=[int(f['attributes']['objectid']) for f in features if f.get('attributes',{}).get('objectid') is not None]
    if len(ids)>1000 or len(set(ids))!=len(ids) or ids!=sorted(ids,reverse=True) or any(identity<=0 or (requested_cursor is not None and identity>=requested_cursor) for identity in ids):
        raise SystemExit('Invalid source pagination boundary; retained previous snapshot')
    has_more=result.get('exceededTransferLimit')
    if has_more is None:has_more=len(features)==1000
    if has_more and not ids:raise SystemExit('Source pagination did not advance; retained previous snapshot')
    if page==0 and next_cursor is None and ids:next_cursor=min(ids)
    elif historical and ids:next_cursor=min(ids)
    if not has_more:
        cycle_complete=True
        next_cursor=None;state['completedCycles']=int(state.get('completedCycles',0))+1
    for feature in features:
        attrs=feature['attributes'];points=[p for part in feature.get('geometry',{}).get('paths',[]) for p in part]
        identity=str(attrs.get('trail_cn') or attrs['objectid']);rid='usfs-'+identity
        if not points or not str(attrs.get('trail_name') or '').strip():
            if rid in records:records[rid]['lastSeenCycle']=cycle
            continue
        if rid in seen: continue
        seen.add(rid)
        center=[round(sum(p[i] for p in points)/len(points),5) for i in (0,1)]
        records[rid]={'id':rid,'name':attrs['trail_name'],'region':'美国 · '+str(attrs.get('managing_org') or '国家森林'),'center':center,'sourceUrl':SOURCE,'sourceTags':{'trailNumber':attrs.get('trail_no'),'hikingManaged':attrs.get('hiker_pedestrian_managed'),'hikingAccepted':attrs.get('hiker_pedestrian_accpt')},'fetchedAt':now,'lastSeenCycle':cycle,'status':'待核验'}
    print('source page',offset,'records',len(records),flush=True)
    if not has_more:break
    time.sleep(2)
if not seen:raise SystemExit('No usable source records; retained previous snapshot')
if cycle_complete:
    removed=sum(row.get('lastSeenCycle')!=cycle for row in records.values())
    records={rid:row for rid,row in records.items() if row.get('lastSeenCycle')==cycle}
    state.update({'lastCompletedAt':now,'lastRemovedFromDiscovery':removed})
    print('Completed eligible-source cycle; removed from discovery',removed,flush=True)
state.update({'schemaVersion':1,'nextObjectId':next_cursor,'updatedAt':now})
snapshot={'backfill':state,'schemaVersion':1,'generatedAt':now,'attribution':'USDA Forest Service','license':'USDA source terms; retain attribution and source metadata','licenseUrl':'https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=recreation','sourceUrl':SOURCE,'coverage':'Persistent historical backfill plus refreshed newest eligible source segments; grouped by trail identity, not a complete US inventory','routes':list(records.values())}
dest=ROOT/'shared/data/catalog/usfs.json';temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n');os.replace(temp,dest);print('USFS discovered routes',len(records),flush=True)

# Compatibility mirror; failure here cannot advance or regress the next run.
temp=state_path.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n');os.replace(temp,state_path)
