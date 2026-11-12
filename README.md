# STAR SING Karaoke Machine

A static retro karaoke-machine interface. Each queued song uses two locked YouTube embeds: its muted official video plays as the background while a separate karaoke-video backing track supplies audio. Timed lyrics are requested from LRCLIB only for the selected song; this repository does not store audio, lyrics, or note charts.

## Run it

Serve this folder through HTTP (or publish it on GitHub Pages), then open `index.html`. Do not open it with `file://`: YouTube embeds require the hosting page to send a referrer.

```bash
npx serve .
```

Internet access is required for the two YouTube players, LRCLIB, Google Fonts, and the optional ambient video. The machine uses a CSS fallback if the ambient clip cannot load.

## Using the machine

The main machine opens with an empty playlist. Type a five-digit code or a song title to see up to five close matches. Click one to add it, or press Enter to add the closest match. Add as many tracks as wanted; when a song ends, the next queued song starts automatically.

The full listing remains in `songbook.html`. On a mobile screen, tapping a song-book row copies its song code instead of navigating away.

## Catalogue

Edit [catalog.json](catalog.json). Each entry uses this shape:

```json
{
  "id": "my-song",
  "code": "48008",
  "title": "My Song",
  "artist": "Artist",
  "duration": 210,
  "youtubeId": "OfficialYouTubeVideoId",
  "youtubeUrl": "https://www.youtube.com/watch?v=OfficialYouTubeVideoId",
  "karaokeYoutubeId": "KaraokeYouTubeVideoId",
  "karaokeOffsetMs": 0,
  "key": "C major",
  "blurVideo": false,
  "lyricOffsetMs": 0,
  "noteOffsetMs": 0,
  "ultraStarChartUrl": "https://your-authorized-chart-host.example/my-song.txt"
}
```

`blurVideo` makes the visible official video deliberately unreadable, useful when it includes its own lyrics. The embedded video itself has captions, player controls, keyboard controls, and pointer interaction disabled. `karaokeOffsetMs` adjusts the karaoke-video playhead against the official-video playhead. The in-machine volume slider changes the karaoke backing only; the official video is always muted.

## UltraStar note charts

There is no universal public note-chart source with rights for commercial songs. Each entry can point to an authorized, CORS-enabled HTTPS UltraStar `.txt` file. It needs an absolute `#BPM` header, an optional `#GAP` in milliseconds, and standard note rows:

```text
#BPM:120
#GAP:0
: 0 4 0 First
: 4 4 4 line
```

The **NOTE-CHART DELAY** control is separate from **LYRIC DELAY**. It applies only to the parsed UltraStar chart. The current test entries deliberately keep `ultraStarChartUrl` unset until an authorized source is available.

## Operator calibration and Japanese readings

The normal screen deliberately has no timing sliders. Open the operator panel with `*1978#`, or type `1978` and press Enter (useful on mobile). It exposes direct millisecond fields and prints a catalog-ready timing preset in the browser console. These per-song values are stored only in that browser until copied into `catalog.json`.

When a shown lyric line contains kanji, the player lazily loads an in-browser Japanese tokenizer and displays its hiragana reading above the kanji. Its language dictionary is downloaded only when a Japanese lyric first appears; if it cannot load, the original lyric text remains visible.

## Rights note

An official YouTube embed is not a license to republish lyrics or note charts. Use public-domain/creator-authorized content or obtain the required lyric/chart rights before public release. The site embeds YouTube directly and never downloads or proxies its audio/video.

## Files

- `index.html`, `app.js`, `styles.css` — player and machine controls
- `songbook.html`, `songbook.js` — dedicated printed song-book view
- `catalog.json` — song/video metadata

Site code is MIT-licensed; see [LICENSE](LICENSE).
