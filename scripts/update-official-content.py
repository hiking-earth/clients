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
SOURCE_CONFIG=ROOT/'shared/data/content/official-sources.json'
config=json.loads(SOURCE_CONFIG.read_text(encoding='utf-8'))
if config.get('schemaVersion')!=1 or not isinstance(config.get('sources'),list) or not 0<len(config['sources'])<=50:raise ValueError('invalid official source registry')
SOURCES=config['sources']
seen_sources=set()
for source in SOURCES:
 if not isinstance(source,dict) or source.get('format')!='rss' or source.get('reuse')!='metadata-links-only':raise ValueError('unsupported official source policy')
 if not isinstance(source.get('id'),str) or not source['id'] or source['id'] in seen_sources:raise ValueError('invalid duplicate source ID')
 seen_sources.add(source['id'])
 url=urllib.parse.urlparse(source.get('url',''))
 hosts=source.get('articleHosts')
 if not isinstance(hosts,list) or not hosts or any(not isinstance(host,str) or not host or '/' in host or ':' in host for host in hosts):raise ValueError('invalid source hosts')
 if url.scheme!='https' or url.hostname not in hosts or url.username or url.password or url.port:raise ValueError('invalid official source URL')
 keywords=source.get('titleKeywords',[])
 if not isinstance(keywords,list) or len(keywords)>30 or any(not isinstance(word,str) or not word.strip() for word in keywords):raise ValueError('invalid source title filter')
 if any(not isinstance(source.get(key),str) or not source[key] for key in ['label','region']):raise ValueError('invalid source attribution')

def collect(source):
 req=urllib.request.Request(source['url'],headers={'User-Agent':'HikingEarth/0.2 (+https://github.com/hiking-earth/clients)','Accept':'application/rss+xml, application/xml, text/xml'})
 with urllib.request.urlopen(req,timeout=30) as response:
  redirect=urllib.parse.urlparse(response.url)
  if redirect.scheme!='https' or redirect.hostname!=urllib.parse.urlparse(source['url']).hostname or redirect.username or redirect.password or redirect.port:raise ValueError('unexpected redirect domain')
  data=response.read(2_000_001)
 if len(data)>2_000_000:raise ValueError('feed too large')
 if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('unsupported XML entity declarations')
 tree=ET.fromstring(data)
 if tree.tag!='rss' or tree.find('channel') is None:raise ValueError('unsupported RSS structure')
 feed_items=tree.findall('./channel/item')
 rows=[];seen=set();now=dt.datetime.now(dt.timezone.utc).isoformat()
 for item in feed_items[:100]:
  title=' '.join((item.findtext('title') or '').split())[:300]
  link=(item.findtext('link') or '').strip();parsed=urllib.parse.urlparse(link)
  if not title or parsed.scheme!='https' or parsed.hostname not in source['articleHosts'] or parsed.username or parsed.password or parsed.port:continue
  # Feeds may repeat the same article in more than one item (for example,
  # after changing categories). Keep the first valid occurrence instead of
  # discarding the entire source snapshot.
  if link in seen:continue
  seen.add(link)
  keywords=source.get('titleKeywords',[])
  if keywords and not any(word.casefold() in title.casefold() for word in keywords):continue
  stamp=(item.findtext('pubDate') or '').strip()
  try:published=email.utils.parsedate_to_datetime(stamp).isoformat()
  except (ValueError,TypeError,OverflowError):published=None
  rows.append({'id':source['id']+'-'+hashlib.sha256(link.encode()).hexdigest()[:20],'title':title,'url':link,'region':source['region'],**({'center':source['center']} if 'center' in source else {}),'industry':'开放管理','importance':'中','publishedAt':published,'sourceLabel':source['label'],'sourceUrl':source['url'],'fetchedAt':now,'verified':True,'sourceId':source['id']})
 if feed_items and not rows and not (seen and source.get('titleKeywords')):raise ValueError('no valid official metadata')
 return rows
# Linux scheduled runners and macOS local collectors share a per-target OS lock.
# The kernel releases it on process exit, including crashes; do not unlink it.
import fcntl
import tempfile
lock_path=pathlib.Path(tempfile.gettempdir())/('hiking-news-'+hashlib.sha256(str(TARGET.resolve()).encode()).hexdigest()+'.lock')
lock_file=lock_path.open('a')
try:fcntl.flock(lock_file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:
 print('official content collection already running for this target; skipped',flush=True)
 sys.exit(0)
old=json.loads(TARGET.read_text()) if TARGET.exists() else {'schemaVersion':1,'items':[],'sources':[]}
items={r['id']:r for r in old.get('items',[])};states={r['id']:r for r in old.get('sources',[])};failed=0
for source in SOURCES:
 try:
  rows=collect(source)
  for row in rows:items[row['id']]=row
  states[source['id']]={**source,'lastSuccess':dt.datetime.now(dt.timezone.utc).isoformat(),'lastAttempt':dt.datetime.now(dt.timezone.utc).isoformat(),'lastError':None,'lastCollectedCount':len(rows)}
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
# Unique sibling temp file keeps incomplete writes separate from the snapshot.
with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=TARGET.parent,prefix=TARGET.name+'.',suffix='.tmp',delete=False) as file:
 file.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temporary=pathlib.Path(file.name)
try:temporary.replace(TARGET)
finally:temporary.unlink(missing_ok=True)
if failed==len(SOURCES):sys.exit(1)
