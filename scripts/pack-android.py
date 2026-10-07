#!/usr/bin/env python3
"""Prepare a private config using the existing signing identity and submit HBuilder pack.
Requires an imported project and a logged-in HBuilderX, not a password in arguments.
"""
import argparse,json,pathlib,os,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--hbuilder',default='/Applications/HBuilderX.app/Contents/MacOS/cli');p.add_argument('--signing-config',required=True);p.add_argument('--private-output',required=True);p.add_argument('--project',default=str(ROOT/'app'));a=p.parse_args();source=pathlib.Path(a.signing_config).resolve();output=pathlib.Path(a.private_output).resolve()
if output==source or source==ROOT or ROOT in source.parents or output==ROOT or ROOT in output.parents:raise SystemExit('Keep signing config and generated private config outside the repository')
config=json.loads(source.read_text());config['project']=str(pathlib.Path(a.project).resolve());config['platform']='android';config['safemode']=True
if config.get('android',{}).get('packagename')!='earth.hiking.app':raise SystemExit('Unexpected upgrade package identity')
certificate=pathlib.Path(config['android'].get('certfile','')).resolve()
if not certificate.is_file():raise SystemExit('Signing certificate missing')
if certificate==ROOT or ROOT in certificate.parents:raise SystemExit('Keep Android signing certificate outside the repository')
subprocess.run(['node',str(ROOT/'app/scripts/build-map-viewer.cjs')],cwd=ROOT/'app',check=True)
output.parent.mkdir(parents=True,exist_ok=True);os.chmod(output.parent,0o700)
fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(config,f,ensure_ascii=False)
# HBuilder may include download URLs in its output; inspect locally and never persist secrets.
log=output.with_suffix('.log')
result=subprocess.run([a.hbuilder,'pack','--config',str(output),'--project',config['project'],'--platform','android','--safemode','true'],capture_output=True,text=True)
fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(result.stdout+'\n'+result.stderr)
if result.returncode or any(message in result.stdout+result.stderr for message in ['编译失败','打包失败','Cannot find module','当前命令执行错误','未检测到已打开的HBuilderX']):raise SystemExit('HBuilder did not produce a successful build; private diagnostic: '+str(log))
print('Submitted Android build. Query HBuilder pack status and verify package identity/signature before release.')
