#!/usr/bin/env python3
"""Read songs/*/meta.json and refresh the public catalog after adding a song."""
from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
def build():
    entries=[]
    for path in sorted((ROOT/'songs').glob('*/meta.json')):
        meta=json.loads(path.read_text(encoding='utf8'))
        slug=path.parent.name
        if meta.get('id')!=slug:raise ValueError(f'ID mismatch: {path} vs {slug}')
        for field in ('title','artist','audio','lyrics','notes','license'):
            if not meta.get(field):raise ValueError(f'{path}: missing {field}')
        for field in ('audio','lyrics','notes','license'):
            if not (path.parent/meta[field]).is_file():raise FileNotFoundError(f'{path.parent/meta[field]} is missing')
        entries.append({k:meta[k] for k in ('id','title','artist','genre','duration','demo') if k in meta})
    old=ROOT/'catalog.json'
    old.write_text(json.dumps({'version':1,'songs':sorted(entries,key=lambda x:x['title'].casefold())},indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print(f'Rebuilt catalog.json with {len(entries)} songs')
    return entries
if __name__=='__main__':build()
