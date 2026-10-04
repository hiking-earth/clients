#!/usr/bin/env python3
"""USDA Forest Service trail discovery; named segments grouped by trail_cn."""
import datetime,json,pathlib,urllib.request,urllib.parse,time,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0'
dest=ROOT/'shared/data/catalog/usfs.json'
previous=json.loads(dest.read_text()) if dest.exists() else {'routes':[]}
records={r['id']:r for r in previous['routes']}; seen=set();now=datetime.datetime.now(datetime.timezone.utc).isoformat()
# Bounded initial inventory. Pagination is repeatable and independent of application tests.
for offset in range(0,5000,1000):
    params={'f':'json','where':"trail_name IS NOT NULL AND hiker_pedestrian_restricted IS NULL",'outFields':'objectid,trail_name,trail_cn,trail_no,managing_org,gis_miles,hiker_pedestrian_managed,hiker_pedestrian_accpt,hiker_pedestrian_restricted','returnGeometry':'true','outSR':4326,'geometryPrecision':4,'maxAllowableOffset':0.005,'resultOffset':offset,'resultRecordCount':1000,'orderByFields':'objectid DESC'}
    result=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(SOURCE+'/query?'+urllib.parse.urlencode(params),timeout=60) as response:
                raw=response.read(20*1024*1024+1)
            if len(raw)>20*1024*1024:raise ValueError('Source response too large')
            result=json.loads(raw)
            if 'error' in result:raise ValueError(str(result['error']))
            break
        except Exception as exc:
            print('source page',offset,'attempt',attempt+1,str(exc),flush=True)
            if attempt==2:raise SystemExit('Incomplete source response; retained previous snapshot')
            time.sleep(5*(attempt+1))
    for feature in result.get('features',[]):
        attrs=feature['attributes'];points=[p for part in feature.get('geometry',{}).get('paths',[]) for p in part]
        if not points or not str(attrs.get('trail_name') or '').strip():continue
        identity=str(attrs.get('trail_cn') or attrs['objectid']);rid='usfs-'+identity
        if rid in seen: continue
        seen.add(rid)
        center=[round(sum(p[i] for p in points)/len(points),5) for i in (0,1)]
        records[rid]={'id':rid,'name':attrs['trail_name'],'region':'美国 · '+str(attrs.get('managing_org') or '国家森林'),'center':center,'sourceUrl':SOURCE,'sourceTags':{'trailNumber':attrs.get('trail_no'),'hikingManaged':attrs.get('hiker_pedestrian_managed'),'hikingAccepted':attrs.get('hiker_pedestrian_accpt')},'fetchedAt':now,'status':'待核验'}
    print('source page',offset,'records',len(records),flush=True)
    if not result.get('exceededTransferLimit'):break
    time.sleep(2)
if not seen:raise SystemExit('No usable source records; retained previous snapshot')
snapshot={'schemaVersion':1,'generatedAt':now,'attribution':'USDA Forest Service','license':'USDA source terms; retain attribution and source metadata','licenseUrl':'https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=recreation','sourceUrl':SOURCE,'coverage':'Latest 5000 eligible source segments plus retained earlier records; grouped by trail identity, not a complete US inventory','routes':list(records.values())}
dest=ROOT/'shared/data/catalog/usfs.json';temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n');os.replace(temp,dest);print('USFS discovered routes',len(records),flush=True)
