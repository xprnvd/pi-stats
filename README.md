# pi-stats-poster

[![npm](https://img.shields.io/npm/v/pi-stats-poster.svg)](https://www.npmjs.com/package/pi-stats-poster)
[![pi.dev](https://img.shields.io/badge/pi.dev%20package-blue)](https://pi.dev/packages/pi-stats-poster)

A port of opencode's TUI `/stats` poster to [pi](https://pi.dev), the coding
agent. Run `/stats` in interactive mode; `Escape`, `Ctrl+C` (or `q`) closes it.

[![the /stats poster](docs/poster.png)](https://www.npmjs.com/package/pi-stats-poster)

*One machine's year to date. The calendar falls back to "Your last N weeks"
when the terminal is too narrow to hold a full year.*

## What it shows

- **The token total** — every assistant call this year, cache reads included.
  Reasoning tokens already sit inside the output count, so they are not added
  twice.
- **The calendar** — a year of activity, one column per week, five shade
  levels.
- **best streak / active days / sessions** — the longest run of consecutive
  active days, the days with any activity at all, and the sessions that had
  some.

## Install

From npm:

```bash
pi install npm:pi-stats-poster
```

From git, tracking `main`:

```bash
pi install git:github.com/xprnvd/pi-stats
```

Add `@v0.1.5` to pin a release. To try it for one invocation without adding
it to your settings:

```bash
pi -e npm:pi-stats-poster
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-stats
```

## Requirements

pi 1.3.0 or newer. The poster reads your session history, so it shows
something only once you have used pi.

## Privacy

The extension reads your session files under `~/.pi/agent/sessions` to count
tokens. **Nothing is sent anywhere**: there is no network call, no telemetry
and no external service in this package. The data stays on your machine and in
your terminal.

A per-file cache of the parsed counts is written to
`~/.pi/agent/pi-stats/cache.json`. Delete it any time; it is rebuilt on the
next run.

## Differences from opencode

The port is faithful. Each difference below is a consequence of pi's data
model or renderer, not a redesign.

| Area | Difference |
| --- | --- |
| Storage | opencode answers from SQLite; pi has no queryable store, so this port reads the session JSONLs under `<agent dir>/sessions` and caches per file on size + mtime. |
| De-duplication | opencode excludes fork-copied rows in SQL (`fork_session_id`); pi copies a fork's messages verbatim into a new file, so the first file to claim a message id keeps it and the rest are dropped. |
| Subagent transcripts | `subagent-artifacts/*_transcript.jsonl` duplicates runs that already have a `run-N/session.jsonl`, so only real session files are read; subagent runs still count toward tokens but are excluded from the `sessions` figure. |
| Sessions vs subagents | opencode splits on `session.parent_id`; pi sets `parentSession` on forks and subagent runs, and older subagent runs omit it, so this port classifies by layout instead: only `run-N/session.jsonl` is a subagent — see [the full difference](docs/differences.md). |
| Token total | opencode's `TokenUsage.total` adds `reasoning` on top of `output`; in pi, `Usage.reasoning` is a subset of `output`, so this port uses pi's four-field sum rather than double-counting — see [the full difference](docs/differences.md). |
| Usage outside assistant messages | pi's per-session footer also counts tool results that carry their own `usage`, and `usage` entries; this port counts assistant messages and `compaction`/`branch_summary` entries, so the poster's total can sit slightly below the footer — see [the full difference](docs/differences.md). |
| Branding | opencode's `<Logo />` and `opencode.ai` footer are dropped, and the logo slot holds pi's own 4×4 startup mark in pi's fixed brand colours. |
| Layout | pi requires every rendered line to fit the terminal width, so lines are normalised to the poster width and clamped, and the three metrics fall back from equal columns to natural widths to stacking as the poster narrows. |
| Month labels | opencode left-aligns each label in its `span * 2` field, which leaves gaps of 0-7 columns; this port keeps the field widths and centres the labels, evening the gaps to 3-4 columns. |
| Metric spacing | opencode's `space-around` keeps each cell at its natural width and spreads the slack as equal gaps; this port uses three equal columns, so the cells land a column or two from where upstream puts them. |
| The host | opencode renders `/stats` as a full-screen page; pi hosts an extension in the input dock, so the poster is centred within the terminal, and on a terminal shorter than about 26 rows the metric labels are cut off. |

The full reasoning for each difference is in [docs/differences.md](docs/differences.md).

## Notes

- **`/stats` is also the command of
  [`preinpost/pi-stats`](https://www.npmjs.com/package/pi-stats)**, an
  unrelated pi package that aggregates usage as text instead of as a poster.
  pi does not warn when two extensions register the same command — one of them
  silently wins. Install one or the other, not both.
- **The poster's total is not pi's footer total.** The formula matches pi's
  own, but pi's footer reads more sources; see the table above.
- **Short terminals clip the metric labels.** Below roughly 26 rows the
  `best streak / active days / sessions` row is cut off, because the poster
  shares the screen with your prompt.

## Files

| File | opencode source |
| --- | --- |
| `poster.ts` | `packages/tui/src/feature-plugins/system/stats.tsx`, `stats-data.ts` |
| `calendar.ts` | `packages/util/src/activity-calendar.ts` |
| `stats.ts` | `packages/core/src/session/stats.ts` |
| `scan.ts` | replaces opencode's SQL query over `session_message` |
| `types.ts` | `packages/schema/src/token-usage.ts` |
| `index.ts` | pi-specific glue: the `/stats` command and the TUI view |

`activityCalendar`, the block-digit glyph table, `statsNumber` and the metric
order are reproduced unchanged; the calendar's UTC ordinal handling and
Thursday month labels are load-bearing and were kept verbatim.

## Documentation

- [docs/differences.md](docs/differences.md) — every difference from opencode,
  with the reasoning
- [docs/counting.md](docs/counting.md) — exactly what the poster counts
- [docs/development.md](docs/development.md) — the test suite and how to run it
- [docs/releasing.md](docs/releasing.md) — publishing a release

## Credits and licence

This is a port. The poster, the activity calendar, the block-digit font and the
statistics assembly are adapted from
[opencode](https://github.com/sst/opencode) (MIT, © 2025 opencode); the exact
mapping is in [NOTICE](./NOTICE), which also carries opencode's licence
notice. This package is not affiliated with or endorsed by the opencode
project.

The pi mark in the poster is reproduced from the pi coding agent.

MIT licensed — see [LICENSE](./LICENSE).
