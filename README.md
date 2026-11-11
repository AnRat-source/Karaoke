# STAR SING Karaoke Machine

A static, retro karaoke-machine interface for a small test song catalogue. It embeds the configured official YouTube video, requests timed lyrics from LRCLIB only while a song is selected, and never stores audio or lyric text in this repository.

## Run it

Serve this folder over HTTP (or publish it on GitHub Pages), then open `index.html`:

```bash
npx serve .
```

The player needs internet access for YouTube, LRCLIB, Google Fonts, and the optional ambient background video. If the background clip is unavailable, the built-in animated-color fallback remains visible.

## Catalogue

Edit [catalog.json](catalog.json). Each entry has a five-digit karaoke `code`, basic metadata, an official YouTube video ID/link, and independent lyric/note timing defaults.

```json
{
  "id": "my-song",
  "code": "48008",
  "title": "My Song",
  "artist": "Artist",
  "duration": 210,
  "youtubeId": "YouTubeVideoId",
  "youtubeUrl": "https://www.youtube.com/watch?v=YouTubeVideoId",
  "key": "C major",
  "lyricOffsetMs": 0,
  "noteOffsetMs": 0,
  "noteApiUrl": "https://your-authorized-chart-api.example/charts/my-song.json"
}
```

The player sends the selected title, artist, and duration to LRCLIB. It does not save the response; the user’s lyric offset is stored only in that browser’s localStorage.

## Note-chart endpoint

There is no universal public note-chart API with rights for commercial songs, so each catalogue entry can opt into a source you are authorized to use. The endpoint must be HTTPS, CORS-enabled, and return:

```json
{
  "notes": [
    { "start": 12.25, "duration": 0.48, "midi": 60 },
    { "start": 12.78, "duration": 0.52, "midi": 64 }
  ]
}
```

The **NOTE-CHART DELAY** control applies to that chart alone, separate from **LYRIC DELAY**. Current test tracks intentionally have `noteApiUrl: null` until an authorized chart source is supplied.

## Rights note

An official YouTube embed is not a license to republish lyrics or note charts. For a public release, use public-domain/creator-authorized material or obtain the needed lyric and chart rights. YouTube’s embedded player is used directly; no video/audio is downloaded or proxied.

## Files

- `index.html`, `app.js`, `styles.css` — machine/player interface
- `songbook.html`, `songbook.js` — separate printed-song-book UI
- `catalog.json` — the seven test entries

Site code is MIT-licensed; see [LICENSE](LICENSE).
