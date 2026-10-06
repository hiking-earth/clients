#!/usr/bin/env python3
"""AFCD official hiking trail discovery with source attribution and bounded geometry.
Official geometry is displayed as source reference, never a live permission to hike.
"""
import datetime as dt,json,math,pathlib,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];TARGET=ROOT/'shared/data/catalog/hk-afcd.json'
BASE='https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/FeatureServer/0'
ATTR='香港特别行政区政府 · 渔农自然护理署 · DATA.GOV.HK'
def get(params):
 url=BASE+'/query?'+urllib.parse.urlencode(params)
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HikingEarth/0.2 (+https://github.com/hiking-earth/clients)'}),timeout=35) as response:
  body=response.read(20_000_001)
 if len(body)>20_000_000:raise ValueError('source response exceeds limit')
 data=json.loads(body)
 if 'error' in data:raise ValueError(str(data['error']))
 return data
features=[];seen_ids=set();last_id=None
for page in range(10):
 data=get({'where':'1=1','outFields':'*','returnGeometry':'true','outSR':4326,'resultOffset':page*100,'resultRecordCount':100,'orderByFields':'OBJECTID','f':'json'})
 page_features=data.get('features')
 if not isinstance(page_features,list) or len(page_features)>100:raise ValueError('invalid official source page')
 flag=data.get('exceededTransferLimit')
 if flag is not None and not isinstance(flag,bool):raise ValueError('invalid official source pagination')
 ids=[]
 for feature in page_features:
  identity=feature.get('attributes',{}).get('OBJECTID') if isinstance(feature,dict) else None
  if not isinstance(identity,int) or isinstance(identity,bool) or identity<=0 or identity in seen_ids or (last_id is not None and identity<=last_id):raise ValueError('official source identity/order changed; previous catalog retained')
  ids.append(identity);seen_ids.add(identity);last_id=identity
 features.extend(page_features)
 has_more=flag if flag is not None else len(page_features)==100
 if has_more and not page_features:raise ValueError('official source pagination did not advance')
 if not has_more:break
else:raise SystemExit('Incomplete source; previous catalog retained')
if not features:raise SystemExit('Empty source; previous catalog retained')
now=dt.datetime.now(dt.timezone.utc).isoformat();routes=[];offline=[]
for feature in features:
 a=feature['attributes'];paths=feature.get('geometry',{}).get('paths',[])
 if not paths:continue
 lines=[]
 for path in paths:
  if len(path)<2 or not all(len(p)>=2 and all(isinstance(v,(int,float)) and math.isfinite(v) for v in p[:2]) and abs(p[0])<=180 and abs(p[1])<=90 for p in path):raise ValueError('invalid official WGS84 geometry')
  # Bound reference rendering and offline storage, preserving segment endpoints.
  step=max(1,math.ceil(len(path)/150));line=[p[:2] for p in path[::step]]
  if line[-1]!=path[-1][:2]:line.append(path[-1][:2])
  lines.append(line)
 points=[p for line in lines for p in line];center=[sum(p[i] for p in points)/len(points) for i in [0,1]]
 identifier='hk-afcd-'+str(a['OBJECTID']);name=a.get('TRAIL_NAME_TC') or a.get('TRAIL_NAME_EN')
 if not name:continue
 section=str(a.get('SECTION_NO') or '0');name+=(' · 第'+section+'段') if section!='0' else ''
 try:distance=float(a.get('MEASURE_LEN') or '')/1000
 except ValueError:distance=None
 routes.append({'id':identifier,'name':name,'region':'中国 · 香港 · '+(a.get('REGION_TC') or ''),'center':center,'sourceUrl':BASE,'fetchedAt':now,'sourceTags':{'distanceKm':distance,'difficulty':a.get('DIFFICULTY_TC'),'officialUrl':a.get('WEBSITE'),'start':a.get('STARTpt_TC'),'finish':a.get('FINISHpt_TC')},'referencePaths':lines})
 offline.append({'type':'Feature','properties':{'name':name,'sourceId':identifier},'geometry':{'type':'MultiLineString','coordinates':lines}})
if not routes:raise SystemExit('No usable official source routes; previous catalog retained')
result={'schemaVersion':1,'generatedAt':now,'attribution':ATTR,'license':'DATA.GOV.HK-terms-1.2','licenseUrl':'https://data.gov.hk/en/terms-and-conditions','sourceUrl':BASE,'routes':routes}
TARGET.parent.mkdir(parents=True,exist_ok=True);tmp=TARGET.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');tmp.replace(TARGET)
pack={'format':'hiking-earth-offline-v1','name':'香港郊野公园官方步道参考线','attribution':ATTR,'license':'DATA.GOV.HK 使用条款 1.2 · https://data.gov.hk/en/terms-and-conditions','geometry':{'type':'FeatureCollection','features':offline}}
out=ROOT/'shared/data/offline/hk-afcd.json';out.parent.mkdir(parents=True,exist_ok=True);temp_offline=out.with_suffix('.tmp');temp_offline.write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n');temp_offline.replace(out);print('Collected',len(routes),'AFCD trail records; reference geometry only. Offline bytes:',out.stat().st_size,flush=True)
