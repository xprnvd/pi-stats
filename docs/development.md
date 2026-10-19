# Development

This section is part of the [pi-stats-poster README](../README.md).

## Layout

One file per job:

- `index.ts` — registers the `/stats` command and hosts the TUI view
- `poster.ts` — renders the poster
- `calendar.ts` — draws the activity calendar
- `stats.ts` — aggregates the scan into a snapshot
- `scan.ts` — reads the session files and caches the parsed counts
- `types.ts` — the data shapes the other files share
- `verify.mjs` — the regression suite
- `docs/` — this documentation

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

The scanner section ends with a ground-truth check: a second implementation of
the counting rules, written against the raw session files rather than against
the extension's code, re-derives every number and the two are compared. If the
extension and the recount ever disagree, one of them is wrong.

Releases go through `scripts/release.mjs`, which bumps the version, refreshes
the lockfile and the pinned tag, and prints the git commands. See
[releasing.md](releasing.md).
