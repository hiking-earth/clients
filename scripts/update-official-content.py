#!/usr/bin/env python3
"""Collect official RSS metadata only; preserve prior data on source failure.
No article bodies/images are copied and no item grants route opening permission.
"""
import datetime as dt
import email.utils
import hashlib
import json
import pathlib
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
TARGET=ROOT/'shared/data/content/official-news.json'
SOURCES=[{'id':'nps-grand-canyon-news','label':'美国国家公园管理局 · 大峡谷','url':'https://www.nps.gov/feeds/getNewsRSS.htm?id=grca','region':'美国 · 大峡谷','center':[-112.113,36.106]}, {'id':'nps-grand-canyon-backcountry','label':'美国国家公园管理局 · 大峡谷步道公告','url':'https://www.nps.gov/grca/planyourvisit/upload/grca-backcountry.xml','region':'美国 · 大峡谷','center':[-112.113,36.106]}]
def collect(source):
 req=urllib.request.Request(source['url'],headers={'User-Agent':'HikingEarth/0.2 (+https://github.com/hiking-earth/clients)','Accept':'application/rss+xml, application/xml, text/xml'})
 with urllib.request.urlopen(req,timeout=30) as response:
  redirect=urllib.parse.urlparse(response.url)
  if redirect.scheme!='https' or redirect.hostname!='www.nps.gov' or redirect.username or redirect.password or redirect.port:raise ValueError('unexpected redirect domain')
  data=response.read(2_000_001)
 if len(data)>2_000_000:raise ValueError('feed too large')
 if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('unsupported XML entity declarations')
 tree=ET.fromstring(data);rows=[];seen=set();now=dt.datetime.now(dt.timezone.utc).isoformat()
 for item in tree.findall('.//item')[:100]:
  title=' '.join((item.findtext('title') or '').split())[:300]
  link=(item.findtext('link') or '').strip();parsed=urllib.parse.urlparse(link)
  if not title or parsed.scheme!='https' or parsed.hostname!='www.nps.gov' or parsed.username or parsed.password or parsed.port:continue
  if link in seen:raise ValueError('duplicate official item URL')
  seen.add(link)
  stamp=(item.findtext('pubDate') or '').strip()
  try:published=email.utils.parsedate_to_datetime(stamp).isoformat()
  except (ValueError,TypeError,OverflowError):published=None
  rows.append({'id':source['id']+'-'+hashlib.sha256(link.encode()).hexdigest()[:20],'title':title,'url':link,'region':source['region'],'center':source['center'],'industry':'开放管理','importance':'中','publishedAt':published,'sourceLabel':source['label'],'sourceUrl':source['url'],'fetchedAt':now,'verified':True,'sourceId':source['id']})
 if not rows:raise ValueError('no valid official metadata')
 return rows
old=json.loads(TARGET.read_text()) if TARGET.exists() else {'schemaVersion':1,'items':[],'sources':[]}
items={r['id']:r for r in old.get('items',[])};states={r['id']:r for r in old.get('sources',[])};failed=0
for source in SOURCES:
 try:
  rows=collect(source)
  for row in rows:items[row['id']]=row
  states[source['id']]={**source,'lastSuccess':dt.datetime.now(dt.timezone.utc).isoformat(),'lastAttempt':dt.datetime.now(dt.timezone.utc).isoformat(),'lastError':None}
  print(source['id'],len(rows),'official items',flush=True)
 except Exception as e:
  failed+=1;states[source['id']]={**states.get(source['id'],source),'lastError':str(e),'lastAttempt':dt.datetime.now(dt.timezone.utc).isoformat()}
  print(source['id'],'failed; prior snapshot retained:',str(e),file=sys.stderr,flush=True)
def order_time(row):
 value=row.get('publishedAt') or row.get('fetchedAt')
 try:
  stamp=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
  if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=dt.timezone.utc)
  return stamp.timestamp()
 except (ValueError,TypeError,AttributeError,OverflowError):return 0
if failed==len(SOURCES):
 # Preserve item contents and their generation date while recording failed attempts.
 result={**old,'sources':list(states.values())}
else:
 result={'schemaVersion':1,'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'items':sorted(items.values(),key=order_time,reverse=True)[:500],'sources':list(states.values()),'notice':'官方公告索引；查看原文确认生效范围，不据此自动开放路线。'}
TARGET.parent.mkdir(parents=True,exist_ok=True)
# Unique sibling temp file prevents overlapping jobs from sharing a staging path.
import tempfile
with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=TARGET.parent,prefix=TARGET.name+'.',suffix='.tmp',delete=False) as file:
 file.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temporary=pathlib.Path(file.name)
try:temporary.replace(TARGET)
finally:temporary.unlink(missing_ok=True)
if failed==len(SOURCES):sys.exit(1)
