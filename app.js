/* STAR SING: static catalogue, official YouTube embeds, on-demand LRCLIB lyrics.
   No music or lyrics are copied into this repository. */
'use strict';

const $ = id => document.getElementById(id);
const state = { catalog: [], song: null, player: null, playerReady: false, lines: [], notes: [], lyricOffset: 0, noteOffset: 0, lastLine: -2, currentTime: 0 };
const canvas = $('pitchCanvas');
const ctx = canvas.getContext('2d');
const toTime = value => { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const restore = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const validUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

function setStatus(message, bad = false) { const node = $('status'); node.textContent = message; node.classList.toggle('bad', bad); }
function parseLrc(source) {
  const lines = [];
  for (const row of String(source || '').split(/\r?\n/)) {
    const text = row.replace(/\[(?:\d+:)?\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    for (const match of row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)) {
      if (text) lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
function songOffset(kind) { return restore(`star-sing:${state.song?.id}:${kind}`, kind === 'lyrics' ? state.song?.lyricOffsetMs || 0 : state.song?.noteOffsetMs || 0); }
function selectValue(id, value) { $(id).value = String(value); $(`${id}Value`).textContent = `${value} ms`; }

function drawSongs() {
  const query = $('search').value.trim().toLowerCase();
  const rows = state.catalog.filter(song => `${song.title} ${song.artist} ${song.code}`.toLowerCase().includes(query));
  const root = $('songList'); root.replaceChildren(); $('songCount').textContent = String(rows.length).padStart(2, '0');
  if (!rows.length) { const p = document.createElement('p'); p.textContent = 'NO MATCHING SONG CODE.'; root.append(p); return; }
  for (const song of rows) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `song-row${song.id === state.song?.id ? ' active' : ''}`; button.setAttribute('role', 'listitem');
    const code = document.createElement('b'); code.textContent = song.code;
    const info = document.createElement('span'); const title = document.createElement('strong'); title.textContent = song.title; const artist = document.createElement('small'); artist.textContent = song.artist; info.append(title, artist);
    button.append(code, info); button.addEventListener('click', () => loadSong(song)); root.append(button);
  }
}

let resolveYoutube;
const youtubeReady = new Promise(resolve => { resolveYoutube = resolve; });
window.onYouTubeIframeAPIReady = () => resolveYoutube();
function loadYoutubeApi() { const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.append(script); }
function setupPlayer(song) {
  if (!window.YT?.Player) { setStatus('YouTube player is still starting. Please try the song again in a moment.'); return; }
  const options = { videoId: song.youtubeId, playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 }, events: { onReady: () => { state.playerReady = true; $('play').disabled = false; }, onStateChange: event => { $('play').classList.toggle('playing', event.data === YT.PlayerState.PLAYING); $('play').querySelector('b').textContent = event.data === YT.PlayerState.PLAYING ? 'PAUSE' : 'PLAY'; } } };
  if (state.player) { state.player.loadVideoById(song.youtubeId); return; }
  state.player = new YT.Player('youtubePlayer', options);
}

async function getLyrics(song, token) {
  $('lyricStatus').textContent = 'LYRICS: LOOKING UP…';
  const query = new URLSearchParams({ track_name: song.title.replace(/\s*\(.+?\)\s*/g, ''), artist_name: song.artist.split(' feat.')[0], duration: String(song.duration) });
  try {
    let response = await fetch(`https://lrclib.net/api/get?${query}`, { headers: { 'Lrclib-Client': 'STAR-SING/1.0 (static karaoke test)' } });
    if (!response.ok) throw new Error(`LRCLIB ${response.status}`);
    const data = await response.json(); if (token !== state.song?.id) return;
    state.lines = parseLrc(data.syncedLyrics);
    $('lyricStatus').textContent = state.lines.length ? 'LYRICS: LRCLIB SYNCED' : 'LYRICS: NO TIMING FOUND';
    if (!state.lines.length) setStatus('LRCLIB found this track, but has no timed lyrics. The official video remains available.');
  } catch {
    if (token !== state.song?.id) return;
    state.lines = []; $('lyricStatus').textContent = 'LYRICS: UNAVAILABLE';
    setStatus('Timed lyrics were not found for this version. Try another song or use the official video captions.');
  }
}
async function getNotes(song, token) {
  state.notes = [];
  if (!validUrl(song.noteApiUrl)) { $('noteStatus').textContent = 'NOTE API NOT CONFIGURED'; drawNotes(); return; }
  $('noteStatus').textContent = 'LOADING NOTE API…';
  try {
    const response = await fetch(song.noteApiUrl); if (!response.ok) throw new Error(); const data = await response.json(); if (token !== state.song?.id) return;
    state.notes = Array.isArray(data.notes) ? data.notes.map(item => ({ start: Number(item.start), duration: Number(item.duration), midi: Number(item.midi) })).filter(item => Number.isFinite(item.start) && item.duration > 0 && Number.isFinite(item.midi)) : [];
    $('noteStatus').textContent = state.notes.length ? `NOTE API · ${state.notes.length} NOTES` : 'NOTE API RETURNED NO NOTES'; drawNotes();
  } catch { if (token === state.song?.id) { $('noteStatus').textContent = 'NOTE API UNAVAILABLE'; drawNotes(); } }
}
async function loadSong(song) {
  state.song = song; state.lines = []; state.notes = []; state.lastLine = -2; state.currentTime = 0;
  $('screenIdle').classList.add('hidden'); $('trackTitle').textContent = song.title; $('trackInfo').textContent = `${song.artist} · ${song.genre} · KEY ${song.key}`;
  $('songEyebrow').textContent = `SONG NO. ${song.code}`; $('nowCode').textContent = `NO. ${song.code}`; $('duration').textContent = toTime(song.duration);
  $('youtubeLink').href = song.youtubeUrl; $('youtubeLink').classList.remove('disabled'); selectValue('lyricOffset', songOffset('lyrics')); selectValue('noteOffset', songOffset('notes'));
  state.lyricOffset = Number($('lyricOffset').value); state.noteOffset = Number($('noteOffset').value);
  setStatus(`Loading ${song.title}. This embeds the linked YouTube video and asks LRCLIB for timed lyrics.`); drawSongs(); drawLyrics(); drawNotes();
  const token = song.id; setupPlayer(song); getLyrics(song, token); getNotes(song, token);
  history.replaceState(null, '', `${location.pathname}?song=${encodeURIComponent(song.id)}`);
}
function drawLyrics() {
  const root = $('lyrics'); const adjusted = state.currentTime - state.lyricOffset / 1000; let index = -1;
  for (let i = 0; i < state.lines.length; i++) { if (adjusted >= state.lines[i].time) index = i; else break; }
  if (index === state.lastLine) return; state.lastLine = index; root.replaceChildren();
  if (!state.lines.length) { const note = document.createElement('span'); note.textContent = '♪ TIMED LYRICS WILL APPEAR HERE ♪'; root.append(note); return; }
  for (const [lineIndex, className] of [[index - 1, 'before'], [index, 'active'], [index + 1, 'after']]) {
    const line = state.lines[lineIndex]; if (!line) continue; const row = document.createElement('div'); row.className = className; row.textContent = line.text; root.append(row);
  }
  if (index < 0) { const next = document.createElement('div'); next.className = 'after'; next.textContent = state.lines[0].text; root.append(next); }
}
function drawNotes() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const w = width / dpr, h = height / dpr; ctx.fillStyle = '#081013'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1b5455'; ctx.lineWidth = 1; for (let y = 18; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (!state.notes.length) { ctx.fillStyle = '#94c3bd'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText('NO AUTHORIZED NOTE CHART CONFIGURED FOR THIS SONG', w / 2, h / 2); return; }
  const t = state.currentTime - state.noteOffset / 1000, scale = 55, cursor = w * .25, center = state.notes.find(note => note.start + note.duration > t)?.midi || 60;
  for (const note of state.notes) { const x = cursor + (note.start - t) * scale, y = h / 2 - (note.midi - center) * 9; if (x > w || x + note.duration * scale < 0) continue; ctx.fillStyle = note.start <= t && t <= note.start + note.duration ? '#ffd35a' : '#41d7ca'; ctx.fillRect(x, y - 5, Math.max(3, note.duration * scale - 2), 10); }
  ctx.strokeStyle = '#fff4c4'; ctx.beginPath(); ctx.moveTo(cursor, 0); ctx.lineTo(cursor, h); ctx.stroke();
}
function pollPlayer() {
  if (state.playerReady && state.player?.getCurrentTime) { const time = state.player.getCurrentTime(); if (Number.isFinite(time)) state.currentTime = time; }
  $('elapsed').textContent = toTime(state.currentTime); drawLyrics(); drawNotes(); requestAnimationFrame(pollPlayer);
}
function bind() {
  $('search').addEventListener('input', drawSongs);
  $('play').addEventListener('click', () => { if (!state.playerReady) return; const status = state.player.getPlayerState(); if (status === YT.PlayerState.PLAYING) state.player.pauseVideo(); else state.player.playVideo(); });
  $('previous').addEventListener('click', () => { if (state.playerReady) state.player.seekTo(0, true); });
  $('next').addEventListener('click', () => { const index = state.catalog.findIndex(song => song.id === state.song?.id); if (index >= 0) loadSong(state.catalog[(index + 1) % state.catalog.length]); });
  for (const [input, key] of [['lyricOffset', 'lyrics'], ['noteOffset', 'notes']]) $(input).addEventListener('input', event => { const value = Number(event.target.value); state[key === 'lyrics' ? 'lyricOffset' : 'noteOffset'] = value; $(`${input}Value`).textContent = `${value} ms`; if (state.song) store(`star-sing:${state.song.id}:${key}`, value); state.lastLine = -2; });
  addEventListener('resize', drawNotes);
}
function startClock() { const render = () => { $('clock').textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date()); }; render(); setInterval(render, 1000); }
function startBackdrop() { const source = ['https://cdn.coverr.co/videos/coverr-aerial-view-of-a-city-at-night-1573/1080p.mp4', 'https://cdn.coverr.co/videos/coverr-neon-lights-in-the-city-1571/1080p.mp4']; const video = $('backdropVideo'); video.src = source[Math.floor(Math.random() * source.length)]; video.play().catch(() => {}); }
async function init() {
  bind(); startClock(); startBackdrop(); loadYoutubeApi();
  try { const response = await fetch('./catalog.json', { cache: 'no-cache' }); const data = await response.json(); state.catalog = Array.isArray(data.songs) ? data.songs.filter(song => song.id && song.code && song.youtubeId && validUrl(song.youtubeUrl)) : []; drawSongs(); const id = new URLSearchParams(location.search).get('song'); const initial = state.catalog.find(song => song.id === id) || state.catalog[0]; if (initial) { await youtubeReady; loadSong(initial); } } catch { setStatus('The song catalogue could not be loaded. Serve this folder over HTTP or GitHub Pages.', true); }
  requestAnimationFrame(pollPlayer);
}
init();
