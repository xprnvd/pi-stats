/**
 * Port of opencode's `SessionStats.get` (packages/core/src/session/stats.ts)
 * over the scanned session files instead of SQLite.
 *
 * opencode picks its range from `new Date(now.getFullYear(), 0, 1)` to now and
 * passes `tools: "none"`, because the poster shows no tool table. Both are
 * reproduced here unchanged.
 */

import type { CachedFile, SessionStatsInfo, Tokens } from "./types.ts"
import { totalTokens } from "./types.ts"

/** opencode builds a local YTD window and stamps days in the local timezone. */
export function yearToDate(now: number): { from: number; to: number } {
	const start = new Date(now)
	return { from: new Date(start.getFullYear(), 0, 1).getTime(), to: now }
}

/** opencode `makeDateKey`, resolved once rather than per row. */
function makeDateKey(): (time: number) => string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	})
	return (time) => {
		const parts = Object.fromEntries(formatter.formatToParts(time).map((p) => [p.type, p.value]))
		return `${parts.year}-${parts.month}-${parts.day}`
	}
}

/** opencode `dayOrdinal`: UTC ordinal, so DST cannot add or drop a day. */
function dayOrdinal(value: string): number {
	const [year, month, day] = value.split("-").map(Number)
	return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/** opencode `longestStreak`. */
function longestStreak(days: string[]): number {
	return days.reduce(
		(result, day, index) => {
			const previous = days[index - 1]
			const current = previous && dayOrdinal(day) - dayOrdinal(previous) === 1 ? result.current + 1 : 1
			return { current, longest: Math.max(result.longest, current) }
		},
		{ current: 0, longest: 0 },
	).longest
}

function emptyTokens(): Tokens {
	return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
}

export function buildSnapshot(files: Record<string, CachedFile>, now: number): SessionStatsInfo {
	const range = yearToDate(now)
	const dateKey = makeDateKey()
	const activity = new Map<string, number>()
	const tokens = emptyTokens()
	let cost = 0
	let steps = 0
	let prompts = 0
	let sessions = 0
	let subagents = 0

	// A fork copies its parent's messages verbatim, so the same message id can
	// appear in several files. opencode excludes fork-copied rows in SQL; here
	// the first file to claim an id wins, which keeps the total correct.
	const seen = new Set<string>()

	// Deterministic order, so "first file wins" is stable between runs.
	for (const path of Object.keys(files).sort()) {
		const file = files[path]
		if (!file) continue
		let inRange = false
		for (const [id, ts, input, output, reasoning, cacheRead, cacheWrite, recordCost] of file.records ?? []) {
			if (seen.has(id)) continue
			seen.add(id)
			if (ts < range.from || ts >= range.to) continue
			inRange = true
			steps++
			tokens.input += input
			tokens.output += output
			tokens.reasoning += reasoning
			tokens.cacheRead += cacheRead
			tokens.cacheWrite += cacheWrite
			cost += recordCost
			const day = dateKey(ts)
			activity.set(day, (activity.get(day) ?? 0) + 1)
		}
		// Compaction and branch-summary calls add to the token total but are not
		// steps, matching opencode's handling of non-message usage events.
		for (const [id, ts, input, output, reasoning, cacheRead, cacheWrite, recordCost] of file.summaries ?? []) {
			if (seen.has(id)) continue
			seen.add(id)
			if (ts < range.from || ts >= range.to) continue
			tokens.input += input
			tokens.output += output
			tokens.reasoning += reasoning
			tokens.cacheRead += cacheRead
			tokens.cacheWrite += cacheWrite
			cost += recordCost
		}
		for (const [id, ts] of file.prompts ?? []) {
			// A fork copies the parent's user messages verbatim, so the same
			// message id turns up in several files. opencode excludes fork-copied
			// rows in SQL; here the first file to claim an id wins.
			if (seen.has(id)) continue
			seen.add(id)
			if (ts < range.from || ts >= range.to) continue
			inRange = true
			if (file.root) prompts++
		}
		if (!inRange) continue
		// opencode splits `session.parent_id IS NULL` into sessions and subagents.
		if (file.root) sessions++
		else subagents++
	}

	const days = [...activity.entries()].sort(([a], [b]) => a.localeCompare(b))
	return {
		range,
		sessions,
		subagents,
		prompts,
		steps,
		tokens,
		cost,
		activeDays: days.length,
		streak: longestStreak(days.map(([date]) => date)),
		activity: days.map(([date, daySteps]) => ({ date, steps: daySteps })),
	}
}

export { totalTokens }
