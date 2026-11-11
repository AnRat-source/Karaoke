# NEON Karaoke Library

A GitHub Pages-ready karaoke game and **organized song library**. The browser downloads each song's MP3, LRC lyrics, and note chart from *your own Pages site*. No YouTube search, streaming account, LRCLIB, API key, CDN library, or server-side program is needed for playback.

## Start here

1. Download and unzip the project.
2. Create a new **public** GitHub repository (for example, `neon-karaoke-library`). Upload **the contents of this folder**, with `index.html` at the repo root. You can drag files into GitHub's **Add file → Upload files**, or use Git to push the entire folder (better for MP3s).
3. On GitHub, open **Settings → Pages**, choose **Deploy from a branch**, then select **main / (root)** and save. Your site will be at `https://YOUR-USERNAME.github.io/neon-karaoke-library/` after deployment.
4. Play a song, enable your mic, and use headphones. Mic permission works on GitHub Pages (HTTPS). All audio analysis is local to your browser.
5. Local preview: run `python -m http.server 8000` from this directory, then visit `http://localhost:8000/`. Double-clicking `index.html` directly will **not** load the catalog reliably due to browser `file://` fetch restrictions.

> This archive is **ready to publish but not yet uploaded to your GitHub account**. You must create the repository and enable Pages yourself.

## Song folder format

```text
index.html
styles.css
app.js
catalog.json
songs/
  amazing-grace/
    meta.json          # title, credits, BPM, key, filenames, etc.
    backing.mp3        # licensed/self-created audio
    lyrics.lrc         # [mm:ss.xx] timed line lyrics
    notes.json         # start seconds, duration seconds, MIDI pitch
    chart.txt          # optional standard UltraStar chart
    LICENSE.txt        # essential proof of rights/attribution
  auld-lang-syne/
    ...
scripts/
  add_song.py
  rebuild_catalog.py
  generate_demo_library.py
```

The 20 supplied examples are **short simplified practice arrangements**, not complete studio songs. The MP3 audio was **newly synthesized**, featuring a soft guide melody plus basic accompaniment. The chart follows these practice notes (not a commercial release). Public-domain songs were selected to avoid redistributing copyrighted commercial recordings, but legal status of words and arrangements can still vary by country.

### Add a new song

**Method A — UltraStar:** With a licensed MP3/OGG plus matching UltraStar `.txt` chart (absolute beat timings), you can generate notes and LRC lyrics automatically:

```bash
python scripts/add_song.py \
  --slug my-song \
  --title "My Song" --artist "My Band" \
  --audio /path/to/my-song.mp3 \
  --ultrastar /path/to/chart.txt \
  --license-file /path/to/my-rights-and-credits.txt \
  --genre "Pop" --key "C major"
```

**Method B — own note chart + LRC:**

```bash
python scripts/add_song.py \
  --slug original-tune --title "Original Tune" --artist "Me" \
  --audio my-tune.mp3 --notes-json my-notes.json \
  --lyrics my-lyrics.lrc --license-file permission.txt
```

You can also manually create a new song folder (copy one example, replace the files, edit `meta.json`), then run:

```bash
python scripts/rebuild_catalog.py
```

Commit/push the new folder and `catalog.json` to GitHub. The website updates when Pages redeploys. **No player code changes.**

### Format details

`notes.json` uses:

```json
{
  "format": "neon-notes-v1",
  "tempo": 120,
  "notes": [
    {"start": 2.5, "duration": 0.5, "midi": 60, "line": 0},
    {"start": 3.0, "duration": 1.0, "midi": 64, "line": 0}
  ]
}
```

Time is in **seconds from the MP3 start**, MIDI pitch 60 = middle C. Use the timing slider in the player to compensate for small microphone/audio delays. The original chart may use UltraStar units; `add_song.py` converts UltraStar's 4 subbeats per BPM with `#GAP` applied. `#RELATIVE:YES` charts are currently not supported by the importer; convert those charts to absolute beats first.

LRC lines have timestamps such as `[00:02.50] First lyric line`. For precise scoring, test pitch alignment and timing with the actual audio file. Best scores and settings are stored in localStorage in that device/browser only.

## Music and legal notes

A **karaoke or instrumental version of a copyrighted song is not automatically legal to share**. You need the appropriate rights to the underlying composition, lyrics, and **specific sound recording** (plus any required permissions for publishing/syncing lyrics with music). The fact that something is on YouTube or labeled “free karaoke” does not grant redistributing it on GitHub Pages. Keep rights documentation in each `LICENSE.txt`.

The bundled songs use historically/traditionally public-domain melodies and lyrics. Their newly generated recordings and chart data are dedicated to CC0 1.0 to the extent possible. They were generated for practice, are not sourced from a commercial recording, and their melodies may be simplified/approximate. Review public-domain status in your target jurisdiction before broad release.

**GitHub Pages limits:** The published site cannot exceed 1 GB; bandwidth soft limit 100 GB/month; GitHub individual-file limit is 100 MB. For a large production song library, consider a licensed audio storage/CDN provider with explicit distribution rights instead of committing huge MP3s to Git. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Design / technical

- Zero external JavaScript dependencies; pitch detection uses a YIN-style difference function on Web Audio mic input.
- Accurate timing uses the current HTML audio playhead, not wall-clock timers.
- The chart's target pitches are compared to mic estimates in semitones. Octave-equivalence is optional.
- Scoring only counts chart-covered time while playback and the microphone are active; gaps are ignored. Missed notes and silence score zero.
- Mobile-compatible. Microphone capture requires user permission. No recording or upload of the mic stream.
- The repository does **not** need GitHub Actions, a database, or external APIs.

## Project license

Site code: MIT (`LICENSE`). Demo recordings and newly-authored note charts: CC0 where applicable (see the individual song folder `LICENSE.txt`). Historical/traditional melodies and lyrics are not claimed as original works by the project.
