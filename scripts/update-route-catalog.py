#!/usr/bin/env python3
"""Fetch named OSM hiking relations. ODbL snapshot; never infers access permission."""
import argparse, datetime, json, pathlib, time, urllib.request, urllib.parse, os
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
def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--regions', nargs='+', choices=list(REGIONS), default=list(REGIONS)); parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args(); dest=ROOT/'shared/data/catalog/osm.json'
    previous=json.loads(dest.read_text()) if dest.exists() else {'routes':[]}
    records={r['id']:r for r in previous['routes']}; now=datetime.datetime.now(datetime.timezone.utc).isoformat(); failures=[]; counts={}
    for region in args.regions:
        bbox=','.join(str(v) for v in REGIONS[region])
        query=f'[out:json][timeout:45];relation["type"="route"]["route"~"^(hiking|foot)$"]["name"]({bbox});out tags center {max(1,min(args.limit,5000))};'
        try:
            data=fetch(query); count=0
            for item in data.get('elements',[]):
                tags=item.get('tags',{}); center=item.get('center',{})
                if item.get('type')!='relation' or not tags.get('name') or 'lon' not in center or 'lat' not in center: continue
                rid=f"osm-relation-{item['id']}"
                records[rid]={'id':rid,'name':tags.get('name:zh') or tags['name'],'originalName':tags['name'],'region':region,'center':[center['lon'],center['lat']], 'sourceUrl':f"https://www.openstreetmap.org/relation/{item['id']}", 'sourceTags':{k:v for k,v in tags.items() if k in ('distance','ascent','descent','network','operator','website','description','access','ref')},'fetchedAt':now,'status':'待核验'}; count+=1
            counts[region]=count
        except Exception as exc:
            failures.append({'region':region,'error':str(exc)}); print(region, 'retained previous snapshot:',str(exc),flush=True)
        time.sleep(3)
    if not counts: raise SystemExit('All sources failed; catalog left unchanged')
    snapshot={'schemaVersion':1,'generatedAt':now,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','licenseUrl':'https://www.openstreetmap.org/copyright','coverage':counts,'failures':failures,'routes':sorted(records.values(),key=lambda r:r['id'])}
    dest.parent.mkdir(parents=True,exist_ok=True); temp=dest.with_suffix('.tmp'); temp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n'); os.replace(temp,dest)
    print(json.dumps({'catalogCount':len(records),'coverage':counts,'failures':len(failures)},ensure_ascii=False))
if __name__=='__main__': main()
