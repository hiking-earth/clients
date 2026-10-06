#!/usr/bin/env python3
"""Fetch named OSM hiking relations. ODbL snapshot; never infers access permission."""
import argparse, datetime, json, math, pathlib, time, urllib.request, urllib.parse, urllib.error, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
REGIONS = {'china': (18,73,54,135), 'europe': (35,-11,71,35), 'north-america': (24,-130,60,-60), 'japan': (30,129,46,146), 'oceania': (-48,110,-10,179), 'south-america': (-56,-82,13,-34), 'africa': (-35,-18,37,52), 'south-asia': (5,65,36,100)}
MAX_DAILY_BYTES = 8 * 1024 * 1024
MAX_DAILY_QUERIES = 64
MAX_RESPONSE_BYTES = 1024 * 1024

class FetchFailure(RuntimeError):
    def __init__(self, message, bytes_read=0):
        super().__init__(message)
        self.bytes_read = bytes_read

def fetch(query, byte_limit=24 * 1024 * 1024):
    req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data':query}).encode(), headers={'User-Agent':'HikingEarthCatalog/1.0 (+https://github.com/hiking-earth/clients)'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read(byte_limit)
    except urllib.error.HTTPError as exc:
        try: consumed = len(exc.read(byte_limit))
        except Exception: consumed = 0
        raise FetchFailure(f'HTTP {exc.code}: {exc.reason}', consumed) from exc
    except Exception as exc:
        raise FetchFailure(str(exc)) from exc
    if len(raw) >= byte_limit:
        raise FetchFailure(f'Response reached byte budget ({byte_limit}); watermark retained', len(raw))
    try:
        data = json.loads(raw)
        if data.get('remark'): raise ValueError(data['remark'])
        return data, len(raw)
    except Exception as exc:
        raise FetchFailure(str(exc), len(raw)) from exc

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
    today=now_dt.date().isoformat();old_budget=previous.get('sourceBudget',{})
    if not isinstance(old_budget,dict) or old_budget.get('dateUTC')!=today:old_budget={}
    budget={'dateUTC':today,'downloadedBytes':old_budget.get('downloadedBytes',0),'queryCount':old_budget.get('queryCount',0),'dailyByteLimit':MAX_DAILY_BYTES,'dailyQueryLimit':MAX_DAILY_QUERIES,'perResponseByteLimit':MAX_RESPONSE_BYTES}
    for key in ('downloadedBytes','queryCount'):
        if not isinstance(budget[key],int) or isinstance(budget[key],bool) or budget[key]<0:budget[key]=0
    state=previous.get('backfillState') or {}
    active_cycle=state.get('cycleStartedAt') if state.get('reconciliationVersion')==1 else None
    try:bootstrap=parse_time(previous['generatedAt'])-datetime.timedelta(hours=max(1,min(args.bootstrap_lookback_hours,168)))
    except (KeyError,TypeError,ValueError):bootstrap=now_dt-datetime.timedelta(hours=max(1,min(args.bootstrap_lookback_hours,168)))
    order=['china','japan','south-asia','europe','north-america','oceania','south-america','africa']
    ordered_regions=sorted(args.regions,key=lambda item:order.index(item))
    for index,region in enumerate(ordered_regions):
        if budget['queryCount']>=MAX_DAILY_QUERIES or budget['downloadedBytes']>=MAX_DAILY_BYTES:
            failures.append({'region':region,'error':'Daily public-source budget exhausted; watermark retained'})
            continue
        byte_limit=min(MAX_RESPONSE_BYTES,MAX_DAILY_BYTES-budget['downloadedBytes'])
        bbox=','.join(str(v) for v in REGIONS[region])
        try:
            try:since=parse_time(cursors[region]) if isinstance(cursors.get(region),str) else bootstrap
            except (TypeError,ValueError):since=bootstrap
            if since>now_dt+datetime.timedelta(minutes=10):since=bootstrap
            since_text=since.isoformat(timespec='seconds').replace('+00:00','Z')
            query=f'[out:json][timeout:45];relation["type"="route"]["route"~"^(hiking|foot)$"]["name"]({bbox})(newer:"{since_text}");out tags center;'
            budget['queryCount']+=1
            data,bytes_read=fetch(query,byte_limit);budget['downloadedBytes']+=bytes_read;elements=data.get('elements')
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
            budget['downloadedBytes']+=min(getattr(exc,'bytes_read',0),byte_limit)
            failures.append({'region':region,'error':str(exc)});print(region,'retained previous snapshot:',str(exc),flush=True)
        if index<len(ordered_regions)-1:time.sleep(3)
    snapshot=dict(previous);snapshot.update({'schemaVersion':1,'lastUpdateAttemptAt':now,'sourceBudget':budget,'sourceCursors':cursors,'failures':failures})
    if counts:
        snapshot.update({'generatedAt':now,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','licenseUrl':'https://www.openstreetmap.org/copyright','coverage':counts,'routes':sorted(records.values(),key=lambda r:r['id'])})
    dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n');os.replace(temp,dest)
    result={'catalogCount':len(records),'coverage':counts,'sourceCursors':cursors,'failures':len(failures),'sourceBudget':budget}
    print(json.dumps(result,ensure_ascii=False))
    if not counts:raise SystemExit('No OSM regions refreshed; query budget and failure state saved without advancing source watermarks')
if __name__=='__main__': main()
