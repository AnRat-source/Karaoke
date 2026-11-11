#!/usr/bin/env python3
"""Generate compact, original synthesized accompaniment and simplified timed practice charts.
This file is kept in the repository for reproducibility (Python + numpy + ffmpeg).
Melody transcriptions are approximate educational/practice settings, not scholarly scores.
"""
from pathlib import Path
import json, math, subprocess, wave, os, re, io, tempfile
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SONGS=ROOT/'songs'
# Each line: public-domain/traditional lyric and simplified melody as semitone
# offsets from C4 (or A3 for minor songs). :N holds a note for N beats.
TRACKS = [
('twinkle-twinkle','Twinkle, Twinkle, Little Star','Traditional','Family','C major',104,60,[
 ('Twinkle, twinkle, little star','0 0 7 7 9 9 7:2'),
 ('How I wonder what you are','5 5 4 4 2 2 0:2'),
 ('Up above the world so high','7 7 5 5 4 4 2:2'),
 ('Like a diamond in the sky','7 7 5 5 4 4 2:2'),
 ('Twinkle, twinkle, little star','0 0 7 7 9 9 7:2'),
 ('How I wonder what you are','5 5 4 4 2 2 0:2')]),
('jingle-bells','Jingle Bells','James Lord Pierpont','Holiday','C major',122,60,[
 ('Jingle bells, jingle bells','4 4 4:2 4 4 4:2'),
 ('Jingle all the way','4 7 0:2 2 4:4'),
 ('Oh what fun it is to ride','5 5 5 5 5 4 4 4 4'),
 ('In a one-horse open sleigh','4 2 2 4 2:2 7:3'),
 ('Jingle bells, jingle bells','4 4 4:2 4 4 4:2'),
 ('Jingle all the way','4 7 0:2 2 4:4')]),
('amazing-grace','Amazing Grace','John Newton / Traditional','Classic','C major',84,60,[
 ('Amazing grace, how sweet the sound','7 0:2 4 0 4:2 2 0:2 9:2 7:2'),
 ('That saved a soul like me','7 0:2 4 0 4:2 2 7:3'),
 ('I once was lost, but now am found','4:2 7 4 7 9:2 7 4 0:3'),
 ('Was blind, but now I see','7 0:2 4 0 4:2 2 0:3')]),
('auld-lang-syne','Auld Lang Syne','Robert Burns / Traditional','Classic','C major',96,60,[
 ('Should old acquaintance be forgot','7 0 0 0 4:2 2 0 2'),
 ('And never brought to mind','4 4 2 0 2:2 4:2 7:2'),
 ('Should old acquaintance be forgot','7 0 0 0 4:2 2 0 2'),
 ('And days of auld lang syne','4 2 0:2 -3 0:2 0:3')]),
('when-the-saints','When the Saints Go Marching In','Traditional','Gospel','C major',118,60,[
 ('Oh when the saints go marching in','0 4 5 7:2 0 4 5 7:2'),
 ('Oh when the saints go marching in','0 4 5 7:2 4 0 4 2:2'),
 ('Oh Lord I want to be in that number','4 4 2 0:2 4 7 7 5 4 2'),
 ('When the saints go marching in','0 4 5 7 4 0 2 0:3')]),
('yankee-doodle','Yankee Doodle','Traditional','Folk','C major',120,60,[
 ('Yankee Doodle went to town','0 0 2 4 0 4 2 7'),
 ('Riding on a pony','0 0 2 4 0 -1:2 0:2'),
 ('Stuck a feather in his cap','0 0 2 4 5 4 2 0'),
 ('And called it macaroni','7 5 4 2 0 2 0:3')]),
('frere-jacques','Frère Jacques','Traditional','Folk','C major',110,60,[
 ('Frère Jacques, Frère Jacques','0 2 4 0 0 2 4 0'),
 ('Dormez-vous? Dormez-vous?','4 5 7:2 4 5 7:2'),
 ('Sonnez les matines, sonnez les matines','7 9 7 5 4 0 7 9 7 5 4 0'),
 ('Ding, dang, dong; ding, dang, dong','0 7 0:2 0 7 0:2')]),
('oh-susanna','Oh! Susanna','Stephen Foster','Folk','C major',114,60,[
 ('Oh, Susanna, do not cry for me','0 2 4 4 4 2 0 2 0:2'),
 ('For I come from Alabama','0 2 4 7 7 4 2 0'),
 ('With my banjo on my knee','0 2 4 4 2 0 -3 0:2'),
 ('Oh, Susanna, do not cry for me','0 2 4 4 4 2 0 2 0:3')]),
('my-bonnie','My Bonnie Lies over the Ocean','Traditional','Folk','C major',102,60,[
 ('My Bonnie lies over the ocean','7 4 0 2 4 5 7 9 7'),
 ('My Bonnie lies over the sea','7 4 0 2 4 5 4:2 2:2'),
 ('My Bonnie lies over the ocean','7 4 0 2 4 5 7 9 7'),
 ('Oh bring back my Bonnie to me','5 4 2 0 2 4 2 0:3')]),
('clementine','Oh My Darling, Clementine','Percy Montrose / Traditional','Folk','C major',104,60,[
 ('In a cavern, in a canyon','0 0 0 4 7 7 7 4'),
 ('Excavating for a mine','4 4 4 2 0 2 4:3'),
 ('Dwelt a miner, forty-niner','0 0 0 4 7 7 7 4'),
 ('And his daughter Clementine','4 4 4 2 0 2 0:3')]),
('home-on-the-range','Home on the Range','Brewster Higley / Daniel Kelley','Classic','C major',94,60,[
 ('Oh give me a home where the buffalo roam','0 0 0 4 7 7 7 9 7 4 2'),
 ('Where the deer and the antelope play','0 4 4 4 2 0 2 4:3'),
 ('Where seldom is heard a discouraging word','4 5 7 7 7 9 7 5 4 2 0'),
 ('And the skies are not cloudy all day','0 4 7 7 5 4 2 0:3')]),
('swing-low','Swing Low, Sweet Chariot','Traditional spiritual','Gospel','C major',86,60,[
 ('Swing low, sweet chariot','7:2 4:2 7 9 7:3'),
 ('Coming for to carry me home','7 9 7 5 4 2 0:3'),
 ('Swing low, sweet chariot','7:2 4:2 7 9 7:3'),
 ('Coming for to carry me home','7 9 7 5 4 2 0:3')]),
('deck-the-halls','Deck the Halls','Traditional Welsh carol','Holiday','C major',126,60,[
 ('Deck the halls with boughs of holly','7 5 4 2 0 2 4 0'),
 ('Fa la la la la, la la la la','2 4 5 2 4 5 7 4 5'),
 ('Tis the season to be jolly','7 5 4 2 0 2 4 0'),
 ('Fa la la la la, la la la la','2 4 5 2 4 5 7 4 0:2')]),
('we-wish-you','We Wish You a Merry Christmas','Traditional','Holiday','C major',112,60,[
 ('We wish you a merry Christmas','7 0 0 2 0 -1 -3:2'),
 ('We wish you a merry Christmas','9 2 2 4 2 0 -1:2'),
 ('We wish you a merry Christmas','7 4 4 5 4 2 0:2'),
 ('And a happy New Year','2 7 7 9 7:2 0:3')]),
('silent-night','Silent Night','Franz Xaver Gruber / Joseph Mohr','Holiday','C major',86,60,[
 ('Silent night, holy night','7:2 9 7:2 4:3 7:2 9 7:2 4:3'),
 ('All is calm, all is bright','2:2 2 11 11 9 7:3'),
 ('Round yon virgin mother and child','9 9 0 11 9 7 4 7:2'),
 ('Sleep in heavenly peace','5 5 9 7 4:2 0:4')]),
('take-me-out','Take Me Out to the Ball Game','Jack Norworth / Albert von Tilzer','Classic','C major',119,60,[
 ('Take me out to the ball game','0 0 0:2 7 4 2 0:2'),
 ('Take me out with the crowd','4 4 4 7 9 7 4:3'),
 ('Buy me some peanuts and cracker jack','5 5 5 9 7 5 4 2 0'),
 ('I do not care if I never get back','7 9 7 5 4 2 0 2 0:3')]),
('daisy-bell','Daisy Bell (Bicycle Built for Two)','Harry Dacre','Classic','C major',98,60,[
 ('Daisy, Daisy, give me your answer, do','7:3 4:2 0:2 2 4 5 4 2 0:3'),
 ('I am half crazy all for the love of you','2 4 5 7 7 5 4 2 0 -3 0:3'),
 ('It will not be a stylish marriage','0 2 4 5 7 7 9 7:2'),
 ('But you will look sweet upon the seat','9 7 5 4 2 0 2 4 5:2'),
 ('Of a bicycle built for two','4 2 0:2 -3:2 0:4')]),
('greensleeves','Greensleeves','Traditional English ballad','Ballad','A minor',91,57,[
 ('Alas, my love, you do me wrong','0 3 5 7 8 7 5 3 0:2'),
 ('To cast me off discourteously','0 3 5 7 8 10 8 7 5:2'),
 ('For I have loved you well and long','0 3 5 7 8 7 5 3 0:2'),
 ('Delighting in your company','-2 0 3 5 3 0 -2 0:3')]),
('scarborough-fair','Scarborough Fair','Traditional English ballad','Ballad','A minor',87,57,[
 ('Are you going to Scarborough Fair','0 0 7 7 5 3 5 7:3'),
 ('Parsley, sage, rosemary and thyme','7 10 7 5 3 5 0:3'),
 ('Remember me to one who lives there','0 3 5 7 5 3 0 3 5:2'),
 ('She once was a true love of mine','7 5 3 0 -2 0:4')]),
('molly-malone','Molly Malone (Cockles and Mussels)','Traditional Irish song','Folk','C major',106,60,[
 ('In Dublin fair city where girls are so pretty','0 2 4 5 7 4 2 0 2 4 5 7'),
 ('I first set my eyes on sweet Molly Malone','7 9 7 5 4 2 0 2 4 2 0:2'),
 ('As she wheeled her wheelbarrow','0 2 4 5 7 9 7 5:2'),
 ('Through streets broad and narrow','7 5 4 2 0 2 0:3'),
 ('Crying cockles and mussels alive alive oh','0 2 4 5 7 9 7 5 4 2 0:3')]),
]

def parse(phrase):
    out=[]
    for word in phrase.split():
        n,d=(word.split(':')+['1'])[:2]
        out.append((float(n),float(d)))
    return out

RATE=22050
TWOPI=2*np.pi

def mix(audio, time, seconds, midi, amplitude=0.11, kind='pluck'):
    if seconds<=0:return
    start=int(time*RATE)
    if start>=len(audio):return
    count=min(int(seconds*RATE),len(audio)-start)
    if count<=0:return
    t=np.arange(count,dtype=np.float32)/RATE
    f=440*2**((midi-69)/12)
    if kind=='pluck':
        envelope=(1-np.exp(-36*t))*np.exp(-2.15*t/max(seconds,.2))
        v=(np.sin(TWOPI*f*t)+0.26*np.sin(TWOPI*f*2*t)+0.09*np.sin(TWOPI*f*3*t))*envelope
    elif kind=='pad':
        envelope=np.minimum(1,t/.07)*np.minimum(1,(seconds-t)/.22)
        v=(np.sin(TWOPI*f*t)+0.22*np.sin(TWOPI*f*2*t))*envelope
    elif kind=='bass':
        envelope=(1-np.exp(-20*t))*np.exp(-1.5*t/max(seconds,.15))
        v=(np.sin(TWOPI*f*t)+.28*np.sin(TWOPI*f*2*t))*envelope
    elif kind=='guide':
        envelope=np.minimum(1,t/.025)*np.minimum(1,(seconds-t)/.08)
        v=(np.sin(TWOPI*f*t)+0.12*np.sin(TWOPI*f*2*t))*envelope
    else:return
    audio[start:start+count] += amplitude*v

def render(notes, bpm, root, dest):
    total=max(n['start']+n['duration'] for n in notes)+2.8
    audio=np.zeros(int(RATE*total),dtype=np.float32)
    sec_per_beat=60/bpm
    root=round(root)
    # An intentionally fresh, simple synth arrangement: no third-party recording.
    chords=[[root,root+4,root+7],[root+9,root+12,root+16],[root+5,root+9,root+12],[root+7,root+11,root+14]]
    beat=0
    while beat*sec_per_beat<total-1.1:
        ch=chords[(beat//4)%4]; at=beat*sec_per_beat
        mix(audio,at,3.72*sec_per_beat,ch[0],.023,'pad')
        mix(audio,at,3.72*sec_per_beat,ch[1],.016,'pad')
        mix(audio,at,3.72*sec_per_beat,ch[2],.015,'pad')
        for k in range(8):
            nt=ch[[0,1,2,1,0,2,1,2][k]]+12
            mix(audio,at+k*.5*sec_per_beat,.6*sec_per_beat,nt,.05,'pluck')
        for k in (0,2):mix(audio,at+k*sec_per_beat,1.1*sec_per_beat,ch[0]-12,.076,'bass')
        beat+=4
    # Deliberately quiet melody guide; chart reference matches this guide exactly.
    for n in notes:
        mix(audio,n['start'],n['duration']*.94,n['midi'],.075,'guide')
    audio=np.tanh(audio*1.12)
    fade=int(.85*RATE)
    audio[:fade]*=np.linspace(0,1,fade)
    audio[-fade:]*=np.linspace(1,0,fade)
    audio=np.int16(np.clip(audio*32767,-32768,32767))
    with tempfile.NamedTemporaryFile(suffix='.wav',delete=False) as f:tmp=f.name
    try:
        with wave.open(tmp,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(audio.tobytes())
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',tmp,'-codec:a','libmp3lame','-qscale:a','5',str(dest)],check=True)
    finally:os.unlink(tmp)
    return round(total,2)

def lrcstamp(t):
    mm=int(t)//60; seconds=t-mm*60
    return f'{mm:02d}:{seconds:05.2f}'

def generate():
    entries=[]
    for slug,title,artist,genre,key,bpm,root,phrases in TRACKS:
        dest=SONGS/slug;dest.mkdir(parents=True,exist_ok=True)
        notes=[];lines=[];beat=4
        for line_ix,(line,pattern) in enumerate(phrases):
            pnotes=parse(pattern)
            start=beat*60/bpm
            for j,(degree,beats) in enumerate(pnotes):
                t=beat*60/bpm;dur=beats*60/bpm
                notes.append({'start':round(t,3),'duration':round(dur,3),'midi':int(root+degree),'line':line_ix})
                beat+=beats
            end=beat*60/bpm
            lines.append({'time':round(start,3),'end':round(end,3),'text':line})
            beat+=1
        dur=render(notes,bpm,root,dest/'backing.mp3')
        (dest/'notes.json').write_text(json.dumps({'format':'neon-notes-v1','tempo':bpm,'notes':notes},indent=2,ensure_ascii=False)+'\n',encoding='utf8')
        lrc='[ti:'+title+']\n[ar:'+artist+']\n'+'\n'.join('['+lrcstamp(l['time'])+']'+l['text'] for l in lines)+'\n'
        (dest/'lyrics.lrc').write_text(lrc,encoding='utf8')
        meta={'id':slug,'title':title,'artist':artist,'genre':genre,'key':key,'bpm':bpm,'duration':dur,'audio':'backing.mp3','lyrics':'lyrics.lrc','notes':'notes.json','license':'LICENSE.txt','demo':True,'language':'en' if slug!='frere-jacques' else 'fr','description':'Short, simplified practice arrangement with a quiet synthesized melody guide.'}
        (dest/'meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        # UltraStar reference has semitone offsets relative to C4; #RELATIVE:no
        chart=[f'#TITLE:{title}',f'#ARTIST:{artist}',f'#BPM:{bpm}', '#GAP:0','#CREATOR:NEON Karaoke library (practice arrangement)','#RELATIVE:NO']
        for line_ix,l in enumerate(lines):
            these=[n for n in notes if n['line']==line_ix]
            words=l['text'].split()
            for ni,n in enumerate(these):
                # Chart events are in beats (not seconds); visible text is line-based via LRC.
                b=int(round(n['start']*bpm*4/60)); d=int(round(n['duration']*bpm*4/60)); pitch=n['midi']-60
                text=(' '+words[min(len(words)-1,int(ni*len(words)/len(these)))]) if words else ' la'
                chart.append(f': {b} {max(1,d)} {pitch} {text}')
            if line_ix!=len(lines)-1:chart.append(f'- {int(round((l["end"]+.20)*bpm*4/60))}')
        chart.append('E')
        (dest/'chart.txt').write_text('\n'.join(chart)+'\n',encoding='utf8')
        license_text=f'''Song: {title}\nOriginal authors / tradition: {artist}\n\nCOMPOSITION AND LYRICS\nHistorical/traditional song selected for public-domain educational demo use.\nThis project does not claim ownership of the traditional melody or text.\nPublic-domain status can vary by jurisdiction; verify before commercial distribution.\n\nRECORDING AND CHART\nThe "backing.mp3" recording was freshly synthesized for this project from\na simplified, newly programmed practice arrangement. No commercial audio\nrecordings or commercially released karaoke backing tracks are included.\nThe note chart and synchronized-LRC timing data were freshly created here.\nThese newly generated assets are dedicated to the public domain under CC0 1.0,\nto the extent the contributor is legally able to do so.\nSee https://creativecommons.org/publicdomain/zero/1.0/\n\nThis is a short simplified PRACTICE version, not a faithful full performance\nof any published arrangement.\n'''
        (dest/'LICENSE.txt').write_text(license_text,encoding='utf8')
        entries.append({'id':slug,'title':title,'artist':artist,'genre':genre,'duration':dur,'demo':True})
        print(f'{len(entries):2d}. {title:39s} {dur:5.1f}s  {(dest/"backing.mp3").stat().st_size//1024:4d} KB',flush=True)
    (ROOT/'catalog.json').write_text(json.dumps({'version':1,'generated':'2026-11-11','songs':entries},indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print('Generated',len(entries),'songs; bytes:',sum((SONGS/x['id']/'backing.mp3').stat().st_size for x in entries))

if __name__=='__main__':generate()
