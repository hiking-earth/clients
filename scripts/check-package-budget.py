#!/usr/bin/env python3
"""Reject installer or inspected installed contents >= 500 decimal MB."""
import argparse,json,pathlib,tarfile,zipfile
LIMIT=500_000_000
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('paths',nargs='+');parser.add_argument('--report')
args=parser.parse_args();rows=[];failed=False
for value in args.paths:
 p=pathlib.Path(value).resolve()
 if not p.exists():raise SystemExit('Missing build output: '+str(p))
 if p.is_dir():
  size=sum(f.stat().st_size for f in p.rglob('*') if f.is_file() and not f.is_symlink())
  row={'path':str(p),'installedBytes':size,'coverage':'directory contents, symlinks not counted twice'}
 else:
  size=p.stat().st_size;row={'path':str(p),'downloadBytes':size,'coverage':'download only'}
  if zipfile.is_zipfile(p):
   with zipfile.ZipFile(p) as z:unpacked=sum(i.file_size for i in z.infolist())
   row.update(installedBytes=unpacked,coverage='ZIP declared unpacked file sizes');size=max(size,unpacked)
  elif p.name.endswith(('.tar.gz','.tgz','.tar')):
   with tarfile.open(p) as t:unpacked=sum(i.size for i in t if i.isfile())
   row.update(installedBytes=unpacked,coverage='TAR unpacked regular file sizes');size=max(size,unpacked)
 row.update(limitBytes=LIMIT,passed=size<LIMIT);failed|=not row['passed'];rows.append(row)
report={'schemaVersion':1,'limitBytes':LIMIT,'passed':not failed,'files':rows,'note':'Installed payload of DMG/MSI/AppImage/DEB requires separate directory measurement; runtime user data is excluded.'}
text=json.dumps(report,ensure_ascii=False,indent=2)
if args.report:pathlib.Path(args.report).write_text(text+'\n')
print(text);raise SystemExit(1 if failed else 0)
