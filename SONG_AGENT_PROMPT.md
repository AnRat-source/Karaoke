# RatUTA song-catalog prompt

Use this prompt when asking another agent to add songs:

```text
Work in D:\Github\Karaoke. Add the following songs to the RatUTA karaoke catalog: [PASTE SONGS HERE].

Requirements:
- Add entries to catalog.json only; do not host, download, copy, or commit copyrighted music or lyrics.
- Use an official YouTube music video as youtubeId/youtubeUrl and a separately embeddable YouTube karaoke/instrumental video as karaokeYoutubeId.
- Verify that both YouTube videos permit embedding. Never use Sing King or a creator listed in the repository's embed-block list.
- Use a unique five-digit song code, stable lowercase id, title, artist, genre, duration, key, and blurVideo value.
- Lyrics must come from LRCLIB at runtime. Never save lyric text locally.
- Prioritize genuine word-by-word lyrics: search LRCLIB, then verify the exact candidate with GET /api/get/{id}. Only set lyricLrclibId when hasWordSync is true, syncedLyrics is present, and the record matches the same artist, recording, and arrangement.
- Never substitute a cover, remix, instrumental, or unrelated song solely because it has word timing. If the correct recording has no word-timed record, use its best line-synced LRCLIB record and report it as an exception.
- Match the LRCLIB record to the selected karaoke audio's duration and arrangement as closely as possible. Set lyricOffsetMs and karaokeOffsetMs to 0 unless a tested offset is needed.
- Set ultraStarChartUrl only for public, reachable, properly licensed UltraStar charts. Do not download commercial songs or generate charts from unauthorized audio.
- Preserve every existing catalog entry, operator timing adjustment, and lyricsSynced tag.
- Check JSON validity plus `node --check app.js` and `node --check songbook.js`.
- Test each added song: queue selection, Play readiness, embeddable audio, lyric status, and mobile-safe layout.
- Commit all catalog changes with a clear message and push to origin/main.
- Report song codes, YouTube providers, LRCLIB record IDs, whether each lyric source is word-timed or line-timed, any offsets, and any verification exceptions.
```
