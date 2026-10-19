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

Add `@v0.1.4` to pin a release. To try it for one invocation without adding
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

## What is counted

Token usage is summed from every assistant message's recorded `usage`:
`input + output + cacheRead + cacheWrite` — cache reads count, reasoning does
not, because pi reports it as part of `output` (see the table below). Cost is
read from the recorded value rather than recalculated from a pricing table, as
opencode does; like opencode's poster, it is tracked in the snapshot but not
shown on the poster.

An assistant message with no recorded usage still counts as a step, matching
opencode, which counts every assistant row.

pi also records usage on `compaction` and `branch_summary` entries, which are
model calls that never appear as a message. Those add to the token total but,
like opencode's non-message usage events, are not counted as steps and do not
appear in the activity calendar.

The range is hardcoded to 1 January of the current year through now, and the
timezone is the local one — the same defaults the opencode poster uses.

Session files that cannot be read are reported as a note under the poster
instead of being silently dropped from the totals, and the scan shows its
progress while it runs.

## Differences from opencode

The port is faithful. Each difference below is a consequence of pi's data
model or renderer, not a redesign.

| Area | Difference |
| --- | --- |
| Storage | opencode answers from SQLite. pi has no queryable store, so this port reads the session JSONLs under `<agent dir>/sessions` and caches per file on size + mtime. A warm scan of several hundred files takes about a second. The cache lives at `<agent dir>/pi-stats/cache.json` and is rewritten atomically. |
| De-duplication | opencode excludes fork-copied rows in SQL (`fork_session_id`). pi copies a fork's messages verbatim into a new file, so the first file to claim a message id keeps it and the rest are dropped. |
| Subagent transcripts | `subagent-artifacts/*_transcript.jsonl` duplicates runs that already have a `run-N/session.jsonl`, so only real session files are read. Subagent runs still count toward tokens; they are excluded from the `sessions` figure, matching opencode's split between sessions and subagents. |
| Sessions vs subagents | opencode splits on `session.parent_id`, where a fork keeps a NULL `parent_id` and counts as a session. pi sets `parentSession` on both forks and subagent runs, and older subagent runs omit it, so this port classifies by layout instead: only `run-N/session.jsonl` is a subagent. |
| Token total | opencode's `TokenUsage.total` adds `reasoning` on top of `output`, because its schema treats the two as disjoint. In pi, `Usage.reasoning` is a subset of `output` ("`output` already includes these tokens"), so this port uses pi's four-field sum rather than double-counting. The `reasoning` value is still tracked in the snapshot, just not part of the total. |
| Usage outside assistant messages | pi's per-session footer also counts tool results that carry their own `usage`, and `usage` entries. This port counts assistant messages and `compaction`/`branch_summary` entries. Tool-result usage usually belongs to a nested call that pi-subagents also records in the subagent's own session file, so counting it here would double-count it; `usage` entries come from pi's cache warmer. The poster's total can therefore sit slightly below the footer. |
| Branding | opencode's `<Logo />` and `opencode.ai` footer are dropped, and the logo slot holds pi's own 4×4 startup mark. The mark keeps pi's fixed brand colours rather than following the theme, and pi's Apple Terminal fallback is reproduced. |
| Layout | pi requires every rendered line to fit the terminal width, so lines are normalised to the poster width and clamped, and the three metrics fall back from equal columns to natural widths to stacking as the poster narrows. |
| Month labels | opencode left-aligns each label in its `span * 2` field, which leaves gaps of 0-7 columns and the first label flush against the day gutter. This port keeps the field widths and centres the labels, evening the gaps to 3-4 columns. |
| Metric spacing | opencode's `space-around` keeps each cell at its natural width and spreads the slack as equal gaps. This port uses three equal columns, so the cells land a column or two from where upstream puts them. The labels never collide either way. |
| The host | opencode renders `/stats` as a full-screen page. pi hosts an extension in the input dock, so the poster is centred within the terminal rather than a page, and on a terminal shorter than about 26 rows the metric labels are cut off. |

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

## Development

```bash
npm install       # dev dependencies (the pi packages, needed by the test suite)
npm test          # the regression suite
```

The package ships TypeScript source and is loaded by pi's extension loader;
it is not a Node library, so it has no `main` entry point.

`verify.mjs` diffs the renderer against opencode's own algorithms, copied
verbatim into the script: block-digit content, a shared left edge across the
five digit rows, the `TOKENS` label position, the calendar day rows
cell-for-cell, the month row's field widths, no line overflow at twelve widths
by five heights, metric labels that never collide, and the pi mark appearing
only when the poster is not compact.

The render checks run against synthetic snapshots with fixed token totals, so
they do not depend on the machine's own session history — a total of `0` or `8`
makes digit row 0 identical to digit row 4, which breaks any lookup that
assumes the five rows differ. The scanner checks run against a throwaway agent
directory and cover stray files, fork de-duplication, fork classification,
cache reuse, a corrupt cache and an aborted scan. The pi install path and the
theme are resolved at run time, so a pi upgrade does not break the script.

## Releasing

Publishing uses npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers): CI
authenticates with the workflow's OIDC identity, so there is no npm token in
this repository and nothing long-lived to rotate or leak. npm generates the
provenance attestation automatically.

The trust configuration lives on the package's npm page (Packages →
pi-stats-poster → Settings → Trusted Publisher → GitHub Actions):

| Field | Value |
| --- | --- |
| Organization or user | `xprnvd` |
| Repository | `pi-stats` |
| Workflow filename | `ci.yml` |

To release:

1. bump `version` in `package.json`, then `npm install` to refresh
   `package-lock.json`
2. update the pinned tag in the Install section above
3. commit and push
4. `git tag -a v0.2.0 -m "v0.2.0" && git push origin main --follow-tags`

The tag runs CI, which publishes the version. The workflow refuses to publish
if the tag does not match the version in `package.json`, and `npm test` gates
every publish.

## Credits and licence

This is a port. The poster, the activity calendar, the block-digit font and the
statistics assembly are adapted from
[opencode](https://github.com/sst/opencode) (MIT, © 2025 opencode); the exact
mapping is in [NOTICE](./NOTICE), which also carries opencode's licence
notice. This package is not affiliated with or endorsed by the opencode
project.

The pi mark in the poster is reproduced from the pi coding agent.

MIT licensed — see [LICENSE](./LICENSE).
