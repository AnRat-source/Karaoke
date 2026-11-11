#!/usr/bin/env python3
"""Add a legally cleared MP3/OGG plus UltraStar TXT or notes JSON to the static library.
Usage: python scripts/add_song.py --slug my-song --title 'My Song' --artist Me \
  --audio recording.mp3 --ultrastar chart.txt --license-file rights.txt
"""
from pathlib import Path
import argparse, json, re, shutil, subprocess, sys
from rebuild_catalog import build
ROOT=Path(__file__).resolve().parents[1]

def ultrastar_to_notes(path):
    text=path.read_text(encoding='utf-8-sig')
    headers={};notes=[];lines=[];parts=[];first=None
    def flush():
        nonlocal first, parts
        if parts and first is not None:
            line=''.join(parts).strip();line=' '.join(line.split())
            if line:lines.append((first,line))
        first=None;parts=[]
    for raw in text.splitlines():
        ln=raw.strip()
        if ln.startswith('#') and ':' in ln:
            k,v=ln[1:].split(':',1);headers[k.upper()]=v.strip()
    bpm=float(headers.get('BPM','0').replace(',','.'))
    if bpm<=0:raise ValueError('UltraStar requires positive #BPM header')
    if headers.get('RELATIVE','NO').upper() in ('YES','TRUE'):
        raise ValueError('Relative UltraStar timing not supported. Convert to absolute beats first.')
    gap=float(headers.get('GAP','0').replace(',','.'))/1000
    for raw in text.splitlines():
        if not raw:continue
        if raw[0] in (':','*','F','R','G'):
            m=re.match(r'^[:*FRG]\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s*(.*)$',raw)
            if not m:continue
            beat,length,pitch,lyric=m.groups();beat=int(beat);length=int(length);pitch=int(pitch)
            if first is None:first=gap+beat*60/(bpm*4)
            parts.append(lyric)
            if raw[0] not in ('F','R'):
                notes.append({'start':round(gap+beat*60/(bpm*4),3),'duration':round(length*60/(bpm*4),3),'midi':pitch+60,'line':len(lines)})
        elif raw[0] in ('-','E'):flush()
    flush()
    if not notes:raise ValueError('Chart has no usable pitched notes')
    return notes,lines,bpm,headers

def lrc_timestamp(t):
    sec=max(0,float(t));return f'{int(sec//60):02d}:{sec%60:05.2f}'

def duration(path,notes):
    try:
        output=subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],stderr=subprocess.DEVNULL)
        return round(float(output),2)
    except Exception:
        return round(max(n['start']+n['duration'] for n in notes)+1,2)

def main():
    ap=argparse.ArgumentParser(description='Add a song to the GitHub Pages library')
    for f in ('slug','title','artist','audio','license-file'):ap.add_argument('--'+f,required=True)
    source=ap.add_mutually_exclusive_group(required=True);source.add_argument('--ultrastar');source.add_argument('--notes-json')
    ap.add_argument('--lyrics',help='Optional timed .lrc file. If omitted with --ultrastar, lyrics are generated from chart text.')
    ap.add_argument('--genre',default='Other');ap.add_argument('--key',default='Unknown');ap.add_argument('--language',default='en');args=ap.parse_args()
    if not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',args.slug):ap.error('Use a lowercase hyphen-separated slug')
    audio=Path(args.audio).resolve();license_file=Path(args.license_file).resolve();dest=ROOT/'songs'/args.slug
    if dest.exists():ap.error(f'{dest} already exists: choose a different slug')
    if audio.suffix.lower() not in ('.mp3','.ogg','.wav','.m4a'):ap.error('Audio must be an MP3, OGG, WAV or M4A')
    if not audio.is_file() or not license_file.is_file():ap.error('Audio and license evidence must exist')
    if audio.stat().st_size>100*1024*1024:ap.error('GitHub rejects files larger than 100MB')
    if args.ultrastar:
        notes,auto_lines,bpm,headers=ultrastar_to_notes(Path(args.ultrastar))
    else:
        raw=json.loads(Path(args.notes_json).read_text(encoding='utf8'));notes=raw['notes'];auto_lines=[];bpm=raw.get('tempo',120)
    if not notes:ap.error('No notes supplied')
    if args.lyrics:
        lrc=Path(args.lyrics).read_text(encoding='utf-8-sig')
    else:
        if not auto_lines:ap.error('Provide --lyrics when using notes JSON')
        lrc=f'[ti:{args.title}]\n[ar:{args.artist}]\n'+'\n'.join(f'[{lrc_timestamp(t)}]{word}' for t,word in auto_lines)+'\n'
    dest.mkdir(parents=True)
    shutil.copy2(audio,dest/('backing'+audio.suffix.lower()))
    (dest/'lyrics.lrc').write_text(lrc,encoding='utf8')
    (dest/'notes.json').write_text(json.dumps({'format':'neon-notes-v1','tempo':bpm,'notes':notes},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    shutil.copy2(license_file,dest/'LICENSE.txt')
    if args.ultrastar:shutil.copy2(args.ultrastar,dest/'chart.txt')
    metadata={'id':args.slug,'title':args.title,'artist':args.artist,'genre':args.genre,'key':args.key,'bpm':bpm,'duration':duration(audio,notes),'audio':'backing'+audio.suffix.lower(),'lyrics':'lyrics.lrc','notes':'notes.json','license':'LICENSE.txt','demo':False,'language':args.language}
    (dest/'meta.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    build()
    print(f'Added {args.title} at songs/{args.slug}/')
    print('Verify lyric timing, reference notes, and playback in the player before publishing.')

if __name__=='__main__':main()
