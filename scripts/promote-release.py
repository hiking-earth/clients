#!/usr/bin/env python3
"""Prepare a stable manifest from an already published, reviewed GitHub release.
Never turns draft/old builds into a production release or embeds credentials.
"""
import argparse,hashlib,json,pathlib,re,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('tag');p.add_argument('--android-asset',required=True);p.add_argument('--version-code',type=int,required=True);p.add_argument('--ios-url');p.add_argument('--acceptance-report',type=pathlib.Path,required=True);a=p.parse_args()
version=a.tag.removeprefix('v')
report=json.loads(a.acceptance_report.read_text())
if report.get('schemaVersion')!=1 or report.get('complete') is not True or not re.fullmatch(r'[a-f0-9]{40}',str(report.get('sourceCommit',''))):raise SystemExit('Complete acceptance report with pinned source commit required')
required=['android','h5','weixin','web','windows','macos','linux']
if any(report.get('platforms',{}).get(name,{}).get('status')!='passed' for name in required):raise SystemExit('Unified acceptance is incomplete; stable manifest was not changed')
if a.ios_url and report.get('platforms',{}).get('ios',{}).get('status')!='passed':raise SystemExit('iOS acceptance required before advertising its store entry')
if not a.ios_url and report.get('platforms',{}).get('ios',{}).get('status') not in ['passed','blocked-owner']:raise SystemExit('iOS must be verified or explicitly waiting for owner signing/credentials')
if report.get('version')!=version or report.get('versionCode')!=a.version_code:raise SystemExit('Acceptance version differs from requested release')
if not re.fullmatch(r'\d+\.\d+\.\d+',version) or a.version_code<=0:raise SystemExit('invalid version')
if a.ios_url and not re.fullmatch(r'https://(?:apps\.apple\.com|testflight\.apple\.com)/[^\s]+',a.ios_url):raise SystemExit('invalid iOS store entry')
release=json.loads(subprocess.check_output(['gh','api','repos/hiking-earth/clients/releases/tags/'+a.tag]))
tag_commit=json.loads(subprocess.check_output(['gh','api','repos/hiking-earth/clients/commits/'+a.tag]))['sha']
if tag_commit!=report['sourceCommit']:raise SystemExit('Release tag differs from the accepted source commit')
if release['draft'] or release['prerelease']:raise SystemExit('only a published stable release can be promoted')
asset=next((x for x in release['assets'] if x['name']==a.android_asset),None)
if not asset or not a.android_asset.endswith('.apk') or asset['size']>200*1024*1024:raise SystemExit('APK asset missing or too large')
with tempfile.TemporaryDirectory() as tmp:
 subprocess.run(['gh','release','download',a.tag,'--repo','hiking-earth/clients','--pattern',a.android_asset,'--dir',tmp],check=True)
 data=(pathlib.Path(tmp)/a.android_asset).read_bytes()
 if len(data)!=asset['size']:raise SystemExit('asset size mismatch')
 sha=hashlib.sha256(data).hexdigest()
 if sha!=report['platforms']['android'].get('artifactSha256'):raise SystemExit('Published APK differs from the accepted Android artifact')
root=pathlib.Path(__file__).resolve().parents[1];out=root/'shared/releases/stable.json'
prior=json.loads(out.read_text());prior.update({'schemaVersion':1,'channel':'stable','ready':True,'version':version,'versionCode':a.version_code,'publishedAt':release['published_at'],'notes':release.get('body') or '徒步地球功能更新','android':{'url':asset['browser_download_url'],'sha256':sha,'size':len(data)},'ios':{'url':a.ios_url} if a.ios_url else None})
out.write_text(json.dumps(prior,ensure_ascii=False,indent=2)+'\n');print('Prepared release manifest:',version,sha,'Commit only after unified acceptance; this does not publish a release.')
