# pi-stats-poster

[![npm](https://img.shields.io/npm/v/pi-stats-poster.svg)](https://www.npmjs.com/package/pi-stats-poster)
[![pi.dev](https://img.shields.io/badge/pi.dev%20package-blue)](https://pi.dev/packages/pi-stats-poster)

A port of opencode's TUI `/stats` poster to [pi](https://pi.dev), the coding
agent. Run `/stats` in interactive mode; `Escape`, `Ctrl+C` (or `q`) closes it.

[![the /stats poster](docs/poster.png)](https://www.npmjs.com/package/pi-stats-poster)

A block-digit token total, a GitHub-style activity calendar, and the best
streak, active days and session count for the current year — computed from
every pi session on this machine.

## Install

From git (this is the current release channel):

```bash
pi install git:github.com/xprnvd/pi-stats
```

That tracks `main`. To pin a release:

```bash
pi install git:github.com/xprnvd/pi-stats@v0.1.2
```

From npm:

```bash
pi install npm:pi-stats-poster
```

Or try it for one invocation without adding it to your settings:

```bash
pi -e git:github.com/xprnvd/pi-stats
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-stats
```

## Requirements

pi 1.3.0 or newer. The poster reads your session history, so it only shows
something once you have used pi.

## Credits and licence

This is a port. The poster, the activity calendar, the block-digit font and the
statistics assembly are adapted from
[opencode](https://github.com/sst/opencode) (MIT, © 2025 opencode); the exact
mapping is in [NOTICE](./NOTICE), which also carries opencode's licence
notice. This package is not affiliated with or endorsed by the opencode
project.

The pi mark in the poster is reproduced from the pi coding agent.

MIT licensed — see [LICENSE](./LICENSE).

## Privacy

The extension reads your session files under `~/.pi/agent/sessions` to count
tokens. **Nothing is sent anywhere**: there is no network call, no telemetry
and no external service in this package. The data stays on your machine and in
your terminal.

A per-file cache of the parsed counts is written to
`~/.pi/agent/pi-stats/cache.json`. Delete it any time; it is rebuilt on the
next run.

## Deliberate differences from opencode

The port is faithful, with the exceptions below. Each one is a consequence of
pi's data model or renderer, not a redesign.

- **Storage.** opencode answers from SQLite. pi has no queryable store, so
  `scan.ts` reads the session JSONLs under `<agent dir>/sessions` and caches
  per-file results keyed on size + mtime. A warm scan of several hundred files
  takes about a second; a cold one a few seconds. The cache lives at
  `<agent dir>/pi-stats/cache.json` and is rewritten atomically.
- **De-duplication.** opencode excludes fork-copied rows in SQL
  (`fork_session_id`). pi copies a fork's messages verbatim into a new file, so
  this port keeps the first file to claim a given message id and drops the rest,
  which keeps totals correct.
- **Subagent transcripts.** `subagent-artifacts/*_transcript.jsonl` duplicates
  runs that already have a `run-N/session.jsonl`, so only real session files are
  read. Subagent sessions still count toward tokens; they are excluded from the
  `sessions` figure, matching opencode's split between sessions and subagents.
- **Sessions vs subagents.** opencode splits on `session.parent_id`: a fork has
  a separate `fork_session_id` and a NULL `parent_id`, so a fork counts as a
  *session*. pi sets `parentSession` on two different things — a forked session
  (`<session>/forks/*.jsonl`) and a subagent run — and older subagent runs carry
  no `parentSession` at all, so the header field cannot be used to tell them
  apart. This port classifies by layout instead: only `run-N/session.jsonl` is
  a subagent, everything else is a session.
- **Token total.** opencode's `TokenUsage.total` adds `reasoning` on top of
  `output`, because opencode's schema treats reasoning as a field disjoint from
  `output`. pi's does not: `Usage.reasoning` is documented as a subset of
  `output` ("`output` already includes these tokens"), and pi's own accounting
  (`core/usage-totals.js`) counts `input + output + cacheRead + cacheWrite`.
  This port uses pi's formula, so the poster's total is computed the way pi
  computes its own instead of overstating it by the reasoning tokens. The
  `reasoning` value is still tracked in the snapshot, it is just not part of
  the total.
- **Usage recorded outside assistant messages.** pi's per-session footer sums
  four sources: assistant messages, `compaction`/`branch_summary` entries,
  tool results that carry their own `usage`, and `usage` entries. This port
  counts the first two. Tool-result usage usually belongs to a nested model
  call that pi-subagents also records in that subagent's own session file, so
  counting it here would double-count it; `usage` entries are emitted by pi's
  cache warmer. The poster's total can therefore sit slightly below the
  footer in pi's own status line.
- **Branding.** opencode's `<Logo />` and `opencode.ai` footer are dropped, and
  the logo slot is filled with pi's own 4×4 startup mark instead. pi's brand
  colours are hardcoded rather than theme-derived, so the mark is the one
  element that ignores the active theme. The Apple Terminal guard is
  reproduced: pi falls back to its wordmark there because half-blocks
  misalign. `piLogoLines` is internal to pi and not exported from the package
  index, so the two lines are reproduced here.
- **Layout.** opencode's boxes default to a column, so the five digit rows
  share a left edge and `TOKENS` sits centred on its own line one row below
  them. pi additionally requires every rendered line to fit the terminal width,
  so lines are normalised to the poster width and clamped, and the three
  metrics fall back from equal columns to natural widths to stacking as the
  poster narrows.
- **Month labels.** opencode left-aligns each month label in its `span * 2`
  field, so the gap varies with how many weeks the month spans (5-week months
  get a wider field) and the first label sits flush against the day gutter with
  no gap at all. This port keeps upstream's field widths but centres each label
  inside its field, which evens the gaps out to 3-4 columns on either side.
- **The host.** opencode renders `/stats` as a full-screen page. pi hosts an
  extension in the input dock, so the poster is centred within the terminal
  rather than within a page, and on a terminal shorter than about 26 rows the
  metric labels are cut off. Everything else is unchanged.

## What is counted

Token usage is summed from every assistant message's recorded `usage`:
`input + output + cacheRead + cacheWrite` — cache reads count, reasoning does
not, because pi reports it as part of `output` (see above). Cost is read from
the recorded value rather than recalculated from a pricing table, as opencode
does; like opencode's poster, it is tracked in the snapshot but not shown on
the poster.

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

## A note on the command name

`/stats` is also the command of
[`preinpost/pi-stats`](https://www.npmjs.com/package/pi-stats), an unrelated
pi package that aggregates usage as text instead of as a poster. pi does not
warn when two extensions register the same command — one of them silently wins.
Install one or the other, not both.

## Licence

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
