#!/usr/bin/env python3
"""Fetch named OSM hiking relations. ODbL snapshot; never infers access permission."""
import argparse, datetime, json, math, pathlib, time, urllib.request, urllib.parse, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
REGIONS = {'china': (18,73,54,135), 'europe': (35,-11,71,35), 'north-america': (24,-130,60,-60), 'japan': (30,129,46,146), 'oceania': (-48,110,-10,179), 'south-america': (-56,-82,13,-34), 'africa': (-35,-18,37,52), 'south-asia': (5,65,36,100)}
def fetch(query):
    error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data':query}).encode(), headers={'User-Agent':'HikingEarthCatalog/1.0 (+https://github.com/hiking-earth/clients)'})
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read(24 * 1024 * 1024 + 1)
            if len(raw) > 24 * 1024 * 1024: raise ValueError('Source exceeds response size budget')
            data = json.loads(raw)
            if data.get('remark'): raise ValueError(data['remark'])
            return data
        except Exception as exc:
            error = exc
            if attempt < 2: time.sleep(10 * (attempt + 1))
    raise RuntimeError(str(error))

def parse_time(value):
    parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None: raise ValueError('Source timestamp has no timezone')
    return parsed.astimezone(datetime.timezone.utc)

def classify_region(region,lon,lat):
    if region=='china' and 113.75<=lon<=114.55 and 22.05<=lat<=22.65:return 'hong-kong'
    if region=='china' and 113.48<=lon<=113.60 and 22.10<=lat<=22.26:return 'macao'
    if region=='japan' and lon<=135 and lat>=41:return 'china'
    return region

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--regions',nargs='+',choices=list(REGIONS),default=list(REGIONS));parser.add_argument('--bootstrap-lookback-hours',type=int,default=24)
    args=parser.parse_args();dest=ROOT/'shared/data/catalog/osm.json'
    previous=json.loads(dest.read_text()) if dest.exists() else {'routes':[]}
    if not isinstance(previous.get('routes'),list):raise SystemExit('Invalid OSM catalog; previous snapshot retained')
    records={r['id']:r for r in previous['routes'] if isinstance(r,dict) and isinstance(r.get('id'),str)}
    now_dt=datetime.datetime.now(datetime.timezone.utc);now=now_dt.isoformat(timespec='seconds').replace('+00:00','Z')
    failures=[];counts={};cursors=previous.get('sourceCursors',{})
    if not isinstance(cursors,dict):cursors={}
    state=previous.get('backfillState') or {}
    active_cycle=state.get('cycleStartedAt') if state.get('reconciliationVersion')==1 else None
    try:bootstrap=parse_time(previous['generatedAt'])-datetime.timedelta(hours=max(1,min(args.bootstrap_lookback_hours,168)))
    except (KeyError,TypeError,ValueError):bootstrap=now_dt-datetime.timedelta(hours=max(1,min(args.bootstrap_lookback_hours,168)))
    order=['china','japan','south-asia','europe','north-america','oceania','south-america','africa']
    for region in sorted(args.regions,key=lambda item:order.index(item)):
        bbox=','.join(str(v) for v in REGIONS[region])
        try:
            try:since=parse_time(cursors[region]) if isinstance(cursors.get(region),str) else bootstrap
            except (TypeError,ValueError):since=bootstrap
            if since>now_dt+datetime.timedelta(minutes=10):since=bootstrap
            since_text=since.isoformat(timespec='seconds').replace('+00:00','Z')
            query=f'[out:json][timeout:45];relation["type"="route"]["route"~"^(hiking|foot)$"]["name"]({bbox})(newer:"{since_text}");out tags center;'
            data=fetch(query);elements=data.get('elements')
            if not isinstance(elements,list):raise ValueError('Missing source relation list')
            watermark=data.get('osm3s',{}).get('timestamp_osm_base')
            next_cursor=None
            if isinstance(watermark,str):
                next_cursor=parse_time(watermark)-datetime.timedelta(minutes=10)
                if next_cursor<since:next_cursor=since
            staged={}
            for item in elements:
                if not isinstance(item,dict) or item.get('type')!='relation':raise ValueError('Invalid OSM relation record')
                rid_value=item.get('id')
                if not isinstance(rid_value,int) or isinstance(rid_value,bool) or rid_value<=0:raise ValueError('Invalid OSM relation identity')
                tags=item.get('tags',{});center=item.get('center',{})
                if not isinstance(tags,dict) or not isinstance(center,dict):raise ValueError('Invalid OSM relation metadata')
                if not isinstance(tags.get('name'),str) or not tags['name'].strip():continue
                lon,lat=center.get('lon'),center.get('lat')
                if not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in (lon,lat)):continue
                if abs(lon)>180 or abs(lat)>90:raise ValueError('OSM relation center is out of range')
                rid=f'osm-relation-{rid_value}';observed=classify_region(region,lon,lat)
                # Keep the first region from the deterministic preferred order
                # when a relation lies in overlapping discovery rectangles.
                if rid in staged:continue
                old=records.get(rid)
                old_region=old.get('region') if old else None
                chosen=old_region if old_region in REGIONS or old_region in ('hong-kong','macao') else observed
                old_status=old.get('status') if old and isinstance(old.get('status'),str) else '待核验'
                row={'id':rid,'name':tags.get('name:zh') or tags['name'],'originalName':tags['name'],'region':chosen,'center':[lon,lat], 'sourceUrl':f'https://www.openstreetmap.org/relation/{rid_value}','sourceTags':{k:v for k,v in tags.items() if k in ('distance','ascent','descent','network','operator','website','description','access','ref')},'fetchedAt':now,'status':old_status}
                if active_cycle:row['lastSeenCycle']=active_cycle
                staged[rid]=row
            records.update(staged);counts[region]=len(staged)
            if next_cursor:cursors[region]=next_cursor.isoformat(timespec='seconds').replace('+00:00','Z')
        except Exception as exc:
            failures.append({'region':region,'error':str(exc)});print(region,'retained previous snapshot:',str(exc),flush=True)
        time.sleep(3)
    if not counts:raise SystemExit('All sources failed; catalog left unchanged')
    snapshot=dict(previous);snapshot.update({'schemaVersion':1,'generatedAt':now,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','licenseUrl':'https://www.openstreetmap.org/copyright','coverage':counts,'sourceCursors':cursors,'failures':failures,'routes':sorted(records.values(),key=lambda r:r['id'])})
    dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n');os.replace(temp,dest)
    print(json.dumps({'catalogCount':len(records),'coverage':counts,'sourceCursors':cursors,'failures':len(failures)},ensure_ascii=False))
if __name__=='__main__': main()
