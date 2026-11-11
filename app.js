/* NEON Karaoke: completely static, no network requests beyond the site's own song files.
   Microphone audio never leaves the browser. All chart times are in seconds. */
'use strict';
const $ = id => document.getElementById(id);
const audio=$('audio'), canvas=$('pitchCanvas'), ctx=canvas.getContext('2d');
const state={catalog:[], filtered:[], song:null, notes:[],lines:[], micStream:null, micContext:null, analyser:null, pitchBuf:null, micHistory:[], lastPitch:null, lastLyric:-999, scoreNumerator:0,scoreDenominator:0,streak:0,reviewed:0,perNote:new Map(),currentNote:-1,lastFrame:0,loading:0,dragging:false,octave:false,tolerance:1,offset:0,pitchTimer:0};
const toTime=s=>{if(!Number.isFinite(s))return '0:00';const m=Math.floor(Math.max(0,s)/60),sec=Math.floor(Math.max(0,s)%60);return `${m}:${String(sec).padStart(2,'0')}`};
const safeStore=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const getStore=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
const clamp=(a,lo,hi)=>Math.max(lo,Math.min(a,hi));
const status=(s,kind='')=>{$('status').textContent=s;$('status').className='notice '+kind};
const filename=s=>String(s||'').replace(/[^a-z0-9_.\-]/gi,'');
const srcFor=(id,file)=>`songs/${encodeURIComponent(filename(id))}/${encodeURIComponent(filename(file))}`;
const loadedBest=()=>{const value=state.song&&getStore('neon:best:'+state.song.id,null);$('best').textContent=value===null?'—':`${value}%`};
const validatePath=p=>typeof p==='string'&&/^[\w.\-]+$/.test(p)&&!p.startsWith('.')&&p!=='..';
function drawCatalog(){
 const q=$('search').value.trim().toLowerCase();const genre=$('genre').value;
 state.filtered=state.catalog.filter(s=>(genre==='all'||s.genre===genre)&&`${s.title} ${s.artist}`.toLowerCase().includes(q));
 const root=$('songList');root.replaceChildren();$('songCount').textContent=`${state.filtered.length} / ${state.catalog.length}`;
 if(!state.filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No songs matched your search.';root.append(empty);return}
 state.filtered.forEach((item,i)=>{const btn=document.createElement('button');btn.className='song'+(state.song?.id===item.id?' selected':'');btn.type='button';btn.setAttribute('role','listitem');btn.setAttribute('aria-label',`Load ${item.title} by ${item.artist}`);
   const n=document.createElement('span');n.className='num';n.textContent=String(i+1).padStart(2,'0');const txt=document.createElement('span');txt.className='songtext';const title=document.createElement('strong');title.textContent=item.title;const sub=document.createElement('small');sub.textContent=item.artist;txt.append(title,sub);const len=document.createElement('span');len.className='length';len.textContent=toTime(item.duration);btn.append(n,txt,len);btn.addEventListener('click',()=>loadSong(item));root.append(btn)});
}
async function loadCatalog(){
 try{const r=await fetch('./catalog.json',{cache:'no-cache'});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();if(!Array.isArray(data.songs))throw Error('catalog.json missing songs[]');
 state.catalog=data.songs.filter(s=>s.id&&s.title&&s.artist&&validatePath(s.id));$('libraryStatus').textContent=`${state.catalog.length} songs • self-hosted`;
 const genres=[...new Set(state.catalog.map(s=>s.genre).filter(Boolean))].sort();for(const name of genres){const opt=document.createElement('option');opt.value=name;opt.textContent=name;$('genre').append(opt)}drawCatalog();
 if(state.catalog.length){const id=new URLSearchParams(location.search).get('song');await loadSong(state.catalog.find(s=>s.id===id)||state.catalog[0]);}
 else status('Your library is empty. Add a song folder and update catalog.json.','bad');
 }catch(e){$('libraryStatus').textContent='Could not load catalog';$('songList').textContent='Catalog unavailable. Serve this folder through GitHub Pages or a local HTTP server.';status(`Failed to open catalog.json: ${e.message}. Run python -m http.server here, or publish to GitHub Pages.`, 'bad')}
}
function parseLRC(txt){const lines=[];for(const line of txt.split(/\r?\n/)){const text=line.replace(/\[(?:\d+:)?\d{2}:\d{2}(?:\.\d{1,3})?\]/g,'').trim();const matches=[...line.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];for(const m of matches){const fraction=m[3]?Number('0.'+m[3]):0;const time=Number(m[1])*60+Number(m[2])+fraction;if(text)lines.push({time,text})}}return lines.sort((a,b)=>a.time-b.time)}
async function loadSong(item){
 const token=++state.loading;audio.pause();audio.removeAttribute('src');audio.load();$('play').textContent='▶ Play';$('play').disabled=true;$('back').disabled=true;$('seek').disabled=true;state.song=null;state.notes=[];state.lines=[];state.micHistory=[];state.lastLyric=-999;resetScore();
 $('trackTitle').textContent='Loading '+item.title+'…';$('trackInfo').textContent=item.artist;status('Loading MP3, lyrics, and pitch chart…');
 try{const metapath=srcFor(item.id,'meta.json');const response=await fetch(metapath);if(!response.ok)throw Error('Song metadata HTTP '+response.status);const meta=await response.json();if(token!==state.loading)return;
 if(![meta.audio,meta.lyrics,meta.notes].every(validatePath))throw Error('Invalid song asset name');
 const [lyricsResponse,notesResponse]=await Promise.all([fetch(srcFor(item.id,meta.lyrics)),fetch(srcFor(item.id,meta.notes))]);
 if(!lyricsResponse.ok||!notesResponse.ok)throw Error('Lyrics or notes file missing');
 const [lrc,notesData]=await Promise.all([lyricsResponse.text(),notesResponse.json()]);if(token!==state.loading)return;
 if(!Array.isArray(notesData.notes))throw Error('notes.json missing notes[]');
 state.song=meta;state.notes=notesData.notes.map((n,i)=>({...n,start:Number(n.start),duration:Number(n.duration),midi:Number(n.midi),index:i})).filter(n=>Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0&&Number.isFinite(n.midi)).sort((a,b)=>a.start-b.start);
 state.lines=parseLRC(lrc);if(!state.notes.length)throw Error('No usable pitch notes in this chart');
 audio.src=srcFor(item.id,meta.audio);audio.volume=Number($('volume').value);audio.load();
 $('trackTitle').textContent=meta.title;$('trackInfo').textContent=`${meta.artist}  ·  ${meta.genre||'Karaoke'}  ·  ${meta.key||'Original key'}  ·  ${meta.bpm||'—'} BPM`;
 $('songEyebrow').textContent='NOW SELECTED · '+(meta.demo?'PRACTICE ARRANGEMENT':'KARAOKE TRACK');$('stageFile').textContent=`/ player / ${meta.id}`;
 $('play').disabled=false;$('back').disabled=false;$('seek').disabled=false;$('elapsed').textContent='0:00';$('duration').textContent=toTime(meta.duration);
 drawCatalog();drawLyrics();drawPitch();loadedBest();
 try{history.replaceState(null,'',location.pathname+'?song='+encodeURIComponent(item.id))}catch{}
 status(`${meta.title} ready. Press Play, enable mic, then sing the displayed lyrics.`, 'good');
 }catch(e){if(token!==state.loading)return;$('trackTitle').textContent='Cannot load this song';$('trackInfo').textContent=item.title;status(e.message,'bad');drawPitch()}
}
function resetScore(){state.scoreNumerator=0;state.scoreDenominator=0;state.streak=0;state.reviewed=0;state.perNote.clear();state.micHistory=[];state.lastFrame=0;state.currentNote=-1;$('score').textContent='—';$('streak').textContent='0'}
function currentTime(){return audio.currentTime||0}
function chartTime(){return currentTime()-state.offset/1000}
function activeNote(t){let lo=0,hi=state.notes.length-1;while(lo<=hi){const mid=(lo+hi)>>1;const n=state.notes[mid];if(t<n.start)hi=mid-1;else lo=mid+1;}const n=state.notes[hi];return n&&t<n.start+n.duration?n:null}
function commitNote(n){if(!n)return;const record=state.perNote.get(n.index);if(!record||record.time<Math.min(.25,n.duration*.28))return;const accuracy=record.good/Math.max(record.time,.0001);if(accuracy>.68){state.streak++;$('streak').textContent=String(state.streak)}else{state.streak=0;$('streak').textContent='0'}}
function performScoring(t,now){if(audio.paused||!state.notes.length||!state.micStream){state.lastFrame=now;return}
 const dt=clamp(state.lastFrame?(now-state.lastFrame)/1000:0,0,.09);state.lastFrame=now;
 if(!dt)return;
 const note=activeNote(t);
 if(state.currentNote!==note?.index){if(state.currentNote>=0){commitNote(state.notes.find(n=>n.index===state.currentNote));}state.currentNote=note?.index??-1;}
 if(!note)return;
 state.scoreDenominator+=dt;let gain=0;
 if(state.lastPitch?.pitch&&now-state.lastPitch.time<220){let delta=Math.abs(state.lastPitch.pitch-note.midi);if(state.octave)delta=Math.min(...[-2,-1,0,1,2].map(v=>Math.abs(state.lastPitch.pitch-note.midi+12*v)));
 gain=clamp(1-delta/state.tolerance,0,1);
 }
 state.scoreNumerator+=gain*dt;const rec=state.perNote.get(note.index)||{time:0,good:0};rec.time+=dt;rec.good+=gain*dt;state.perNote.set(note.index,rec);
 $('score').textContent=Math.round(100*state.scoreNumerator/Math.max(.001,state.scoreDenominator))+'%';
}
function saveBest(){if(!state.song||state.scoreDenominator<3)return;const accuracy=Math.round(100*state.scoreNumerator/state.scoreDenominator);const key='neon:best:'+state.song.id;const old=getStore(key,null);if(old===null||accuracy>old){safeStore(key,accuracy);loadedBest()}}
function drawLyrics(){const now=chartTime();let ix=-1;for(let i=0;i<state.lines.length;i++){if(now>=state.lines[i].time-.05)ix=i;else break}if(ix===state.lastLyric)return;state.lastLyric=ix;const root=$('lyrics');root.replaceChildren();if(!state.lines.length){root.textContent='No timed lyrics available for this song.';return}
 for(const [index,type] of [[ix-1,'previous'],[ix,'active'],[ix+1,'next']]){const item=state.lines[index];if(!item)continue;const div=document.createElement('div');div.className='lyricline '+type;div.textContent=item.text;root.append(div)}
 if(ix<0){const div=document.createElement('div');div.className='lyricline next';div.textContent='♪ '+state.lines[0].text;root.append(div)}
}
function chartDimensions(){const dpr=Math.min(2,window.devicePixelRatio||1);const box=canvas.getBoundingClientRect();const w=Math.max(200,Math.floor(box.width*dpr)),h=Math.max(150,Math.floor(box.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}ctx.setTransform(dpr,0,0,dpr,0,0);return {w:w/dpr,h:h/dpr}}
function drawPitch(){const {w,h}=chartDimensions();ctx.clearRect(0,0,w,h);ctx.fillStyle='#100f1a';ctx.fillRect(0,0,w,h);
 const now=chartTime(),scale=72,px0=w*.27;const visible=state.notes.filter(n=>n.start+n.duration>now-3&&n.start<now+(w-px0)/scale+1);
 let center=64;
 const focus=activeNote(now)||visible.find(n=>n.start>now);if(focus)center=focus.midi;
 else if(state.notes.length)center=state.notes[0].midi;
 center=clamp(center,50,82);const y=midi=>h*.49-(midi-center)*12.5;
 ctx.strokeStyle='#292337';ctx.lineWidth=1;
 for(let m=Math.ceil(center-12);m<=center+12;m+=2){const ypos=y(m);if(ypos<0||ypos>h)continue;ctx.beginPath();ctx.moveTo(0,ypos);ctx.lineTo(w,ypos);ctx.stroke();if(m%12===0){ctx.fillStyle='#786984';ctx.font='10px monospace';ctx.fillText('C'+(Math.floor(m/12)-1),5,ypos-3)}}
 for(let s=Math.floor(now)-4;s<now+16;s++){const x=px0+(s-now)*scale;if(s<0||x<0||x>w)continue;ctx.strokeStyle=s%5===0?'#574264':'#2b2638';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.fillStyle='#6d5979';ctx.font='9px monospace';ctx.fillText(toTime(s),x+3,12)}
 for(const n of visible){const x=px0+(n.start-now)*scale,yy=y(n.midi);if(x+n.duration*scale<0||x>w)continue;ctx.fillStyle=n.start<=now&&n.start+n.duration>now?'#d9b4ff':'#a780e9';ctx.fillRect(x,yy-6,Math.max(3,n.duration*scale-2),12);ctx.fillStyle='#ffffff28';ctx.fillRect(x,yy-6,Math.max(3,n.duration*scale-2),2)}
 ctx.strokeStyle='#fcdae4';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px0,0);ctx.lineTo(px0,h);ctx.stroke();
 const history=state.micHistory.filter(p=>p.time>=now-3&&p.time<now+8);if(history.length){ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#72edd4';ctx.beginPath();let first=true,last=0;for(const p of history){const x=px0+(p.time-now)*scale,yy=y(p.midi);if(x<0||x>w||yy<0||yy>h){first=true;continue}if(first||p.time-last>.17)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);first=false;last=p.time}ctx.stroke()}
 $('chartHint').textContent=state.song?'Purple = target note · Green = your microphone · white line = now':'Choose a song to view the note chart.';
}
// YIN difference / cumulative mean normalized difference. Self-contained, no CDN.
function detectPitch(data,realSampleRate){
 // Simplified YIN: difference function, cumulative mean difference, parabolic refinement.
 const stride=Math.max(1,Math.round(realSampleRate/12000));
 const sr=realSampleRate/stride;
 const samples=new Float32Array(Math.floor(data.length/stride));let power=0;
 for(let i=0;i<samples.length;i++){const x=data[i*stride];samples[i]=x;power+=x*x}
 const rms=Math.sqrt(power/samples.length);if(rms<.015)return null;
 const minLag=Math.floor(sr/900),maxLag=Math.min(Math.floor(sr/85),Math.floor(samples.length/2)-1);
 const diff=new Float32Array(maxLag+1),cmnd=new Float32Array(maxLag+1);
 const n=Math.min(720,samples.length-maxLag);
 for(let tau=1;tau<=maxLag;tau++){
   let sum=0;for(let i=0;i<n;i++){const d=samples[i]-samples[i+tau];sum+=d*d}diff[tau]=sum;
 }
 let running=0,best=-1,lowest=1;
 for(let tau=1;tau<=maxLag;tau++){
   running+=diff[tau];cmnd[tau]=running>0?diff[tau]*tau/running:1;
 }
 for(let tau=minLag;tau<=maxLag;tau++){
   if(cmnd[tau]<lowest){lowest=cmnd[tau];best=tau}
   if(cmnd[tau]<.16){while(tau+1<=maxLag&&cmnd[tau+1]<cmnd[tau])tau++;best=tau;lowest=cmnd[tau];break}
 }
 if(best<0||lowest>.27)return null;
 const left=cmnd[Math.max(1,best-1)],mid=cmnd[best],right=cmnd[Math.min(maxLag,best+1)];
 const den=left-2*mid+right;
 const refined=best+(Math.abs(den)>1e-6?clamp(.5*(left-right)/den,-.5,.5):0);
 const hz=sr/refined;if(!Number.isFinite(hz)||hz<80||hz>1100)return null;
 return {hz,pitch:69+12*Math.log2(hz/440),confidence:1-lowest,rms};
}
async function toggleMic(){if(state.micStream){stopMic();return}if(!navigator.mediaDevices?.getUserMedia){status('Microphone access requires HTTPS or localhost and a supported browser.','bad');return}
 try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
 const ac=new(window.AudioContext||window.webkitAudioContext)();await ac.resume();const source=ac.createMediaStreamSource(stream);const analyser=ac.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);state.micStream=stream;state.micContext=ac;state.analyser=analyser;state.pitchBuf=new Float32Array(analyser.fftSize);$('mic').textContent='Disable microphone';$('mic').classList.add('active');status('Microphone ready. Use headphones to avoid detecting the instrumental track.','good');
 }catch(e){status('Microphone permission failed: '+(e?.message||'Unknown error'),'bad')}}
function stopMic(){if(!state.micStream)return;for(const t of state.micStream.getTracks())t.stop();state.micStream=null;state.analyser?.disconnect();state.analyser=null;state.micContext?.close();state.micContext=null;state.lastPitch=null;$('mic').textContent='Enable microphone';$('mic').classList.remove('active');$('currentPitch').textContent='MIC OFF';status('Microphone turned off. Playback still works.')}
function readPitch(now){if(!state.analyser)return;if(now-state.pitchTimer<42)return;state.pitchTimer=now;state.analyser.getFloatTimeDomainData(state.pitchBuf);const result=detectPitch(state.pitchBuf,state.micContext.sampleRate);
 if(result){state.lastPitch={...result,time:now};const midi=result.pitch;const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];const rounded=Math.round(midi);$('currentPitch').textContent=`${names[(rounded+120)%12]}${Math.floor(rounded/12)-1} · ${Math.round(result.hz)} Hz`;
 if(!audio.paused){state.micHistory.push({time:chartTime(),midi});if(state.micHistory.length>180)state.micHistory.shift()}}
 else{$('currentPitch').textContent='LISTENING…';state.lastPitch=null}}
function render(now){readPitch(now);if(state.song){if(!state.dragging){const dur=audio.duration||state.song.duration||1;$('seek').value=String(Math.round(clamp(currentTime()/dur,0,1)*1000))}
 $('elapsed').textContent=toTime(currentTime());performScoring(chartTime(),now);drawLyrics()}drawPitch();requestAnimationFrame(render)}
function bindControls(){
 $('search').addEventListener('input',drawCatalog);$('genre').addEventListener('change',drawCatalog);
 $('play').addEventListener('click',async()=>{if(!state.song)return;try{if(audio.paused){await audio.play();$('play').textContent='❚❚ Pause';state.lastFrame=0}else{audio.pause();$('play').textContent='▶ Play';saveBest()}}catch(e){status('Playback failed: '+e.message,'bad')}});
 $('back').addEventListener('click',()=>{audio.currentTime=0;resetScore();state.lastLyric=-999;drawLyrics()});
 $('mic').addEventListener('click',toggleMic);
 $('seek').addEventListener('pointerdown',()=>{state.dragging=true});$('seek').addEventListener('pointerup',()=>{state.dragging=false});$('seek').addEventListener('input',()=>{if(!state.song)return;audio.currentTime=Number($('seek').value)/1000*(audio.duration||state.song.duration);resetScore();state.lastLyric=-1});
 $('volume').addEventListener('input',()=>{audio.volume=Number($('volume').value)});
 $('tolerance').addEventListener('change',()=>{state.tolerance=Number($('tolerance').value);safeStore('neon:tolerance',state.tolerance)});
 $('offset').addEventListener('input',()=>{state.offset=Number($('offset').value);$('offsetValue').textContent=state.offset+' ms';state.lastLyric=-999;resetScore();safeStore('neon:offset',state.offset)});
 $('octave').addEventListener('change',()=>{state.octave=$('octave').checked;safeStore('neon:octave',state.octave)});
 audio.addEventListener('ended',()=>{$('play').textContent='▶ Play';if(state.currentNote>=0)commitNote(state.notes.find(n=>n.index===state.currentNote));saveBest();status('Song complete! Your session accuracy is '+$('score').textContent+'. Choose another song or replay.','good')});
 audio.addEventListener('pause',()=>{if(!audio.ended){$('play').textContent='▶ Play';saveBest()}});audio.addEventListener('error',()=>{if(state.song)status('Audio could not load. Check that '+state.song.audio+' exists in the song folder.','bad')});
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();$('play').click()}});
 addEventListener('pagehide',()=>{saveBest();if(state.micStream)stopMic()});addEventListener('resize',drawPitch);
 const tolerance=getStore('neon:tolerance',1);if([.55,1,1.5].includes(tolerance)){$('tolerance').value=String(tolerance);state.tolerance=tolerance}
 state.offset=clamp(getStore('neon:offset',0),-500,500);$('offset').value=state.offset;$('offsetValue').textContent=state.offset+' ms';state.octave=Boolean(getStore('neon:octave',false));$('octave').checked=state.octave;
}
bindControls();loadCatalog();requestAnimationFrame(render);
