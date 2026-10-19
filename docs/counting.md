# What is counted

This section is part of the [pi-stats-poster README](../README.md).

Token usage is summed from every assistant message's recorded `usage`:
`input + output + cacheRead + cacheWrite` — cache reads count, reasoning does
not, because pi reports it as part of `output` (see the
[differences table](differences.md)). Cost is read from the recorded value
rather than recalculated from a pricing table, as opencode does; like
opencode's poster, it is tracked in the snapshot but not shown on the poster.

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

The poster's total can sit slightly below pi's own per-session footer,
because the two read different sources. The "Usage outside assistant
messages" row in [differences.md](differences.md) sets out exactly which
usage pi's footer counts that the poster does not.
