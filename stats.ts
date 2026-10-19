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

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

/**
 * The ids each file inherits from an ancestor.
 *
 * A fork copies its parent's messages, compaction entries and prompts
 * verbatim, so the copy is dropped and the ancestor keeps them. Ids that two
 * unrelated sessions happen to share are not related by ancestry, so both are
 * counted - pi's entry ids are unique within a session but only 32 bits wide.
 */
function inheritedIds(files: Record<string, CachedFile>): Map<string, Set<string>> {
	const byId = new Map<string, CachedFile>()
	for (const file of Object.values(files)) byId.set(file.sessionId, file)

	const inherited = new Map<string, Set<string>>()
	for (const [path, file] of Object.entries(files)) {
		const ancestors: CachedFile[] = []
		const seen = new Set<string>()
		let parentId = file.parentSessionId
		while (parentId && !seen.has(parentId)) {
			seen.add(parentId)
			const parent = byId.get(parentId)
			if (!parent) break
			ancestors.push(parent)
			parentId = parent.parentSessionId
		}
		if (ancestors.length === 0) continue

		const parentIds = new Set<string>()
		for (const ancestor of ancestors) {
			for (const [id] of ancestor.records ?? []) parentIds.add(id)
			for (const [id] of ancestor.summaries ?? []) parentIds.add(id)
			for (const [id] of ancestor.prompts ?? []) parentIds.add(id)
		}
		if (parentIds.size === 0) continue

		const copies = new Set<string>()
		for (const [id] of file.records ?? []) if (parentIds.has(id)) copies.add(id)
		for (const [id] of file.summaries ?? []) if (parentIds.has(id)) copies.add(id)
		for (const [id] of file.prompts ?? []) if (parentIds.has(id)) copies.add(id)
		if (copies.size > 0) inherited.set(path, copies)
	}
	return inherited
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

	// A fork copies its parent's messages, compaction entries and prompts
	// verbatim, so the same id turns up in several files. opencode excludes
	// fork-copied rows in SQL; here the ancestor keeps them and the copy is
	// dropped.
	//
	// The de-duplication is scoped to a file's ancestry. pi's entry ids are
	// unique inside a session but only 32 bits wide, so two unrelated
	// sessions can collide by accident - those are different messages that
	// happen to share an id, and both count.
	const copies = inheritedIds(files)

	for (const path of Object.keys(files).sort()) {
		const file = files[path]
		if (!file) continue
		const inherited = copies.get(path) ?? EMPTY_IDS
		let inRange = false
		for (const [id, ts, input, output, reasoning, cacheRead, cacheWrite, recordCost] of file.records ?? []) {
			if (inherited.has(id)) continue
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
			if (inherited.has(id)) continue
			if (ts < range.from || ts >= range.to) continue
			tokens.input += input
			tokens.output += output
			tokens.reasoning += reasoning
			tokens.cacheRead += cacheRead
			tokens.cacheWrite += cacheWrite
			cost += recordCost
		}
		for (const [id, ts] of file.prompts ?? []) {
			if (inherited.has(id)) continue
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
