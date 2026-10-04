#!/usr/bin/env python3
"""Resumable bounded spatial inventory; successful tiles revisit for updates.
Large tiles split rather than silently dropping older records at a result limit.
"""
import argparse,datetime,json,pathlib,time,os
from importlib.machinery import SourceFileLoader
SOURCE=SourceFileLoader('hiking_osm',str(pathlib.Path(__file__).with_name('update-route-catalog.py'))).load_module()
ROOT=pathlib.Path(__file__).resolve().parents[1];DEST=ROOT/'shared/data/catalog/osm.json';STATE=ROOT/'shared/data/catalog/osm-backfill-state.json'
def cells():
 out=[]
 for region,(south,west,north,east) in SOURCE.REGIONS.items():
  y=south
  while y<north:
   x=west
   while x<east:out.append({'region':region,'bbox':[y,x,min(y+4,north),min(x+4,east)]});x+=4
   y+=4
 # Interleave regions so global history proceeds alongside the China backfill.
 result=[];groups={r:[c for c in out if c['region']==r] for r in SOURCE.REGIONS}
 while any(groups.values()):
  for group in groups.values():
   if group:result.append(group.pop(0))
 return result
parser=argparse.ArgumentParser();parser.add_argument('--tiles',type=int,default=8);args=parser.parse_args()
previous=json.loads(DEST.read_text());state=json.loads(STATE.read_text()) if STATE.exists() else {'schemaVersion':1,'queue':cells(),'completed':[],'cycle':0}
records={r['id']:r for r in previous['routes']};success=0;failures=[];now=datetime.datetime.now(datetime.timezone.utc).isoformat();processed=0
for _ in range(max(1,min(args.tiles,24))):
 if not state['queue']:
  state['queue']=state['completed'];state['completed']=[];state['cycle']+=1
 if not state['queue']:break
 tile=state['queue'].pop(0);bbox=tile['bbox'];since=tile.get('watermark');filter=f'(newer:"{since}")' if since else ''
 country={'china':'CN','japan':'JP'}.get(tile['region']);area=f'area["ISO3166-1"="{country}"]["admin_level"="2"]->.country;' if country else '';inside='(area.country)' if country else ''
 query=f'[out:json][timeout:30];{area}relation["type"="route"]["route"~"^(hiking|foot)$"]["name"]{inside}({",".join(map(str,bbox))}){filter};out tags center 2000;'
 try:
  data=SOURCE.fetch(query);elements=data.get('elements',[])
  for item in elements:
   tags=item.get('tags',{});center=item.get('center',{});rid=f"osm-relation-{item['id']}"
   if item.get('type')!='relation' or not tags.get('name') or 'lon' not in center or 'lat' not in center:continue
   records[rid]={'id':rid,'name':tags.get('name:zh') or tags['name'],'originalName':tags['name'],'region':tile['region'],'center':[center['lon'],center['lat']],'sourceUrl':f"https://www.openstreetmap.org/relation/{item['id']}",'sourceTags':{k:v for k,v in tags.items() if k in ('distance','ascent','descent','network','operator','website','description','access','ref')},'fetchedAt':now,'status':'待核验'}
  if len(elements)>=2000:
   south,west,north,east=bbox
   if north-south<0.125 and east-west<0.125:raise ValueError('Dense tile exceeds safe bound; retain and retry without advancing')
   midY=(south+north)/2;midX=(west+east)/2
   state['queue'].extend({'region':tile['region'],'bbox':b} for b in [[south,west,midY,midX],[south,midX,midY,east],[midY,west,north,midX],[midY,midX,north,east]])
  else:
   watermark=data.get('osm3s',{}).get('timestamp_osm_base')
   if watermark:
    parsed=datetime.datetime.fromisoformat(watermark.replace('Z','+00:00'))
    if parsed.tzinfo is None:raise ValueError('Source watermark missing timezone')
    tile['watermark']=(parsed-datetime.timedelta(minutes=10)).isoformat()
   state['completed'].append(tile)
  success+=1;processed+=1;print(tile['region'],bbox,'records',len(elements),'catalog',len(records),flush=True)
 except Exception as e:
  tile['lastError']=str(e);state['queue'].append(tile);failures.append({'region':tile['region'],'bbox':bbox,'error':str(e)});print('Tile retained',tile['region'],str(e),flush=True)
 time.sleep(3)
if not success:raise SystemExit('All attempted tiles failed; snapshots and cursors retained')
previous.update({'routes':sorted(records.values(),key=lambda r:r['id']),'generatedAt':now,'failures':failures,'backfill':{'completedTiles':len(state['completed']),'pendingTiles':len(state['queue']),'cycle':state['cycle'],'lastProcessedTiles':processed},'coverageNote':'Bounded spatial backfill and incremental revisits; incomplete until the pending queue has been traversed. No opening or navigation permission implied.'})
for path,data in [(DEST,previous),(STATE,state)]:
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');os.replace(tmp,path)
