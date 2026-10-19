/**
 * Incremental reader over pi's session JSONLs.
 *
 * opencode answers `/stats` from SQLite with one indexed query per 31-day
 * window. pi has no queryable store, so the equivalent is a per-file cache
 * keyed on size + mtime: unchanged files are never re-parsed.
 */

import { promises as fs } from "node:fs"
import { join } from "node:path"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import type { CachedFile, PromptRecord, StatsCache, UsageRecord } from "./types.ts"

const CACHE_VERSION = 4

/**
 * A subagent run persists as `<parent>/<child>/run-N/session.jsonl`.
 *
 * This path, not the `parentSession` header field, decides whether a file is a
 * session or a subagent. pi sets `parentSession` on two different things: a
 * forked session (`<parent>/forks/*.jsonl`, which opencode counts as a
 * *session*, because opencode tracks forks with a separate `fork_session_id`
 * column and leaves `parent_id` NULL) and a subagent run. Older subagent runs
 * carry no `parentSession` at all, so the header field cannot be trusted in
 * either direction.
 */
const SUBAGENT_PATH = /\/run-\d+\/session\.jsonl$/

export interface ScanOptions {
	signal?: AbortSignal
	onProgress?: (completed: number, total: number) => void
}

export interface ScanResult {
	files: Record<string, CachedFile>
	/** Files skipped or unreadable, for diagnostics. */
	problems: string[]
}

export function sessionRoot(): string {
	return join(getAgentDir(), "sessions")
}

export function cachePath(): string {
	return join(getAgentDir(), "pi-stats", "cache.json")
}

async function walk(root: string, signal: AbortSignal | undefined, problems: string[]): Promise<string[]> {
	const found: string[] = []
	const visit = async (dir: string): Promise<void> => {
		signal?.throwIfAborted()
		let entries: Awaited<ReturnType<typeof fs.readdir>>
		try {
			entries = await fs.readdir(dir, { withFileTypes: true })
		} catch (error) {
			// An unreadable directory means its sessions are missing from the
			// totals. Record it rather than silently dropping them.
			problems.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`)
			return
		}
		for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
			if (entry.name.startsWith(".")) continue
			const full = join(dir, entry.name)
			if (entry.isDirectory()) await visit(full)
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full)
		}
	}
	try {
		await visit(root)
	} catch (error) {
		// An abort must not be swallowed: the caller asked us to stop.
		if (signal?.aborted) throw error
		// No session root yet: an empty scan is a valid result.
		problems.push(`${root}: ${error instanceof Error ? error.message : String(error)}`)
	}
	return found
}

/**
 * pi-subagents also writes `subagent-artifacts/*_transcript.jsonl`, a second
 * record of runs that already have a `run-N/session.jsonl`. Reading both would
 * double-count those runs, so only real session files are indexed.
 */
function isSessionFile(path: string): boolean {
	return !path.includes("subagent-artifacts/")
}

async function parseFile(path: string, size: number, mtimeMs: number): Promise<CachedFile | undefined> {
	const raw = await fs.readFile(path, "utf8")
	const lines = raw.split("\n")
	let header: Record<string, unknown> | undefined
	const records: UsageRecord[] = []
	const summaries: UsageRecord[] = []
	const prompts: PromptRecord[] = []

	for (const line of lines) {
		if (!line.trim()) continue
		let entry: Record<string, unknown>
		try {
			entry = JSON.parse(line)
		} catch {
			continue // A partially flushed final line; the next scan picks it up.
		}
		if (entry.type === "session") {
			header ??= entry
			continue
		}
		// Compaction and branch summaries are model calls that never appear as a
		// message, but pi records their usage on the entry itself.
		if ((entry.type === "compaction" || entry.type === "branch_summary") && isUsage(entry.usage)) {
			summaries.push(usageRecord(`${String(entry.type)}:${String(entry.id)}`, entry.timestamp, entry.usage))
			continue
		}
		if (entry.type !== "message") continue
		const message = entry.message as Record<string, unknown> | undefined
		if (!message) continue
		if (message.role === "user") {
			const ts = timestampOf(message.timestamp ?? entry.timestamp)
			if (typeof ts === "number") prompts.push([String(entry.id ?? `${path}#${prompts.length}`), ts])
			continue
		}
		if (message.role !== "assistant") continue
		// opencode counts every assistant row as a step, even one with no
		// recorded usage, so an assistant message is always a step.
		const id = String(entry.id ?? `${path}#${records.length}`)
		records.push(isUsage(message.usage) ? usageRecord(id, message.timestamp ?? entry.timestamp, message.usage) : [id, 0, 0, 0, 0, 0, 0, 0])
	}

	if (!header) return undefined
	const sessionId = typeof header.id === "string" ? header.id : path
	return { size, mtimeMs, sessionId, root: !SUBAGENT_PATH.test(path), records, summaries, prompts }
}

function isUsage(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

/** Builds a usage tuple, tolerating a missing or partial `usage` object. */
function usageRecord(id: string, timestamp: unknown, usage: Record<string, unknown>): UsageRecord {
	const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)
	const cost = (typeof usage.cost === "object" && usage.cost !== null ? usage.cost : {}) as Record<string, unknown>
	const ts = timestampOf(timestamp)
	return [
		id,
		ts ?? 0,
		number(usage.input),
		number(usage.output),
		number(usage.reasoning),
		number(usage.cacheRead),
		number(usage.cacheWrite),
		number(cost.total),
	]
}

function timestampOf(value: unknown): number | undefined {
	if (typeof value === "string") {
		const parsed = Date.parse(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}
	return typeof value === "number" ? value : undefined
}

async function readCache(): Promise<StatsCache> {
	try {
		const parsed = JSON.parse(await fs.readFile(cachePath(), "utf8")) as StatsCache
		if (parsed.version === CACHE_VERSION && parsed.files) {
			// A hand-edited or truncated entry must not be able to break the view.
			for (const entry of Object.values(parsed.files)) {
				if (!entry || !Array.isArray(entry.records)) return { version: CACHE_VERSION, files: {} }
			}
			return parsed
		}
	} catch {
		// Missing or older cache: fall through to a full scan.
	}
	return { version: CACHE_VERSION, files: {} }
}

export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
	const { signal, onProgress } = options
	const cache = await readCache()
	const problems: string[] = []
	const paths = (await walk(sessionRoot(), signal, problems)).filter(isSessionFile)
	const files: Record<string, CachedFile> = {}
	let completed = 0

	for (const path of paths) {
		signal?.throwIfAborted()
		completed++
		try {
			const stat = await fs.stat(path)
			const cached = cache.files[path]
			// Reuse only on an exact size + mtime match.
			const parsed =
				cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs
					? cached
					: await parseFile(path, stat.size, stat.mtimeMs)
			// A file with no session header is not a session file: leave it out
			// entirely rather than storing an empty entry for it.
			if (parsed) files[path] = parsed
		} catch (error) {
			if (signal?.aborted) throw error
			problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
		}
		if (completed % 32 === 0) onProgress?.(completed, paths.length)
	}

	// Cache files that vanished since the last run.
	for (const path of Object.keys(cache.files)) if (!files[path]) delete cache.files[path]

	onProgress?.(paths.length, paths.length)
	await writeCache({ version: CACHE_VERSION, files })
	return { files, problems }
}

async function writeCache(cache: StatsCache): Promise<void> {
	const target = cachePath()
	try {
		const serialised = JSON.stringify(cache)
		// Nothing changed: skip the write, it dominates the cost of a warm scan.
		try {
			if ((await fs.readFile(target, "utf8")) === serialised) return
		} catch {
			// No cache yet: fall through and write it.
		}
		await fs.mkdir(join(target, ".."), { recursive: true })
		// Write beside the target so a crash cannot truncate a good cache. The
		// pid keeps concurrent pi instances from clobbering each other.
		const temp = `${target}.${process.pid}.tmp`
		await fs.writeFile(temp, serialised)
		await fs.rename(temp, target)
	} catch {
		// A cache miss only costs time, never correctness.
	}
}
