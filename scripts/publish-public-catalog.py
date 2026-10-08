#!/usr/bin/env python3
"""Publish only validated public data to the production read branch.
An isolated index preserves the caller's checkout and unrelated production code.
Push is fast-forward only; concurrent production changes stop publication.
"""
import os,subprocess,tempfile,json,hashlib,gzip
from pathlib import Path
from catalog_publication_validation import validate_news_catalog,validate_route_catalog
ROOT=Path(__file__).resolve().parents[1]
PATHS=['shared/public-catalog','shared/data/content','shared/data/offline/hk-afcd.json']
def git(*args,env=None):
 return subprocess.check_output(['git',*args],cwd=ROOT,env=env,text=True).strip()
def validate():
 for source in ('osm','usfs','hk','news'):
  base=ROOT/'shared/public-catalog'/source
  manifest=json.loads((base/'manifest.json').read_bytes())
  if manifest.get('schemaVersion')!=1 or manifest.get('pageSize')!=400:raise ValueError('Invalid manifest')
  version=manifest['snapshot']
  if len(version)!=64 or any(c not in '0123456789abcdef' for c in version):raise ValueError('Invalid snapshot')
  rows=[]
  for index,digest in enumerate(manifest['pages']):
   payload=gzip.decompress((base/version/f'page-{index:05d}.json.gz').read_bytes())
   if hashlib.sha256(payload).hexdigest()!=digest:raise ValueError('Page digest mismatch')
   rows.extend(json.loads(payload))
  if len(rows)!=manifest['total']:raise ValueError('Incomplete catalog')
  index=gzip.decompress((base/version/'index.json.gz').read_bytes())
  if hashlib.sha256(index).hexdigest()!=manifest['indexHash']:raise ValueError('Index digest mismatch')
  data={**manifest['metadata'],manifest['key']:rows}
  if source=='news':validate_news_catalog(data)
  else:validate_route_catalog(source,data)
  print(source,len(rows))
def publish():
 validate()
 git('fetch','origin','main')
 parent=git('rev-parse','origin/main')
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
