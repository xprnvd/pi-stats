# Differences from opencode

The port is faithful. Each difference below is a consequence of pi's data
model or renderer, not a redesign. This page is part of the
[pi-stats-poster README](../README.md).

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
| Month labels | opencode left-aligns each label in its `span * 2` field, which leaves gaps of 0-7 columns and the first label flush against the day gutter. This port keeps the field widths and centres the labels, splitting the same slack evenly — 2-3 columns before the label, 3-4 after. |
| Metric spacing | opencode's `space-around` keeps each cell at its natural width and spreads the slack as equal gaps. This port uses three equal columns, so the cells land a column or two from where upstream puts them. The labels never collide either way. |
| The host | opencode renders `/stats` as a full-screen page. pi hosts an extension in the input dock, so the poster is centred within the terminal rather than a page, and on a terminal shorter than about 26 rows the metric labels are cut off. |
| Extras | opencode binds only `escape` to close the view. This port also accepts `Ctrl+C` and `q`, shows the scan's progress while it runs, and adds a note under the poster when session files could not be read. |

## File map

Each file in this package, and the opencode source it was ported from:

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

The full reasoning for each difference is on this page. Back to the
[pi-stats-poster README](../README.md).
