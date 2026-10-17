#!/usr/bin/env python3
"""Publish only validated public data to the production read branch.
An isolated index preserves the caller's checkout and unrelated production code.
Push is fast-forward only; concurrent production changes stop publication.
"""
import os,subprocess,tempfile,json,hashlib,gzip
from datetime import datetime
from pathlib import Path
from catalog_publication_validation import validate_news_catalog,validate_route_catalog
from catalog_sources import PUBLIC_CATALOG_FILES, PUBLIC_CATALOG_SOURCES
ROOT=Path(__file__).resolve().parents[1]
PATHS=['shared/public-catalog','shared/data/content','shared/data/offline/hk-afcd.json']
def encode(value):
 return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
def git(*args,env=None):
 return subprocess.check_output(['git',*args],cwd=ROOT,env=env,text=True).strip()
def validate():
 for source in PUBLIC_CATALOG_SOURCES:
  base=ROOT/'shared/public-catalog'/source
  manifest=json.loads((base/'manifest.json').read_bytes())
  if manifest.get('schemaVersion')!=1 or manifest.get('pageSize')!=400:raise ValueError('Invalid manifest')
  version=manifest['snapshot']
  if len(version)!=64 or any(c not in '0123456789abcdef' for c in version):raise ValueError('Invalid snapshot')
  source_path=ROOT/'shared'/PUBLIC_CATALOG_FILES[source]
  source_bytes=source_path.read_bytes()
  if hashlib.sha256(source_bytes).hexdigest()!=version:
   raise ValueError(f'{source}: snapshot hash does not match the authoritative source catalog')
  source_data=json.loads(source_bytes)
  key='items' if source=='news' else 'routes'
  if manifest.get('key')!=key:
   raise ValueError(f'{source}: manifest record key differs from the source catalog contract')
  source_metadata={k:v for k,v in source_data.items() if k not in ('routes','items','failures','withheldItems')}
  if encode(manifest.get('metadata'))!=encode(source_metadata):
   raise ValueError(f'{source}: manifest metadata differs from the authoritative source catalog')
  total=manifest.get('total')
  pages=manifest.get('pages')
  expected_page_count=max(1,(len(source_data.get(key,[]))+399)//400)
  if (isinstance(total,bool) or not isinstance(total,int) or total!=len(source_data.get(key,[]))
      or not isinstance(pages,list) or len(pages)!=expected_page_count):
   raise ValueError(f'{source}: manifest page count or total differs from the source catalog')
  rows=[]
  for index,digest in enumerate(pages):
   payload=gzip.decompress((base/version/f'page-{index:05d}.json.gz').read_bytes())
   if hashlib.sha256(payload).hexdigest()!=digest:raise ValueError('Page digest mismatch')
   source_page=source_data[key][index*400:(index+1)*400]
   if payload!=encode(source_page):
    raise ValueError(f'{source}: page bytes differ from the authoritative source catalog')
   rows.extend(source_page)
  if len(rows)!=total:
   raise ValueError(f'{source}: pages differ from the authoritative source catalog')
  packed_index=gzip.decompress((base/version/'index.json.gz').read_bytes())
  if hashlib.sha256(packed_index).hexdigest()!=manifest['indexHash']:raise ValueError('Index digest mismatch')
  expected_index=[[str(row.get('name','')),str(row.get('region','')),page,offset]
                  for page in range(max(1,(len(rows)+399)//400))
                  for offset,row in enumerate(rows[page*400:(page+1)*400])]
  if packed_index!=encode(expected_index):
   raise ValueError(f'{source}: search index differs from the published page records')
  data={**source_metadata,key:rows}
  if source=='news':validate_news_catalog(data)
  else:validate_route_catalog(source,data)
  print(source,len(rows))
def ensure_not_older(parent):
 for source in PUBLIC_CATALOG_SOURCES:
  path=f'shared/public-catalog/{source}/manifest.json'
  if not git('ls-tree','--name-only',parent,'--',path):continue
  previous=json.loads(git('show',parent+':'+path))
  incoming=json.loads((ROOT/path).read_bytes())
  def timestamp(value):
   result=datetime.fromisoformat(value['metadata']['generatedAt'].replace('Z','+00:00'))
   if result.tzinfo is None:raise ValueError('Publication timestamp needs timezone')
   return result
  if timestamp(incoming)<timestamp(previous):raise ValueError(f'{source}: production snapshot is newer; publication stopped')
def publish():
 validate()
 git('fetch','origin','main')
 parent=git('rev-parse','origin/main')
 ensure_not_older(parent)
 with tempfile.TemporaryDirectory(prefix='hiking-public-index-') as temporary:
  env={**os.environ,'GIT_INDEX_FILE':str(Path(temporary)/'index')}
  git('read-tree',parent,env=env)
  git('add','--',*PATHS,env=env)
  tree=git('write-tree',env=env)
  if tree==git('rev-parse',parent+'^{tree}'):
   print('Production public data already matches');return
  commit=git('commit-tree',tree,'-p',parent,'-m','data: publish validated public hiking snapshots',env=env)
  git('push','origin',commit+':refs/heads/main')
  remote=git('ls-remote','origin','refs/heads/main').split()[0]
  if remote!=commit:raise RuntimeError('Remote advanced after push; publication verification incomplete')
  print('Verified production commit',commit)
if __name__=='__main__':publish()
