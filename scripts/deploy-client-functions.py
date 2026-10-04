#!/usr/bin/env python3
"""Deploy source with logged-in CloudBase CLI; preserve prior remote code.
Not a business test. Stops at first failure and never prints credentials.
"""
import argparse,pathlib,subprocess,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--cloudbase-cli',required=True);p.add_argument('--node',default='node');p.add_argument('--env',default='cloud1-d9g4fl3fu2491914f');p.add_argument('--backup-dir',required=True);p.add_argument('--functions',nargs='+',default=['client-api','social-manage','route-manage']);a=p.parse_args();base=[a.node,a.cloudbase_cli]
subprocess.run(['python3',str(ROOT/'app/scripts/compose-client-api.py')],check=True)
backup=pathlib.Path(a.backup_dir);backup.mkdir(parents=True,exist_ok=True)
allowed={folder.name for folder in (ROOT/'app/cloudfunctions').iterdir() if folder.is_dir()}
for name in a.functions:
 if name not in allowed or name=='init-db':raise SystemExit('Unknown or provisioning-only function')
 # Existing functions must be recoverable before update. New functions use create first.
 result=subprocess.run(base+['fn','code','download',name,str(backup/name),'-e',a.env,'--json'],cwd=ROOT/'app',capture_output=True,text=True)
 if result.returncode:raise SystemExit('Backup failed for '+name+'; deployment stopped. Provision a missing function separately.')
 command=base+['fn','code','update',name,'-e',a.env,'--json']
 result=subprocess.run(command,cwd=ROOT/'app',capture_output=True,text=True)
 if result.returncode:raise SystemExit('Source deployment failed for '+name+'; inspect local CLI diagnostic without sharing credentials.')
 print('Deployed source:',name,'Prior version retained:',backup/name,flush=True)
print('Deployment commands succeeded; verify remote file hashes and perform unified acceptance separately.')
