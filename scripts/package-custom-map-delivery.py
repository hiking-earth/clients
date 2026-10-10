#!/usr/bin/env python3
"""Package complete, checked custom map output for durable public distribution."""
import argparse, hashlib, json, pathlib, re, zipfile

def package(source, target):
    rows=json.loads((source/'catalog.json').read_text())
    if not isinstance(rows,list) or not 1<=len(rows)<=32:raise ValueError('Invalid map inventory')
    names=set()
    for row in rows:
        name=row.get('name','')
        if not re.fullmatch(r'[a-z0-9-]+\.pmtiles',name) or name in names:raise ValueError('Invalid or duplicate map file')
        names.add(name);file=source/name
        if file.is_symlink() or not file.is_file() or not 127<=file.stat().st_size<=64*1024*1024:raise ValueError('Invalid map file size or link')
        if file.stat().st_size!=row.get('bytes') or hashlib.sha256(file.read_bytes()).hexdigest()!=row.get('sha256'):raise ValueError('Map digest mismatch')
        if not row.get('license') or not row.get('attribution'):raise ValueError('Map reuse attribution missing')
    inventory=source/'source-inventory.json'
    if inventory.is_symlink() or not inventory.is_file():raise ValueError('Source inventory missing')
    if target.exists():raise ValueError('Delivery output already exists')
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(names|{'catalog.json','source-inventory.json'}):archive.write(source/name,name)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:raise ValueError('Delivery archive integrity failed')
    return {'maps':len(rows),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'published':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True,type=pathlib.Path);parser.add_argument('--output',required=True,type=pathlib.Path)
    args=parser.parse_args();print(json.dumps(package(args.input,args.output)))
