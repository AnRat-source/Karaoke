'use strict';
const root = document.getElementById('bookList');
let songs = [];
function lyricsSynced(song) { try { const raw = localStorage.getItem(`star-sing:${song.id}:lyrics-synced`); return raw === null ? Boolean(song.lyricsSynced) : Boolean(JSON.parse(raw)); } catch { return Boolean(song.lyricsSynced); } }
function draw() {
  const query = document.getElementById('bookSearch').value.trim().toLowerCase();
  const filtered = songs.filter(song => `${song.code} ${song.title} ${song.artist}`.toLowerCase().includes(query)).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  root.replaceChildren();
  if (!filtered.length) { const p = document.createElement('p'); p.textContent = 'NO SONG FOUND.'; root.append(p); return; }
  const columnCount = Math.min(3, Math.max(1, Math.ceil(filtered.length / 8)));
  const columns = Array.from({ length: columnCount }, () => { const section = document.createElement('section'); section.className = 'book-column'; root.append(section); return section; });
  filtered.forEach((song, index) => { const row = document.createElement('a'); row.href = `index.html?song=${encodeURIComponent(song.id)}`; const code = document.createElement('b'); code.textContent = song.code; code.classList.toggle('lyrics-unsynced', !lyricsSynced(song)); code.title = lyricsSynced(song) ? 'Lyrics synced' : 'Lyrics not yet synced'; const info = document.createElement('span'); const title = document.createElement('strong'); title.textContent = song.title; const artist = document.createElement('small'); artist.textContent = song.artist; info.append(title, artist); row.append(code, info); row.addEventListener('click', async event => { if (!matchMedia('(max-width: 780px)').matches) return; event.preventDefault(); try { await navigator.clipboard.writeText(song.code); document.getElementById('copyNotice').textContent = `CODE ${song.code} COPIED — RETURN TO THE MACHINE AND PASTE OR TYPE IT.`; } catch { document.getElementById('copyNotice').textContent = `SONG CODE: ${song.code}`; } }); columns[index % columnCount].append(row); });
}
fetch('./catalog.json', { cache: 'no-cache' }).then(response => response.json()).then(data => { songs = Array.isArray(data.songs) ? data.songs : []; draw(); }).catch(() => { root.textContent = 'SONG BOOK COULD NOT BE OPENED.'; });
document.getElementById('bookSearch').addEventListener('input', draw);
