/* STAR SING: official YouTube video + a separate YouTube karaoke backing track.
   Lyrics are fetched only while selected; no audio, lyrics, or UltraStar charts are stored here. */
'use strict';

const $ = id => document.getElementById(id);
const state = { catalog: [], queue: [], queueIndex: -1, song: null, player: null, playerReady: false, karaokePlayer: null, karaokeReady: false, lines: [], notes: [], lyricOffset: 0, audioOffset: 0, noteOffset: 0, lastLine: -2, currentTime: 0, volume: 80, lastSyncAt: 0, autoStart: false, codeInput: '', codeTimer: 0, operatorCode: '', operatorTimer: 0, playbackClockStartedAt: 0, playbackClockBase: 0, furiganaCache: new Map(), furiganaPending: new Map() };
const canvas = $('pitchCanvas');
const ctx = canvas.getContext('2d');
const toTime = value => { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const restore = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const validUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const hasKaraoke = song => Boolean(song?.karaokeYoutubeId);

function setStatus(message, bad = false) { const node = $('status'); node.textContent = message; node.classList.toggle('bad', bad); }
function logTimingPreset() {
  if (!state.song) return;
  console.info('[STAR SING catalog timing]', JSON.stringify({ id: state.song.id, lyricOffsetMs: state.lyricOffset, karaokeOffsetMs: state.audioOffset }));
}
function hideYoutubeCaptions(player) { try { player?.unloadModule?.('captions'); player?.unloadModule?.('cc'); } catch {} }
const hasKanji = text => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
function appendFuriganaWords(root, words) {
  root.replaceChildren();
  for (const word of words) for (const piece of word.subword || [word]) { const surface = String(piece.surface || ''), reading = String(piece.furigana || ''); if (surface && reading && hasKanji(surface)) { const ruby = document.createElement('ruby'), rt = document.createElement('rt'); ruby.append(document.createTextNode(surface)); rt.textContent = reading; ruby.append(rt); root.append(ruby); } else root.append(document.createTextNode(surface)); }
}
async function getFuriganaWords(text) {
  if (state.furiganaCache.has(text)) return state.furiganaCache.get(text);
  if (state.furiganaPending.has(text)) return state.furiganaPending.get(text);
  const clientId = String(restore('star-sing:yahoo-furigana-client-id', '') || '').trim(); if (!clientId) return null;
  const pending = fetch(`https://jlp.yahooapis.jp/FuriganaService/V2/furigana?appid=${encodeURIComponent(clientId)}`, { method: 'POST', mode: 'cors', body: JSON.stringify({ id: `star-sing-${Date.now()}`, jsonrpc: '2.0', method: 'jlp.furiganaservice.furigana', params: { q: text, grade: 1 } }) }).then(response => response.ok ? response.json() : null).then(data => Array.isArray(data?.result?.word) ? data.result.word : null).catch(() => null).then(words => { state.furiganaPending.delete(text); if (words) state.furiganaCache.set(text, words); return words; });
  state.furiganaPending.set(text, pending); return pending;
}
function appendLyricText(root, text) {
  root.dataset.lyricText = text; root.textContent = text;
  if (!hasKanji(text)) return;
  if (state.furiganaCache.has(text)) { appendFuriganaWords(root, state.furiganaCache.get(text)); return; }
  getFuriganaWords(text).then(words => { if (words && root.isConnected && root.dataset.lyricText === text) appendFuriganaWords(root, words); });
}
function parseLrc(source) {
  const lines = [];
  for (const row of String(source || '').split(/\r?\n/)) {
    const text = row.replace(/\[(?:\d+:)?\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    for (const match of row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)) if (text) lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}
function unquoteYaml(value) { const text = String(value || '').trim(); if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"'); return text; }
function parseLyricsfile(source) {
  const lines = []; let line; let word;
  for (const row of String(source || '').split(/\r?\n/)) {
    const indent = row.match(/^\s*/)[0].length, text = row.trim();
    if (indent === 0 && text.startsWith('- text:')) { line = { text: unquoteYaml(text.slice(7)), words: [] }; lines.push(line); word = null; continue; }
    if (indent >= 2 && text.startsWith('- text:') && line) { word = { text: unquoteYaml(text.slice(7)) }; line.words.push(word); continue; }
    const match = text.match(/^(start_ms|end_ms):\s*(\d+)/); if (!match) continue;
    const target = indent >= 2 && word ? word : line; if (target) target[match[1]] = Number(match[2]);
  }
  return lines.filter(item => Number.isFinite(item.start_ms) && item.text).map(item => { const words = item.words.filter(word => Number.isFinite(word.start_ms)); return { time: item.start_ms / 1000, end: Number(item.end_ms || item.start_ms) / 1000, text: item.text, words: words.map((word, index) => ({ text: word.text, start: word.start_ms / 1000, end: Number(word.end_ms || words[index + 1]?.start_ms || item.end_ms || word.start_ms) / 1000 })) }; });
}
function parseUltraStar(source) {
  const headers = Object.fromEntries([...String(source || '').matchAll(/^#([A-Z]+)\s*:\s*(.+)$/gim)].map(match => [match[1], match[2].trim()]));
  const bpm = Number(String(headers.BPM || '').replace(',', '.'));
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Chart is missing a valid #BPM header');
  const gap = Number(String(headers.GAP || '0').replace(',', '.')) / 1000;
  const secondsPerBeat = 60 / (bpm * 4), notes = [];
  for (const row of String(source).split(/\r?\n/)) {
    const match = row.match(/^[:*FRG]\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s*(.*)$/);
    if (!match) continue;
    const [, beat, length, pitch] = match;
    notes.push({ start: gap + Number(beat) * secondsPerBeat, duration: Number(length) * secondsPerBeat, midi: Number(pitch) + 60 });
  }
  return notes.filter(note => Number.isFinite(note.start) && note.duration > 0 && Number.isFinite(note.midi));
}
const timingFields = { lyrics: { slider: 'lyricOffset', operator: 'operatorLyricOffset', state: 'lyricOffset' }, audio: { slider: 'audioOffset', operator: 'operatorAudioOffset', state: 'audioOffset' }, notes: { slider: 'noteOffset', operator: 'operatorNoteOffset', state: 'noteOffset' } };
function songOffset(kind) { const defaults = { lyrics: state.song?.lyricOffsetMs || 0, audio: state.song?.karaokeOffsetMs || 0, notes: state.song?.noteOffsetMs || 0 }; return restore(`star-sing:${state.song?.id}:${kind}`, defaults[kind]); }
function setTiming(kind, rawValue, persist = true) {
  const field = timingFields[kind], value = Math.max(-120000, Math.min(120000, Math.round(Number(rawValue) || 0))), slider = $(field.slider);
  state[field.state] = value; slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), value))); $(`${field.slider}Value`).textContent = `${value} ms`; $(field.operator).value = String(value);
  if (persist && state.song) store(`star-sing:${state.song.id}:${kind}`, value); if (persist && (kind === 'lyrics' || kind === 'audio')) logTimingPreset(); state.lastLine = -2; drawLyrics();
}
function selectValue(id, value) { const kind = Object.entries(timingFields).find(([, field]) => field.slider === id)?.[0]; if (kind) setTiming(kind, value, false); }
function updatePlayEnabled() { $('play').disabled = !(state.playerReady && hasKaraoke(state.song)); }

function matchedSongs() {
  const query = $('search').value.trim().toLowerCase();
  if (!query) return [];
  return state.catalog.filter(song => `${song.code} ${song.title} ${song.artist}`.toLowerCase().includes(query)).sort((a, b) => Number(b.code.startsWith(query)) - Number(a.code.startsWith(query)) || a.title.localeCompare(b.title)).slice(0, 5);
}
function songButton(song, label, handler) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'song-row'; button.setAttribute('role', 'option');
  const code = document.createElement('b'); code.textContent = song.code;
  const info = document.createElement('span'); const title = document.createElement('strong'); title.textContent = song.title; const artist = document.createElement('small'); artist.textContent = `${song.artist} · ${label}`; info.append(title, artist); button.append(code, info); button.addEventListener('click', handler); return button;
}
function drawSuggestions() {
  const root = $('searchResults'), matches = matchedSongs(); root.replaceChildren(); root.hidden = !matches.length;
  for (const song of matches) root.append(songButton(song, 'ADD TO QUEUE', () => addToQueue(song)));
}
function drawQueue() {
  const root = $('songList'); root.replaceChildren(); $('songCount').textContent = String(state.queue.length).padStart(2, '0');
  if (!state.queue.length) { const p = document.createElement('p'); p.textContent = 'PLAYLIST EMPTY. TYPE A SONG CODE OR TITLE ABOVE.'; root.append(p); return; }
  state.queue.forEach((song, index) => { const row = songButton(song, index === state.queueIndex ? 'NOW READY' : `QUEUE ${String(index + 1).padStart(2, '0')}`, () => selectQueue(index)); row.classList.toggle('active', index === state.queueIndex); root.append(row); });
}
function addToQueue(song) {
  let index = state.queue.findIndex(item => item.id === song.id);
  if (index < 0) { state.queue.push(song); index = state.queue.length - 1; }
  $('search').value = ''; drawSuggestions();
  if (state.queueIndex < 0) selectQueue(index); else drawQueue();
  setStatus(`${song.title} added to the playlist.`);
}
function selectQueue(index, autoStart = false) {
  const song = state.queue[index]; if (!song) return; state.queueIndex = index; loadSong(song, autoStart); drawQueue();
}
function nextInQueue(autoStart = false) {
  if (state.queueIndex + 1 >= state.queue.length) { if (autoStart) setStatus('Playlist complete. Add another song code to keep singing.'); return; }
  selectQueue(state.queueIndex + 1, autoStart);
}
function bestCodeMatch(code) { return state.catalog.find(song => song.code === code) || state.catalog.find(song => song.code.startsWith(code)); }
function clearCodeEntry() { state.codeInput = ''; clearTimeout(state.codeTimer); const readout = $('codeEntry'); readout.hidden = true; readout.textContent = ''; }
function setOperatorOpen(open) { $('operatorPanel').hidden = !open; if (open) { $('operatorYahooClientId').value = String(restore('star-sing:yahoo-furigana-client-id', '') || ''); setStatus('Operator calibration active. Direct values are saved only in this browser.'); } }
function clearOperatorCode() { state.operatorCode = ''; clearTimeout(state.operatorTimer); }
function collectOperatorCode(event) {
  if (event.key === '*') { state.operatorCode = '*'; clearTimeout(state.operatorTimer); state.operatorTimer = setTimeout(clearOperatorCode, 4000); return true; }
  if (!state.operatorCode) return false;
  if (/^\d$/.test(event.key)) { state.operatorCode += event.key; return true; }
  if (event.key === '#') { const valid = state.operatorCode === '*1978'; clearOperatorCode(); if (valid) setOperatorOpen($('operatorPanel').hidden); else setStatus('Unknown operator code.', true); return true; }
  clearOperatorCode(); return false;
}
function showCodeEntry(resetTimer = true) {
  const readout = $('codeEntry'), match = bestCodeMatch(state.codeInput);
  if (!state.codeInput) { clearCodeEntry(); return; }
  readout.hidden = false; readout.textContent = match ? `${state.codeInput} · ${match.title.toUpperCase()}` : `${state.codeInput} · NO MATCH`;
  if (resetTimer) { clearTimeout(state.codeTimer); state.codeTimer = setTimeout(clearCodeEntry, 3200); }
}
function addTypedCode() { if (state.codeInput === '1978') { setOperatorOpen($('operatorPanel').hidden); clearCodeEntry(); return; } const match = bestCodeMatch(state.codeInput); if (match) addToQueue(match); else if (state.codeInput) setStatus(`No song starts with code ${state.codeInput}.`, true); clearCodeEntry(); }

let resolveYoutube;
const youtubeReady = new Promise(resolve => { resolveYoutube = resolve; });
window.onYouTubeIframeAPIReady = () => resolveYoutube();
function loadYoutubeApi() { const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; document.head.append(script); }
const playerVars = { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, origin: location.origin };
function startPlayback() {
  if (!state.playerReady || !hasKaraoke(state.song)) { setStatus('This song needs a configured karaoke YouTube backing track before it can play.', true); return; }
  state.autoStart = false; state.playbackClockBase = Math.max(0, Number(state.player.getCurrentTime()) || state.currentTime); state.playbackClockStartedAt = performance.now(); state.player.mute(); state.player.playVideo();
  if (state.karaokeReady) {
    state.karaokePlayer.unMute(); state.karaokePlayer.setVolume(state.volume);
    state.karaokePlayer.seekTo(Math.max(0, state.player.getCurrentTime() + state.audioOffset / 1000), true); state.karaokePlayer.playVideo();
    setTimeout(() => syncKaraokeAudio(true), 250); setTimeout(() => syncKaraokeAudio(true), 900);
  }
  else setStatus('Official video is running muted; karaoke audio is still connecting…');
}
function setupPlayers(song) {
  if (!window.YT?.Player) { setStatus('YouTube player is still starting. Please try again in a moment.'); return; }
  const visualEvents = { onReady: () => { state.playerReady = true; state.player.mute(); hideYoutubeCaptions(state.player); updatePlayEnabled(); if (!state.karaokeReady) setStatus('Official video ready; connecting karaoke backing track…'); if (state.autoStart) startPlayback(); }, onStateChange: event => { hideYoutubeCaptions(state.player); const playing = event.data === YT.PlayerState.PLAYING; $('play').classList.toggle('playing', playing); $('play').querySelector('b').textContent = playing ? 'PAUSE' : 'PLAY'; if (playing) { if (!state.playbackClockStartedAt) { state.playbackClockBase = state.currentTime; state.playbackClockStartedAt = performance.now(); } syncKaraokeAudio(true); } if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) state.playbackClockStartedAt = 0; if (event.data === YT.PlayerState.ENDED) { state.karaokePlayer?.pauseVideo(); nextInQueue(true); } if (event.data === YT.PlayerState.CUED && state.autoStart) startPlayback(); } };
  if (state.player) { if (typeof state.player.loadVideoById === 'function') { state.player.loadVideoById(song.youtubeId); state.player.mute(); hideYoutubeCaptions(state.player); } } else state.player = new YT.Player('youtubePlayer', { videoId: song.youtubeId, playerVars, events: visualEvents });
  state.karaokeReady = false;
  if (!hasKaraoke(song)) { updatePlayEnabled(); return; }
  const karaokeEvents = { onReady: () => { state.karaokeReady = true; state.karaokePlayer.unMute(); state.karaokePlayer.setVolume(state.volume); updatePlayEnabled(); setStatus(`${song.title} ready. Press PLAY to start the muted official video and karaoke backing track.`); if (state.autoStart && state.playerReady) startPlayback(); else if (state.player?.getPlayerState?.() === YT.PlayerState.PLAYING) state.karaokePlayer.playVideo(); }, onError: event => { state.karaokeReady = false; updatePlayEnabled(); setStatus(`The karaoke video cannot be embedded or played (YouTube error ${event.data}). Choose a song with another karaoke source.`, true); } };
  if (state.karaokePlayer) { if (typeof state.karaokePlayer.loadVideoById === 'function') { state.karaokePlayer.loadVideoById(song.karaokeYoutubeId); state.karaokePlayer.unMute(); state.karaokePlayer.setVolume(state.volume); state.karaokeReady = true; updatePlayEnabled(); setStatus(`${song.title} ready. Press PLAY to start the muted official video and karaoke backing track.`); if (state.autoStart) startPlayback(); } } else state.karaokePlayer = new YT.Player('karaokePlayer', { videoId: song.karaokeYoutubeId, playerVars, events: karaokeEvents });
}

async function getLyrics(song, token) {
  $('lyricStatus').textContent = 'LYRICS: LOOKING UP…';
  const exact = { track_name: song.title.replace(/\s*\(.+?\)\s*/g, ''), artist_name: song.artist.split(' feat.')[0], duration: String(song.duration) };
  const aliases = song.lyricSearch || [];
  try {
    let data;
    for (const candidate of [exact, ...aliases]) {
      const response = await fetch(`https://lrclib.net/api/get?${new URLSearchParams({ ...candidate, duration: String(song.duration) })}`, { cache: 'no-store', credentials: 'omit' });
      if (response.ok) { const match = await response.json(); if (match.syncedLyrics) { data = match; break; } }
    }
    if (!data) {
      const terms = [exact, ...aliases].map(candidate => `${candidate.artist_name || ''} ${candidate.track_name || ''}`.trim());
      for (const q of terms) {
        const response = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q })}`, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) continue; const matches = await response.json();
        data = matches.filter(match => match.syncedLyrics).sort((a, b) => Math.abs((a.duration || song.duration) - song.duration) - Math.abs((b.duration || song.duration) - song.duration))[0];
        if (data) break;
      }
    }
    if (!data) throw new Error(); if (token !== state.song?.id) return;
    state.lines = data.hasWordSync ? parseLyricsfile(data.lyricsfile) : parseLrc(data.syncedLyrics); $('lyricStatus').textContent = state.lines.length ? data.hasWordSync ? 'LYRICS: LRCLIB WORD SYNCED' : 'LYRICS: LRCLIB SYNCED' : 'LYRICS: NO TIMING FOUND'; state.lastLine = -2; drawLyrics();
  } catch { if (token === state.song?.id) { state.lines = []; state.lastLine = -2; $('lyricStatus').textContent = 'LYRICS: UNAVAILABLE'; drawLyrics(); } }
}
async function getNotes(song, token) {
  state.notes = [];
  if (!validUrl(song.ultraStarChartUrl)) { $('noteStatus').textContent = 'ULTRASTAR CHART NOT CONFIGURED'; drawNotes(); return; }
  $('noteStatus').textContent = 'LOADING ULTRASTAR…';
  try { const response = await fetch(song.ultraStarChartUrl); if (!response.ok) throw new Error(); const source = await response.text(); if (token !== state.song?.id) return; state.notes = parseUltraStar(source); $('noteStatus').textContent = state.notes.length ? `ULTRASTAR · ${state.notes.length} NOTES` : 'ULTRASTAR HAS NO NOTES'; drawNotes(); } catch { if (token === state.song?.id) { $('noteStatus').textContent = 'ULTRASTAR UNAVAILABLE'; drawNotes(); } }
}
function loadSong(song, autoStart = false) {
  state.song = song; state.lines = []; state.notes = []; state.lastLine = -2; state.currentTime = 0; state.lastSyncAt = 0; state.playbackClockStartedAt = 0; state.playbackClockBase = 0; state.autoStart = autoStart; $('lyrics').replaceChildren(Object.assign(document.createElement('span'), { textContent: '♪ LOADING TIMED LYRICS ♪' }));
  $('screenIdle').classList.add('hidden'); $('trackTitle').textContent = song.title; $('trackInfo').textContent = `${song.artist} · ${song.genre} · KEY ${song.key}`;
  $('songEyebrow').textContent = `SONG NO. ${song.code}`; $('nowCode').textContent = `NO. ${song.code}`; $('duration').textContent = toTime(song.duration); $('playerViewport').classList.toggle('video-obscured', Boolean(song.blurVideo));
  $('youtubeLink').href = song.youtubeUrl; $('youtubeLink').classList.remove('disabled'); selectValue('lyricOffset', songOffset('lyrics')); selectValue('audioOffset', songOffset('audio')); selectValue('noteOffset', songOffset('notes'));
  state.lyricOffset = Number($('lyricOffset').value); state.audioOffset = Number($('audioOffset').value); state.noteOffset = Number($('noteOffset').value); setStatus(`Loading ${song.title}: muted official video + karaoke backing track.`);
  const token = song.id; setupPlayers(song); getLyrics(song, token); getNotes(song, token); history.replaceState(null, '', `${location.pathname}?song=${encodeURIComponent(song.id)}`);
}
function updateWordFill(root, adjusted) { for (const word of root.querySelectorAll('[data-word-start]')) { const start = Number(word.dataset.wordStart), end = Number(word.dataset.wordEnd) || start + .1, progress = Math.max(0, Math.min(1, (adjusted - start) / Math.max(.01, end - start))); word.style.setProperty('--word-progress', progress); } }
function drawLyrics() {
  const root = $('lyrics'), adjusted = state.currentTime - state.lyricOffset / 1000; let index = -1;
  for (let i = 0; i < state.lines.length; i++) { if (adjusted >= state.lines[i].time) index = i; else break; }
  if (index === state.lastLine) { updateWordFill(root, adjusted); return; } state.lastLine = index; root.replaceChildren();
  if (!state.lines.length) { const note = document.createElement('span'); note.textContent = $('lyricStatus').textContent.includes('UNAVAILABLE') || $('lyricStatus').textContent.includes('NO TIMING') ? '♪ TIMED LYRICS UNAVAILABLE ♪' : '♪ LOADING TIMED LYRICS ♪'; root.append(note); return; }
  for (const [lineIndex, className] of [[index - 1, 'before'], [index, 'active'], [index + 1, 'after']]) { const line = state.lines[lineIndex]; if (line) { const row = document.createElement('div'); row.className = className; if (className === 'active' && line.words?.length) { for (const word of line.words) { const span = document.createElement('span'); span.className = 'word'; span.dataset.wordStart = String(word.start); span.dataset.wordEnd = String(word.end); span.dataset.wordText = word.text; appendLyricText(span, word.text); row.append(span); } } else appendLyricText(row, line.text); root.append(row); } }
  if (index < 0) { const next = document.createElement('div'); next.className = 'after'; appendLyricText(next, state.lines[0].text); root.append(next); }
  updateWordFill(root, adjusted);
}
function drawNotes() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const w = width / dpr, h = height / dpr; ctx.fillStyle = '#081013'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#1b5455'; ctx.lineWidth = 1;
  for (let y = 18; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (!state.notes.length) { ctx.fillStyle = '#94c3bd'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText('NO ULTRASTAR CHART CONFIGURED FOR THIS SONG', w / 2, h / 2); return; }
  const t = state.currentTime - state.noteOffset / 1000, scale = 55, cursor = w * .25, center = state.notes.find(note => note.start + note.duration > t)?.midi || 60;
  for (const note of state.notes) { const x = cursor + (note.start - t) * scale, y = h / 2 - (note.midi - center) * 9; if (x > w || x + note.duration * scale < 0) continue; ctx.fillStyle = note.start <= t && t <= note.start + note.duration ? '#ffd35a' : '#41d7ca'; ctx.fillRect(x, y - 5, Math.max(3, note.duration * scale - 2), 10); }
  ctx.strokeStyle = '#fff4c4'; ctx.beginPath(); ctx.moveTo(cursor, 0); ctx.lineTo(cursor, h); ctx.stroke();
}
function playbackIsActive() { return state.player?.getPlayerState?.() === YT.PlayerState.PLAYING || $('play')?.classList.contains('playing'); }
function useKaraokeClock(visualTime, audioTime) {
  return Number.isFinite(visualTime) && visualTime < .1 && Number.isFinite(audioTime) && audioTime > .1 && playbackIsActive() && state.karaokePlayer?.getPlayerState?.() === YT.PlayerState.PLAYING;
}
function useFallbackClock(visualTime, audioTime) { return (!Number.isFinite(visualTime) || visualTime < .1) && (!Number.isFinite(audioTime) || audioTime < .1) && state.playbackClockStartedAt > 0 && playbackIsActive(); }
function getTimelineTime() {
  const visualTime = Number(state.player?.getCurrentTime?.()), audioTime = Number(state.karaokePlayer?.getCurrentTime?.());
  if (useKaraokeClock(visualTime, audioTime)) return Math.max(0, audioTime - state.audioOffset / 1000);
  if (useFallbackClock(visualTime, audioTime)) return state.playbackClockBase + (performance.now() - state.playbackClockStartedAt) / 1000;
  return Number.isFinite(visualTime) ? visualTime : state.currentTime;
}
function syncKaraokeAudio(force = false) {
  if (!state.karaokeReady || !state.song || !hasKaraoke(state.song) || !playbackIsActive()) return;
  const now = performance.now(); if (!force && now - state.lastSyncAt < 700) return; state.lastSyncAt = now;
  const visualTime = Number(state.player.getCurrentTime()), actual = Number(state.karaokePlayer.getCurrentTime());
  if (useKaraokeClock(visualTime, actual)) { state.currentTime = Math.max(0, actual - state.audioOffset / 1000); return; }
  if (useFallbackClock(visualTime, actual)) { state.currentTime = getTimelineTime(); return; }
  if (!Number.isFinite(visualTime)) return;
  state.currentTime = visualTime; const desired = visualTime + state.audioOffset / 1000;
  if (Number.isFinite(actual) && Math.abs(actual - desired) > .22) state.karaokePlayer.seekTo(Math.max(0, desired), true);
}
function refreshPlaybackClock() {
  if (state.playerReady && state.player?.getCurrentTime) state.currentTime = getTimelineTime();
  $('elapsed').textContent = toTime(state.currentTime); drawLyrics(); drawNotes(); syncKaraokeAudio();
}
function pollPlayer() {
  refreshPlaybackClock(); requestAnimationFrame(pollPlayer);
}
function toggleFullscreen() { const target = $('playerViewport'); if (document.fullscreenElement === target) document.exitFullscreen?.(); else target.requestFullscreen?.(); }
function bind() {
  $('search').addEventListener('input', () => { drawSuggestions(); const value = $('search').value.trim(); if (/^\d{1,5}$/.test(value)) { state.codeInput = value; showCodeEntry(); } });
  $('search').addEventListener('keydown', event => { if (event.key === 'Enter') { const song = matchedSongs()[0]; if (song) { event.preventDefault(); addToQueue(song); clearCodeEntry(); } } });
  $('play').addEventListener('click', () => { if (!$('play').disabled) { const playing = state.player.getPlayerState() === YT.PlayerState.PLAYING; if (playing) { state.playbackClockStartedAt = 0; state.player.pauseVideo(); state.karaokePlayer.pauseVideo(); } else startPlayback(); } });
  $('previous').addEventListener('click', () => { if (state.playerReady) { state.playbackClockBase = 0; state.playbackClockStartedAt = state.player.getPlayerState() === YT.PlayerState.PLAYING ? performance.now() : 0; state.player.seekTo(0, true); state.karaokePlayer?.seekTo(Math.max(0, state.audioOffset / 1000), true); } });
  $('next').addEventListener('click', () => nextInQueue());
  $('volume').addEventListener('input', event => { state.volume = Number(event.target.value); $('volumeValue').textContent = `${state.volume}%`; store('star-sing:volume', state.volume); state.karaokePlayer?.setVolume(state.volume); });
  $('fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => { const active = document.fullscreenElement === $('playerViewport'); $('fullscreen').classList.toggle('active', active); $('fullscreen').querySelector('span').textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN'; });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.matches?.('input, textarea, select') || event.ctrlKey || event.altKey || event.metaKey) return;
    if (collectOperatorCode(event)) { event.preventDefault(); return; }
    if (/^[0-9]$/.test(event.key)) { event.preventDefault(); state.codeInput = `${state.codeInput}${event.key}`.slice(-5); showCodeEntry(); }
    else if (event.key === 'Backspace' && state.codeInput) { event.preventDefault(); state.codeInput = state.codeInput.slice(0, -1); showCodeEntry(); }
    else if (event.key === 'Enter' && state.codeInput) { event.preventDefault(); addTypedCode(); }
    else if (event.key === 'Escape' && state.codeInput) clearCodeEntry();
  });
  for (const [kind, field] of Object.entries(timingFields)) $(field.slider).addEventListener('input', event => setTiming(kind, event.target.value));
  $('operatorApply').addEventListener('click', () => { for (const [kind, field] of Object.entries(timingFields)) setTiming(kind, $(field.operator).value); const clientId = $('operatorYahooClientId').value.trim(); store('star-sing:yahoo-furigana-client-id', clientId); state.furiganaCache.clear(); state.furiganaPending.clear(); state.lastLine = -2; drawLyrics(); setStatus(clientId ? 'Direct timing values and Yahoo furigana Client ID saved in this browser.' : 'Direct timing values saved. Add a Yahoo Client ID to enable Japanese readings.'); });
  $('closeOperator').addEventListener('click', () => setOperatorOpen(false));
  addEventListener('resize', drawNotes);
}
function startClock() { const render = () => { $('clock').textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date()); }; render(); setInterval(render, 1000); }
function startBackdrop() { const clips = ['https://cdn.coverr.co/videos/coverr-aerial-view-of-a-city-at-night-1573/1080p.mp4', 'https://cdn.coverr.co/videos/coverr-neon-lights-in-the-city-1571/1080p.mp4']; const video = $('backdropVideo'); video.src = clips[Math.floor(Math.random() * clips.length)]; video.play().catch(() => {}); }
async function init() {
  bind(); startClock(); startBackdrop(); state.volume = Math.max(0, Math.min(100, Number(restore('star-sing:volume', 80)))); $('volume').value = String(state.volume); $('volumeValue').textContent = `${state.volume}%`; loadYoutubeApi();
  let data;
  try {
    const response = await fetch('./catalog.json', { cache: 'no-cache' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); data = await response.json();
  } catch { setStatus('The song catalogue could not be loaded. Serve this folder over HTTP or GitHub Pages.', true); requestAnimationFrame(pollPlayer); return; }
  state.catalog = Array.isArray(data.songs) ? data.songs.filter(song => song.id && song.code && song.youtubeId && validUrl(song.youtubeUrl)) : []; drawQueue();
  const selected = state.catalog.find(song => song.id === new URLSearchParams(location.search).get('song')); if (selected) addToQueue(selected);
  await youtubeReady; if (state.song) setupPlayers(state.song);
  setInterval(refreshPlaybackClock, 250); requestAnimationFrame(pollPlayer);
}
init();
