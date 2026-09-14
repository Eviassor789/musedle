# Musedle

**Music × Wordle.** Name the song from one second of audio. Miss, and you get two. Then four,
eight, sixteen. There is a harder ladder behind a switch that opens on half a second.

Heardle's format, but pointed at **any playlist you paste** — Spotify, YouTube, or a plain
list of songs — instead of one fixed catalogue. Two ways to play: **Hear it**, one second of the
recording, or **Read it**, one line of the words.

```bash
npm install
npm run dev        # http://localhost:3210
```

No API keys, no accounts, no environment variables. It works out of the box.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3210 |
| `npm test` | Unit tests (pure logic, no network) |
| `npm run smoke` | Live check that every import path still works |
| `npm run featured` | Check the home page's suggested playlists still resolve |
| `npm run build` | Production build |

---

## How playlists get in

The hard part of this project isn't the game — it's getting a track list *and* playable audio
out of a link someone pasted. Three findings shaped the whole design.

### Spotify's documented API can't do it

Two changes closed both halves of the obvious approach:

- **`preview_url` was removed in November 2024.** The 30-second preview MP3 is gone from the
  Web API, so Spotify cannot be the audio source through the documented route.
- **Playlist contents are owner-only since the February 2026 migration.** `GET /playlists/{id}`
  now returns *metadata only* — name, cover, owner, track count — for any playlist the
  authenticated user does not own or collaborate on. `/tracks` was replaced by `/items`.

On top of that, Development Mode apps require the owner to hold Spotify Premium and are capped
at 5 users and one Client ID. So "paste a link to any playlist" is not something the official
API supports at all, at any tier a hobby project can reach.

### The embed endpoint gives us both, unauthenticated

`open.spotify.com/embed/playlist/{id}` — the endpoint behind Spotify's own embeddable player —
returns a `__NEXT_DATA__` blob containing the full track list **and** a working
`audioPreview.url` per track. Those MP3s are served with `Access-Control-Allow-Origin: *` and
support range requests, so the browser can stream them directly.

That makes Spotify the *best* source rather than the hardest one: a 30-second preview
comfortably covers a 16-second ladder, playback is sample-accurate, and no YouTube player is
involved at all.

**This surface is undocumented and can change without notice.** It is quarantined in
[`SpotifyEmbedSource.ts`](src/infrastructure/playlist/SpotifyEmbedSource.ts), parses
defensively, and fails with a readable message rather than a stack trace. `npm run smoke` is
how you find out it drifted.

### YouTube search is the expensive half, not playback

`playlistItems.list` costs 1 quota unit per 50 tracks, but `search.list` costs **100 units**
against a 10,000/day allowance — about 100 track lookups per day for the entire app, which a
single 200-song playlist would exhaust twice over.

So resolution goes through YouTube's InnerTube endpoints (no quota, no key), and every result
is cached permanently by `artist + title`, since that mapping never changes. The cache is the
load-bearing part: resolve a track once, globally, and never pay for it again.

### What the device remembers

Three things, in one `localStorage` record, alongside the recently-played row:

| | |
| --- | --- |
| **Start at 0.5s** | Off by default. On, the ladder gains a half-second opening rung — and a sixth guess to pay for it. |
| **Start mid-song** | Off by default. Lifts the clip out of the body of the track instead of the intro. |
| **Last mode played** | Not a preference so much as a memory — leaving a lyrics game should not drop you back on the audio one. |

The default is Heardle's 1/2/4/8/16, because that is the game people already know and a clue this
short should be asked for rather than inflicted. The label under **Hear it** reads the switch
rather than stating a constant, so the picker always names the clue you are actually about to get.

Both toggles live on the front door and nowhere else, because both decide the shape of a round at
the moment it is created: how many rungs the ladder has, and where the clip is cut from. A control
that silently does nothing until the next round is worse than one you have to come back out for.
The game screen is handed a *snapshot* of them, so changing a setting can never rewrite the rules
of a game already in progress.

"Start mid-song" is YouTube-only, and the rule that says so is a domain rule rather than a UI
caveat. A Spotify preview is already a thirty-second excerpt the service chose from the middle of
the song — moving it would be moving a window that has already been moved, and the last rung needs
sixteen of those thirty seconds, so any offset worth calling random would run the clip out of audio
before the ladder finished. Where it does apply, the offset skips the first and last 15% of the
track (idents and count-ins at one end, fades and dead air at the other), guarantees the whole
16-second ladder fits before the outro, and is **seeded on the track** rather than rolled fresh: it
is read during render, and a `Math.random` there would hand back a different answer on every
repaint.

### Lyrics mode

Same near-miss rules; what a miss buys you is different. Instead of more seconds you get more to
read, one thing at a time — a line, then the artist, then a second line, then the album, then a
third. Five attempts, whatever the audio ladder is set to, because the two modes carry their own
ladders: an attempt that reveals nothing new is not an attempt, so switching on the 0.5s rung must
not quietly hand lyrics players a sixth guess that buys them nothing. Words come from
[LRCLIB](https://lrclib.net), which is open, free and needs no key.

Three things had to be got right for it to be playable at all:

- **Lines that give the answer away are dropped.** A clue quoting the title is not a clue. That
  removes some of the most singable lines, which is the correct trade. Matching is done on a key
  with separators stripped entirely, because lyrics punctuate inconsistently — "Dont Stop
  Believin" has to match "Don't Stop Believin'", and keeping spaces leaves the apostrophe as a
  gap that breaks it.
- **The clues are consecutive, from a random starting point.** Each miss reads on from the last,
  so the hints build into a passage rather than three unrelated fragments. Where that passage
  begins is random, because the opening couplet of a track is both the easiest to recognise and
  the least interesting place to start. Seeded on the track id, so a round never re-rolls its
  clue mid-guess.
- **Bad matches are filtered, not just ranked.** `/api/search` returns live bootlegs and
  "MTV Studios 1992" cuts alongside the studio take, and duration is what separates them. Some
  rows carry pasted credits where the words should be; some are timestamped `[02:16.09]` LRC
  data in the plain-text field. All of it gets stripped, and a row with too little left is
  rejected rather than served as a round nobody can win.

The album hint gets the same scepticism. LRCLIB regularly credits a chart compilation instead of
the release — real examples: "Holiday Hits 2023", "Leather and Lace Live", "Deutsche TOP 100
Single_Jahres", "Rap Hip hop Selecta". Those are penalised in ranking and withheld if they win
anyway, because a hint naming the wrong album is worse than no hint. When the album is withheld
that rung spends itself on an extra lyric line instead, so **every miss still pays out something**.

A track with no usable words is passed over for another, up to a bound of twenty — LRCLIB does not
have everything, and an unbounded search would shuffle forever through a playlist it has never
heard of. The player is told which song came up empty, because songs changing underneath you with
no explanation reads as a bug. When the bound is reached, or the shuffle comes back round to a song
already passed over, the round stops and says the playlist is not covered — and offers to play
the same playlist by ear instead, which is the actual remedy rather than just the diagnosis.

### A miss is a fact; a failure is a moment

The lyrics cache remembers both hits and misses forever, and rightly so — the words to a song do
not change, and LRCLIB having never heard of a track is equally durable. But the adapter used to
swallow *every* failure into an empty result: a 503, a rate-limited burst, a dev server reloading
mid-edit. Those came back indistinguishable from "no such song" and were cached with the same
permanence, so one blip turned an ordinary track into a permanent miss for the life of the
process. That is how an Earth, Wind & Fire song ended up reported as having no lyrics.

The adapter now throws `LyricsUnavailableError` rather than returning nothing, and the cache
stores only real answers. A failure is retried the next time the song comes round.

Worth knowing while developing: the cache is held on `globalThis` so that Next's module reloading
does not discard it on every edit, which also means **a poisoned entry survives every edit and
only clears when the process restarts.**

### When the two catalogues spell a name differently

Fixing the normaliser was necessary but not sufficient. The playlist and the lyrics database
routinely disagree about which **script** an artist's name is written in, and the disagreement
runs both ways: LRCLIB credits `Danny Robas` where the playlist says `דני רובס`, and `גידי גוב`
where the playlist says `Gidi Gov`. Neither side is wrong and nothing short of transliteration
can match one to the other, so the structured search returns zero rows for a song the database
plainly has.

So there is a fallback that searches on title alone and ignores the credit entirely — gated hard,
because matching on title alone is precisely how you quote the wrong singer's song. *Three*
separate Israeli artists have a song called `בלעדייך`. The gate is duration: a row is taken only
when the title is all but identical **and** the recording is within seven seconds of the one in
the playlist, closest length first. With no duration to check against there is no fallback at all
— a wrong match is worse than a miss, because a miss moves to the next song while a wrong match
spends a player's whole round on clues from a song that was never in the playlist.

The duration window is **twenty** seconds, not seven, because a YouTube playlist reports the
length of the *video*: sampled against the database, the same songs differ by up to twenty seconds
once idents and dead air are counted. Widening it needed a second guard, so the surviving
candidates must also agree with *each other* to within eight seconds. Rows of the same length are
one recording submitted more than once and it does not matter which is taken; rows of visibly
different lengths are different recordings, and with the credit set aside there is nothing left to
tell them apart.

Four more things were mangling the query before it was ever sent, all from YouTube metadata:

- **A channel is not a credit.** `אריק סיני הערוץ הרשמי Aric Sinai Official` is one artist wearing
  three extra words. Stripping them leaves `אריק סיני Aric Sinai` — and note that *both* spellings
  survive, which is exactly what you want when you cannot transliterate between them.
- **Bilingual titles.** `הגיבן הקדוש | Aaron Razel - The Holy Hunchback` is one song named twice.
  The tail after the pipe is dropped only when the two halves are in **different scripts**, which
  is what distinguishes a restatement from a qualifier: `Bohemian Rhapsody | Live at Wembley` is
  all Latin and survives untouched.
- **The artist echoed into the title.** A channel repeating itself turns a song into
  `אריק איינשטיין כמה טוב שבאת הביתה` — a name no database holds. Leading and trailing runs of
  words already in the credit are dropped; a credit in the *middle* of a title is usually a real
  collaboration, and if the trim would empty the title the original is kept, because a band and
  its song do sometimes share a name.
- **Transliterated runs at either end**, the same restatement habit without the pipe. Which script
  the song belongs to is decided by weight of words rather than by whichever comes first — the
  transliteration is as often at the front (`Aaron Razel - אהבתי את ההתחלה`) as at the back.
- **Video labels in the language the title was written in.** The noise list was English-only, so
  `לא פוגע - הקליפ הרשמי` kept "the official clip" as part of the song's name.

### One normaliser, not four

`normalizeKey` folds case, accents and punctuation away so that near-enough titles match. It used
to be written `[^a-z0-9]+`, which does not fold a non-Latin script — it **erases** it. Hebrew,
Arabic, Greek, Cyrillic and Japanese all reduced to the empty string, and the damage compounded
because the rule had been hand-copied into three more places:

| Where | What the empty key did |
| --- | --- |
| `similarity()` | A song scored 0.00 against its own exact match and was rejected as a mismatch. |
| `usableLyricLines()` | Every line was dropped as unreadable, so no such song could ever clear the minimum. |
| `lyricsQueryKey()` | *Every* non-Latin song shared one cache entry — one cached miss answered for all of them. |
| `trackQueryKey()` | Same collision, for audio: they would all have resolved to the first one's video. And this cache is written to disk, so it outlived the session that poisoned it. |

The last two are the serious ones: a cache that collides does not miss, it answers confidently
with a different song's data. A real `.cache/resolutions.json` from development contained the
`"|"` entry, plus `"asia engineer|"` and `"kishidan hiroshi kitadani|"` — Japanese tracks from the
*featured* playlists, so this was never only a Hebrew problem.

All four now share the one normaliser, built on `\p{L}`/`\p{N}` so every script survives, and the
cache keys fall back to the raw text rather than an anonymous empty bucket when normalising leaves
nothing at all. Latin keys are byte-identical to before — asserted by a test, because otherwise
every cache entry on disk would be orphaned.

### What you can paste

| Input | Track list from | Audio from |
| --- | --- | --- |
| Spotify playlist or album link | Embed endpoint | Spotify preview MP3 (direct, precise) |
| YouTube / YouTube Music playlist link | InnerTube `browse` | YouTube IFrame player |
| A list of songs, one per line | Parsed directly | Resolved via YouTube Music |

Private playlists, and Spotify's personalised ones (Discover Weekly, Daily Mix), can't be read
by anyone but their owner and will report that clearly.

---

## Architecture

Ports and adapters. The rules of the game are pure and know nothing about where audio comes
from; everything volatile is an adapter behind an interface.

```
src/
├── domain/                      pure, no I/O, fully unit-tested
│   ├── GameEngine.ts            the 1/2/4/8/16 ladder as a finite state machine
│   ├── Session.ts               rounds, streaks and stats as one pure reduction
│   ├── entities/                Track, Playlist, AudioSource
│   └── rules/                   SnippetLadder, LyricLadder, startOffset, similarity
│
├── application/
│   ├── ports/                   PlaylistSource · TrackResolver · ResolutionCache · AudioEngine
│   └── usecases/ImportPlaylist  registry + resolution + de-duplication
│
├── infrastructure/              one adapter per external system
│   ├── playlist/                SpotifyEmbedSource · YouTubePlaylistSource · TextListSource
│   ├── resolver/                YouTubeMusicResolver + CachedTrackResolver (decorator)
│   ├── cache/                   Memory · File · Tiered
│   ├── audio/                   HtmlAudioEngine · YouTubeIframeEngine · CompositeAudioEngine
│   ├── youtube/                 InnerTubeClient + defensive tree traversal
│   └── container.ts             composition root — the only file that wires concretes
│
├── presentation/                React components and hooks
│   ├── PlayerDeck               record + wave, below the guess rows
│   ├── VinylRecord              the transport control, as a spinning record
│   ├── WaveformScrubber         wave, ladder and scrubber as one row
│   ├── waveformPlaceholder      per-track stand-in for undecodable audio
│   ├── RevealPlayer             listen to the whole track once the round ends
│   ├── SettingsPanel            the two knobs that change what a round is
│   ├── settings.ts              what this device remembers, parsed field by field
│   └── recentPlaylists.ts       the last few playlists played, as a shortcut row
└── app/                         Next routes; the API handler is deliberately thin
```

Three things this buys:

- **Adding a source is one file plus one registry line.** Apple Music or Deezer would not touch
  the game, the API route, or the UI.
- **The game never learns how audio works.** `CompositeAudioEngine` routes each track to the
  MP3 or YouTube engine by its source kind, so a single playlist can mix both and nothing above
  that line notices. Swapping in a licensed audio provider later is one new adapter.
- **The rules are testable without a browser.** `GameEngine` and `Session` are pure reducers;
  there is no way for the UI to disagree with the game state because it derives everything.

### Cutting a snippet accurately

The naive version — poll `getCurrentTime()` in `requestAnimationFrame` — has a bug that only
shows up under load: rAF is throttled hard when a page is backgrounded, occluded, or rendered
offscreen, sometimes to **one frame per second**. That makes the length of the clue depend on
the frame rate, and any watchdog living inside that loop stops working exactly when it's needed.

[`SnippetCutter`](src/infrastructure/audio/SnippetCutter.ts) runs the cut on self-correcting
timers and demotes rAF to painting the progress bar. Measured end to end at 1fps:

| Source | 1s clue | 2s clue |
| --- | --- | --- |
| Spotify preview MP3 | 1.0049s | 2.0036s |
| YouTube IFrame | 1.0037s | — |

Snippets are measured against the *media's own playback position*, never wall-clock time, so a
buffering hiccup delays the clue rather than eating it. Position is reported from that same
timer rather than from the frame loop — the playhead decides where the next press resumes, so
it is game state, and a hidden tab (where rAF is suspended outright) must not freeze it.

The canvas carries the same rule. Sizing it once on mount is not enough: layout has often not
settled, the element measures zero, and the backing store keeps its default 300×150 while CSS
stretches it across the real width — which resamples bars away entirely. A `ResizeObserver` was
supposed to correct that, but its callbacks are delivered with the rendering lifecycle, so a
hidden pane leaves the canvas mis-sized indefinitely. The size is checked inside the draw loop,
and the wave paints once synchronously so it is correct even before a frame arrives.

### A NaN draws nothing at all

Bars went missing from the middle of the waveform, and the cause is worth recording because the
failure is completely silent. Levels are stored in a `Float32Array`, but the minimum was tracked
from the **float64** value before storing it. Float32 rounding can go *down*, so the quietest
bucket came out fractionally below that minimum, `Math.pow(negative, 0.85)` returned `NaN`, and
a bar with a `NaN` height draws nothing whatsoever — no error, no warning, just a gap.

The fix reads each value back out of the array before comparing, so both sides of the subtraction
are the same precision. `bucketLevels` moved into its own module to be tested directly, and the
draw loop now refuses non-finite heights as a backstop: a wrong bar is recoverable, an invisible
one is not.

Previews are also not a fixed length — sampling one playlist gave anything from 15.1s to 30.1s,
with **2 of 12 shorter than the 16-second final rung**. When the clip runs out before the
snippet is satisfied, the playback position simply stops advancing short of its target, so the
cutter takes an explicit `isExhausted` signal rather than waiting for a moment that will never
arrive.

### One row, not two

The wave, the ladder and the scrubber are a single control. The decision that makes it work is
that bars are indexed by **song time across the whole ladder**, not by position within the
current clip — so locked audio is just the dark tail of the same wave, and three tones carry the
whole state: lit for what the playhead has passed, mid for unlocked-but-not-yet-reached, dark
for still locked.

Colour and shape are deliberately separate concerns:

- **Shape is fixed, and there from the start.** The clip is decoded up front rather than
  sampled as it plays, so the whole song's wave is on screen before the first press. Sampling
  the running audio could only ever draw the part already heard.
- **Colour follows the playhead**, exactly like an ordinary progress bar. Rewind to the start
  and the whole clue goes grey again; it is not a record of what you once heard.
- **Any earned second is replayable.** A bar's x position already means a time, so the wave is
  a scrubber for free — drag it, or arrow-key it (Shift for one-second steps, Home/End for the
  ends).
- **A bar lights only once the playhead has covered most of it.** A bar spans ~285ms, so
  lighting it the instant the playhead touches its left edge turns the bar straddling the unlock
  boundary green while most of the audio it stands for has not been heard — it reads as the clue
  leaking past its own limit.
- **Skipping mid-listen extends rather than restarts.** The engine moves its own finish line, so
  the clip you are in the middle of keeps going. Skipping while stopped plays the newly unlocked
  clue from the top instead.

### Choosing a song is the guess

There is no confirm step in the guess box: picking a song - by click, tap or Enter - submits it.
Nothing about a second press decides anything, because the list only ever holds songs from this
playlist, and a song already guessed is removed from it. That leaves the only possible mistake as
picking the wrong song, which a Submit button would not have caught either. So there is no Submit
button.

### Somewhere to start

The home page also remembers the last few playlists you played, in this browser, as a row of
covers. Artwork carries it: you recognise a playlist you have played before by its cover long
before you finish reading its name. Kept in `localStorage` behind guarded reads - storage throws
outright in some privacy modes, and a shortcut row is never worth taking the page down for - and
read after mount, since seeding React state from storage during render would make the first
client render disagree with the prerendered HTML.

The home page puts your own playlist first and ours second: anyone arriving with something in
mind shouldn't scroll past our suggestions to use it, and anyone without one finds ten one-tap
playlists directly below — a decade run from the 50s to the 2010s, plus current, all-time and
rock.

Those are Spotify's own editorial playlists, reached through the same undocumented endpoint as
everything else, and Spotify retires and re-points them without notice. `npm run featured`
checks each id still resolves **and** still returns the title its label promises. That check
earned itself immediately: two ids that looked right while drafting the list turned out to point
at a 2025 singles chart and a house compilation. There is deliberately no "2020s" card — Spotify
publishes no public *All Out 2020s*, and a decade label pointing at something that is not that
decade is worse than no card.

### The accent belongs to the source

The base is a fixed studio dark (`#121213` app, `#1E1E24` surfaces). Green is the house colour
and the default; the accent only moves when a playlist brings its own identity, which today means
YouTube red. A single `data-source` attribute on the game wrapper redeclares three custom
properties, and everything downstream follows: buttons, the record label, the waveform, the focus
ring, the dot beside the source name.

One trap worth recording, because it fails silently. The obvious implementation is an alias —
`--color-accent: var(--accent)` in the theme block, with each source overriding `--accent`. It
does not work: a custom property is substituted **where it is declared**, not where it is used,
so the alias resolves once against the root value and every scoped override is ignored. Each
scope has to redeclare the real colours.

The canvas has the matching version of the same trap: it reads its colours from the *canvas
element*, not from `document.documentElement`, because the root never sees the scoped value.

Feedback colours are the exception that stays fixed, and deliberately so. Tying "correct" to the
accent reads well on Spotify and fails completely on YouTube, where a right answer would come out
in the same red as a wrong one. So a win is always green `#1DB954`, a miss always coral
`#E63946`, and the right artist on the wrong song always gold `#FFD166` — regardless of which
service the playlist came from.

### Drawing a waveform of a modern master

Reducing 16 seconds to 56 bars is where the loudness war shows up. Measured against a real
track, **peak-per-bucket had a mean of 0.92 and a minimum of 0.64** — brick-wall limiting means
the loudest sample in any 285ms window is essentially always full scale, so a peak-based wave
draws a flat line. Two corrections give it a readable shape:

- **RMS instead of peak**, which tracks perceived loudness and actually moves between a verse
  and a chorus.
- **Normalised across the range the track occupies**, not against silence. Even RMS only spanned
  0.50 to 1.00 on that track; dividing by the maximum leaves every bar in the top half of the
  display.

Tracks whose audio cannot be decoded at all — YouTube, playing inside a cross-origin iframe —
get a placeholder seeded from the track id, so no two songs share a silhouette.

Decoding a *copy* of the file is also why the visualiser can no longer break playback. The
earlier live-analyser version had to call `createMediaElementSource`, which permanently reroutes
the audio element into a Web Audio graph and silences the game outright if that graph cannot
start. Nothing in the current path touches the element.

---

## Known limitations

- **YouTube's terms require the embedded player to be visible and at least 200×200.** A
  hide-the-video guessing game is in tension with that. Spotify-sourced playlists never touch
  the YouTube player, which is one more reason they're the better default; this is fine for
  personal use and is the thing to resolve before putting it in front of an audience.
- **Long playlists are truncated.** Both providers return roughly the first 100 tracks. The
  playlist reports `truncated` when it hit the cap; continuation-token paging isn't implemented.
- **Undocumented endpoints.** Both the Spotify embed and InnerTube can change without notice.
  They're isolated and defensively parsed, but `npm run smoke` is what tells you they broke.
- **Progress is per-session.** Stats live in memory and reset on reload — no database, no
  accounts, no daily puzzle yet.
- **Lyrics coverage falls off outside English.** LRCLIB is community-contributed, so this is a
  property of the catalogue rather than of the code. Sampling eight well-known Hebrew songs, it
  had three. Where it has a song the round now plays properly; where it doesn't, the round says
  so and offers the same playlist by ear. A title-only fallback search was tried and rejected:
  every candidate it surfaced was a *different artist's* song of the same name, so it would have
  quoted the wrong song's words rather than found the right ones.
- **The waveform is only real for Spotify tracks.** Their preview MP3s are CORS-open, so the
  audio is routed through a Web Audio `AnalyserNode` and the bars are genuine RMS levels.
  YouTube audio plays inside a cross-origin iframe and cannot be read at all, so those tracks
  get an acknowledged stand-in shape — deliberately smooth, so it reads as a visualiser rather
  than impersonating a signal nothing measured.

## Where it would go next

Deterministic daily puzzles seeded by playlist + date (so everyone gets the same song),
persistent stats, and shareable playlist rooms. The session reducer already models rounds and
streaks, so most of that is persistence rather than new rules.
