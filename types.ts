/**
 * Shape of the data behind the poster, mirroring opencode's `SessionStatsInfo`
 * (packages/core/src/session/stats.ts) with pi's session-JSONL fields.
 */

export interface Tokens {
	input: number
	output: number
	/** Reported by providers that break down thinking tokens. A SUBSET of `output`. */
	reasoning: number
	cacheRead: number
	cacheWrite: number
}

/**
 * The token total, matching pi's own accounting
 * (`core/usage-totals.js`: input + output + cacheRead + cacheWrite).
 *
 * opencode's `TokenUsage.total` adds `reasoning` on top, because opencode's
 * schema treats reasoning as a field disjoint from `output`. pi's does not:
 * `Usage.reasoning` is documented as a subset of `output` ("`output` already
 * includes these tokens"), so adding it here would double-count. Upstream
 * fidelity would therefore overstate the poster by the reasoning tokens.
 */
export function totalTokens(tokens: Tokens): number {
	return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite
}

/**
 * One assistant model call. `id` is the pi message id, reused verbatim when a
 * session is forked, so it doubles as the de-duplication key.
 */
export type UsageRecord = [
	/** message id */
	id: string,
	/** epoch ms */
	ts: number,
	input: number,
	output: number,
	reasoning: number,
	cacheRead: number,
	cacheWrite: number,
	cost: number,
]

/** A user prompt: the message id, reused verbatim when a session is forked. */
export type PromptRecord = [
	/** message id */
	id: string,
	/** epoch ms */
	ts: number,
]

/** What one session file contributed, cached by size + mtime. */
export interface CachedFile {
	size: number
	mtimeMs: number
	sessionId: string
	/** The session this file was forked from, when it was a fork. */
	parentSessionId?: string
	/** The session's display name, when it has one. */
	sessionName?: string
	/** True for a top-level session; false for a subagent session. */
	root: boolean
	/** Assistant model calls, in file order. */
	records: UsageRecord[]
	/**
	 * Model calls recorded outside the message stream — `compaction` and
	 * `branch_summary` entries carry their own `usage`. These add to the token
	 * total but, like opencode's non-message usage events, are not steps.
	 */
	summaries: UsageRecord[]
	/** Epoch ms of each user prompt, with its message id, in file order. */
	prompts: PromptRecord[]
}

export interface StatsCache {
	version: number
	files: Record<string, CachedFile>
}

export interface SessionStatsInfo {
	range: { from: number; to: number }
	sessions: number
	subagents: number
	prompts: number
	steps: number
	tokens: Tokens
	cost: number
	activeDays: number
	streak: number
	activity: { date: string; steps: number }[]
}
