#!/usr/bin/env python3
"""Prepare a stable manifest from an already published, reviewed GitHub release.
Never turns draft/old builds into a production release or embeds credentials.
"""
import argparse,hashlib,json,pathlib,re,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('tag');p.add_argument('--android-asset',required=True);p.add_argument('--version-code',type=int,required=True);p.add_argument('--ios-url');a=p.parse_args()
version=a.tag.removeprefix('v')
if not re.fullmatch(r'\d+\.\d+\.\d+',version) or a.version_code<=0:raise SystemExit('invalid version')
if a.ios_url and not re.fullmatch(r'https://(?:apps\.apple\.com|testflight\.apple\.com)/[^\s]+',a.ios_url):raise SystemExit('invalid iOS store entry')
release=json.loads(subprocess.check_output(['gh','api','repos/hiking-earth/clients/releases/tags/'+a.tag]))
if release['draft'] or release['prerelease']:raise SystemExit('only a published stable release can be promoted')
asset=next((x for x in release['assets'] if x['name']==a.android_asset),None)
if not asset or not a.android_asset.endswith('.apk') or asset['size']>200*1024*1024:raise SystemExit('APK asset missing or too large')
with tempfile.TemporaryDirectory() as tmp:
 subprocess.run(['gh','release','download',a.tag,'--repo','hiking-earth/clients','--pattern',a.android_asset,'--dir',tmp],check=True)
 data=(pathlib.Path(tmp)/a.android_asset).read_bytes()
 if len(data)!=asset['size']:raise SystemExit('asset size mismatch')
 sha=hashlib.sha256(data).hexdigest()
root=pathlib.Path(__file__).resolve().parents[1];out=root/'shared/releases/stable.json'
prior=json.loads(out.read_text());prior.update({'schemaVersion':1,'channel':'stable','ready':True,'version':version,'versionCode':a.version_code,'publishedAt':release['published_at'],'notes':release.get('body') or '徒步地球功能更新','android':{'url':asset['browser_download_url'],'sha256':sha,'size':len(data)},'ios':{'url':a.ios_url} if a.ios_url else None})
out.write_text(json.dumps(prior,ensure_ascii=False,indent=2)+'\n');print('Prepared release manifest:',version,sha,'Commit only after unified acceptance; this does not publish a release.')
