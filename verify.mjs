// Regression check for the pi-stats poster.
//
// Verifies the port against opencode's own algorithms, copied verbatim below:
// block-digit CONTENT, a shared left edge across the 5 digit rows, TOKENS on its
// own centred line, the calendar grid cell-for-cell, no line overflow at any
// size, and metric labels that never collide.
//
// The render checks run against SYNTHETIC snapshots with fixed token totals, so
// they do not depend on whatever the local session history happens to contain
// (a total of "0" or "8" makes digit row 0 identical to digit row 4, which
// breaks any lookup that assumes the five rows differ). The scanner checks run
// against a throwaway agent directory.
//
// Run:  node --experimental-strip-types verify.mjs
// It creates a node_modules symlink so the bare @earendil-works/* imports
// resolve, and removes it again on exit if it created it.

import assert from "node:assert/strict"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

// ---------------------------------------------------------------------------
// 0. Resolve pi and the theme dynamically, so a pi upgrade does not break this.
// ---------------------------------------------------------------------------

function compareVersions(a, b) {
	const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
	const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0)
		if (d !== 0) return d
	}
	return 0
}

function resolvePiModules() {
	// 1. A pi install on this machine (the normal development setup).
	const base = join(homedir(), ".pi", "agent", "install", "releases")
	const releases = existsSync(base)
		? readdirSync(base)
				.filter((name) => existsSync(join(base, name, "node_modules", "@earendil-works", "pi-coding-agent")))
				.sort(compareVersions)
		: []
	if (releases.length > 0) return join(base, releases[releases.length - 1], "node_modules")
	// 2. The package's own devDependencies (CI, or a plain checkout).
	const local = new URL("./node_modules", import.meta.url).pathname
	if (existsSync(join(local, "@earendil-works", "pi-coding-agent"))) return local
	throw new Error(`no pi install found under ${base}, and no devDependencies in ${local}`)
}

/** The user's theme file, or null when there is none (CI, or a fresh machine). */
function resolveTheme() {
	const agentDir = join(homedir(), ".pi", "agent")
	let name = "black-metal-gorgoroth"
	try {
		const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"))
		if (typeof settings.theme === "string") name = settings.theme
	} catch {
		// No settings: fall back to the default name.
	}
	const themesDir = join(agentDir, "themes")
	const exact = join(themesDir, `${name}.json`)
	if (existsSync(exact)) return exact
	const available = existsSync(themesDir) ? readdirSync(themesDir).filter((f) => f.endsWith(".json")) : []
	if (available.length === 0) return null
	return join(themesDir, available[0])
}

const PI_MODULES = resolvePiModules()
const LINK = new URL("./node_modules", import.meta.url).pathname
const createdLink = !existsSync(LINK)
if (createdLink) symlinkSync(PI_MODULES, LINK)
const cleanup = () => {
	if (createdLink) {
		try {
			rmSync(LINK, { force: true })
		} catch {
			// best effort
		}
	}
}
process.on("exit", cleanup)
process.on("SIGINT", () => {
	cleanup()
	process.exit(130)
})
process.on("SIGTERM", () => {
	cleanup()
	process.exit(143)
})

const { loadThemeFromPath, getThemeByName } = await import(
	join(PI_MODULES, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js")
)
const themePath = resolveTheme()
// No theme file: pi's built-in "system" theme, derived from the terminal.
const theme = themePath ? loadThemeFromPath(themePath) : getThemeByName("system")
if (!theme) throw new Error("no theme available")
const { scan } = await import("./scan.ts")
const { buildSnapshot } = await import("./stats.ts")
const { renderPoster, posterWidth } = await import("./poster.ts")
const { totalTokens } = await import("./types.ts")
const { activityCalendar } = await import("./calendar.ts")
const { visibleWidth } = await import("@earendil-works/pi-tui")

// ---------------------------------------------------------------------------
// Reference algorithms, copied verbatim from opencode.
// ---------------------------------------------------------------------------

const digitsRef = {
	"0": ["111", "101", "101", "101", "111"],
	"1": ["010", "110", "010", "010", "111"],
	"2": ["111", "001", "111", "100", "111"],
	"3": ["111", "001", "111", "001", "111"],
	"4": ["101", "101", "111", "001", "001"],
	"5": ["111", "100", "111", "001", "111"],
	"6": ["111", "100", "111", "101", "111"],
	"7": ["111", "001", "010", "010", "010"],
	"8": ["111", "101", "111", "101", "111"],
	"9": ["111", "101", "111", "001", "111"],
	".": ["0", "0", "0", "0", "1"],
	K: ["101", "110", "100", "110", "101"],
	M: ["10001", "11011", "10101", "10001", "10001"],
	B: ["110", "101", "110", "101", "110"],
	T: ["111", "010", "010", "010", "010"],
}
const num = (v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
const refRows = (n) =>
	[0, 1, 2, 3, 4].map((r) => Array.from(n).map((c) => digitsRef[c][r].replaceAll("1", "██").replaceAll("0", "  ")).join("  "))

/** A synthetic snapshot, so the render checks never depend on local history. */
function snapshot(tokens, overrides = {}) {
	return {
		range: { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 9, 19) },
		sessions: 3,
		subagents: 1,
		prompts: 5,
		steps: 10,
		tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, ...tokens },
		cost: 0,
		activeDays: 4,
		streak: 2,
		activity: [
			{ date: "2026-01-05", steps: 1 },
			{ date: "2026-01-06", steps: 5 },
			{ date: "2026-01-07", steps: 2 },
			{ date: "2026-01-08", steps: 1 },
		],
		...overrides,
	}
}

const strip = (l) => l.replace(/\x1b\[[0-9;]*m/g, "")

/**
 * The five digit rows, located by geometry rather than by matching row 4:
 * digit row 0 and digit row 4 are identical for 0, 8, B and M, so a lookup by
 * the fifth row finds the first one.
 */
function digitRows(lines) {
	const start = lines.findIndex((l) => l.includes("█") && !l.includes("▀"))
	assert.ok(start >= 0, "digit block present")
	return { start, rows: lines.slice(start, start + 5) }
}

// ---------------------------------------------------------------------------
// 1. Digit rendering, against fixed synthetic totals.
// ---------------------------------------------------------------------------

for (const total of [0, 8, 1_900_000_000, 12_300_000, 999]) {
	const stats = snapshot({ input: total, output: 0, cacheRead: 0, cacheWrite: 0 })
	const lines = renderPoster(stats, theme, 100, 44).map(strip)
	const expected = refRows(num(totalTokens(stats.tokens)))
	const { start, rows } = digitRows(lines)
	assert.equal(rows.length, 5, `total ${total}: exactly 5 digit rows`)
	for (let i = 0; i < 5; i++) {
		assert.equal(rows[i].trim(), expected[i].trim(), `total ${total}: digit row ${i} content`)
	}
	// The five rows share ONE left edge (the staircase regression test).
	const leftEdges = expected.map((row, i) => {
		const leading = row.length - row.trimStart().length
		return rows[i].indexOf(row.trimStart()[0]) - leading
	})
	assert.equal(new Set(leftEdges).size, 1, `total ${total}: rows do not share a left edge: ${JSON.stringify(leftEdges)}`)
	// TOKENS sits on its OWN centred line, one blank row below (gap={1}).
	assert.equal(lines[start + 5].trim(), "", `total ${total}: blank row between digits and TOKENS`)
	assert.equal(lines[start + 6].trim(), "TOKENS", `total ${total}: TOKENS on its own line`)
	const labelCol = lines[start + 6].indexOf("TOKENS")
	const posterLeft = Math.floor((100 - posterWidth(100)) / 2)
	assert.equal(labelCol, posterLeft + Math.floor((posterWidth(100) - 6) / 2), `total ${total}: TOKENS not centred`)
}
console.log("✓ digit content, shared left edge and TOKENS placement hold for 0, 8, 999, 12.3M and 1.9B")

// ---------------------------------------------------------------------------
// 2. The calendar algorithm itself, against hand-computed cells.
// ---------------------------------------------------------------------------

{
	// Jan 1 2026 is a Thursday, so the grid starts on Mon Dec 29 2025.
	const from = Date.UTC(2026, 0, 1)
	const to = Date.UTC(2026, 0, 21) // the range ends Tue Jan 20
	const cal = activityCalendar({
		activity: [
			{ date: "2026-01-05", steps: 1 },
			{ date: "2026-01-06", steps: 5 },
		],
		from,
		to,
		maxWeeks: 10,
	})
	assert.equal(cal.weeks.length, 4, "four weeks: Dec 29 - Jan 25")
	assert.equal(cal.clipped, false)
	// Days before the range are out of range (level -1).
	assert.deepEqual(
		cal.weeks[0].days.slice(0, 3).map((d) => d.level),
		[-1, -1, -1],
		"Mon-Wed of the first week are before the range",
	)
	// Two distinct levels: the lower one is shade 2, the higher shade 4.
	assert.equal(cal.weeks[1].days[0].level, 2, "Jan 5 (1 step) is shade 2")
	assert.equal(cal.weeks[1].days[1].level, 4, "Jan 6 (5 steps) is shade 4")
	// Thursday owns the month: every week here is January.
	assert.deepEqual(
		cal.months.map((m) => [m.label, m.span]),
		[["Jan", 4]],
		"one January spanning four weeks",
	)
	// A range that needs more weeks than maxWeeks is clipped.
	const clipped = activityCalendar({ activity: [], from, to, maxWeeks: 2 })
	assert.equal(clipped.clipped, true, "clipped when maxWeeks is too small")
	assert.equal(clipped.weeks.length, 2, "clipped to maxWeeks")
}
console.log("✓ calendar cells, shade levels, month spans and clipping match hand-computed values")

// ---------------------------------------------------------------------------
// 3. The poster against the live scan.
// ---------------------------------------------------------------------------

const { files } = await scan({})
const stats = buildSnapshot(files, Date.now())
const W = 100,
	H = 44
const lines = renderPoster(stats, theme, W, H).map(strip)
const number = num(totalTokens(stats.tokens))

// The calendar grid, cell for cell, against opencode's own calendar.
const width = posterWidth(W)
const cal = activityCalendar({
	activity: stats.activity,
	from: stats.range.from,
	to: stats.range.to,
	maxWeeks: Math.floor((width - 4) / 2),
})
const refDayRows = ["M", "T", "W", "T", "F", "S", "S"].map((d, day) =>
	(
		d +
		"   " +
		cal.weeks
			.map((w) => {
				const c = w.days[day]
				return c.level < 0 ? "  " : c.level === 0 ? "· " : "■ "
			})
			.join("")
	).trimEnd(),
)

// Work from ANSI-stripped lines without touching leading spaces: the poster's
// horizontal centring and the 4-column day gutter both live there.
const raw = lines
const firstDay = raw.findIndex((l) => /^\s+M\s+[·■]/.test(l))
assert.ok(firstDay > 0, "calendar day rows present")
const calLeft = Math.floor((W - width) / 2)
const body = (l) => l.slice(calLeft).trimEnd()

assert.deepEqual(
	raw.slice(firstDay, firstDay + 7).map(body),
	refDayRows,
	"calendar day rows match opencode verbatim",
)
if (cal.clipped) {
	// The note is its own section, so it is not the line right after the day
	// rows: find it by content.
	const note = raw.find((l) => l.includes("Your last"))
	assert.ok(note, "clip note present")
	assert.equal(note.trim(), `Your last ${cal.weeks.length} weeks`, "clip note text")
}

// The month row keeps opencode's span*2 field widths but centres each label in them.
const expMonthBody =
	"    " +
	cal.months
		.map((m) => {
			const field = m.span * 2
			if (m.label.length > field) return " ".repeat(field)
			const left = Math.floor((field - m.label.length) / 2)
			return " ".repeat(left) + m.label + " ".repeat(field - left - m.label.length)
		})
		.join("")
		.trimEnd()
assert.equal(body(raw[firstDay - 1]), expMonthBody, "month row: labels centred in upstream field widths")
console.log("✓ calendar day rows match opencode verbatim:", cal.weeks.length, "weeks")

// ---------------------------------------------------------------------------
// 4. No overflow at any tested size, metrics never collide.
// ---------------------------------------------------------------------------

for (const w of [30, 36, 40, 44, 50, 60, 72, 80, 100, 110, 140, 200]) {
	for (const h of [24, 30, 38, 44, 60]) {
		const out = renderPoster(stats, theme, w, h)
		for (const l of out) assert.ok(visibleWidth(l) <= w, `w=${w} h=${h}: line of ${visibleWidth(l)} overflows`)
	}
}
console.log("✓ no line overflows across 12 widths x 5 heights")
for (const w of [30, 36, 40, 44, 50, 60, 72, 100, 140]) {
	const ls = renderPoster(stats, theme, w, 44).map((l) => strip(l).trimEnd())
	// labels must appear intact, never clipped and never run together
	for (const label of ["best streak", "active days", "sessions"])
		assert.ok(ls.some((l) => l.includes(label)), `w=${w}: ${label} missing or truncated`)
	assert.ok(
		!ls.some((l) => /best streakactive|active dayssession|dayssessions|streak\s{0,0}active/.test(l)),
		`w=${w}: labels collide`,
	)
	// when the three share a row, they must be separated by real gaps
	const row = ls.find((l) => l.includes("best streak") && l.includes("active days"))
	if (row) assert.ok(/best streak\s+active days\s+sessions/.test(row), `w=${w}: uneven metrics row -> ${JSON.stringify(row)}`)
}
console.log("✓ metric labels stay intact and separated at every width")

// ---------------------------------------------------------------------------
// 5. Render branches that the main path does not reach.
// ---------------------------------------------------------------------------

{
	// A number too wide for the block font falls back to plain text, and the
	// poster must still be complete.
	const wide = snapshot({ input: 987_654_321_000_000 })
	const out = renderPoster(wide, theme, 40, 44).map(strip)
	assert.ok(out.some((l) => l.includes("TOKENS")), "fallback branch still shows TOKENS")
	assert.ok(
		!out.some((l) => l.includes("█") && !l.includes("▀")),
		"fallback branch draws no block digits",
	)
	// The stacked metrics fallback: below the width the three labels need.
	const narrow = renderPoster(stats, theme, 20, 44).map(strip)
	for (const label of ["best streak", "active days", "sessions"])
		assert.ok(narrow.some((l) => l.includes(label)), `n=${20}: ${label} missing`)
	for (const l of narrow) assert.ok(visibleWidth(l) <= 20, "narrow poster overflows")
	// A note (unreadable files) is rendered as a muted line of its own.
	const noted = renderPoster(stats, theme, W, H, ["3 session files could not be read; totals are incomplete"]).map(strip)
	assert.ok(noted.some((l) => l.includes("could not be read")), "note rendered")
}
console.log("✓ plain-text fallback, stacked metrics and scan notes render correctly")

// ---------------------------------------------------------------------------
// 6. pi's mark: present when not compact, absent when compact (opencode's <Logo />)
// ---------------------------------------------------------------------------

const hasMark = (h) =>
	renderPoster(stats, theme, 100, h).some((l) => l.includes("▀") || (l.includes("█") && l.includes("▀")))
for (const h of [38, 40, 44, 60]) assert.ok(hasMark(h), `h=${h}: pi mark should render`)
for (const h of [20, 24, 30, 37]) assert.ok(!hasMark(h), `h=${h}: pi mark should be suppressed when compact`)
const markLines = renderPoster(stats, theme, 100, 44).filter((l) => l.includes("▀"))
assert.ok(markLines.length >= 2, "mark is two lines")
for (const l of markLines) {
	const glyphs = strip(l).trim()
	assert.ok([...glyphs].every((c) => "▀█ ".includes(c)), `mark uses half/full blocks only: ${JSON.stringify(glyphs)}`)
	assert.ok([...glyphs].length <= 4, `mark is at most 4 cells wide: ${glyphs}`)
}
console.log("✓ pi mark renders when not compact, is suppressed when compact, uses half/full blocks only")

// ---------------------------------------------------------------------------
// 7. The scanner, against a throwaway agent directory.
// ---------------------------------------------------------------------------

{
	const agentDir = mkdtempSync(join(tmpdir(), "pi-stats-verify-"))
	const sessions = join(agentDir, "sessions", "test")
	mkdirSync(join(sessions, "child", "run-0"), { recursive: true })

	const header = (id, extra = {}) => JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", ...extra })
	const assistant = (id, usage) =>
		JSON.stringify({ type: "message", id, timestamp: "2026-01-02T00:00:00.000Z", message: { role: "assistant", usage } })

	// A root session, a subagent run, a fork of the root session, and a stray
	// file that is not a session at all.
	writeFileSync(
		join(sessions, "root.jsonl"),
		[
			header("s1"),
			JSON.stringify({ type: "message", id: "u1", timestamp: "2026-01-02T00:00:00.000Z", message: { role: "user" } }),
			assistant("m1", { input: 100, output: 20, cacheRead: 5, cacheWrite: 0, totalTokens: 125, cost: { total: 0.01 } }),
			assistant("m2", { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { total: 0 } }),
		].join("\n") + "\n",
	)
	writeFileSync(
		join(sessions, "child", "run-0", "session.jsonl"),
		[header("s2", { parentSession: "root" }), assistant("m3", { input: 1, output: 1, totalTokens: 2, cost: { total: 0 } })].join(
			"\n",
		) + "\n",
	)
	writeFileSync(
		join(sessions, "forks.jsonl"),
		[
			header("s3", { parentSession: "root" }),
			// A verbatim copy of the parent's messages: these must not count twice.
			assistant("m1", { input: 100, output: 20, cacheRead: 5, cacheWrite: 0, totalTokens: 125, cost: { total: 0.01 } }),
			assistant("m9", { input: 4, output: 1, totalTokens: 5, cost: { total: 0 } }),
		].join("\n") + "\n",
	)
	writeFileSync(join(sessions, "stray.jsonl"), JSON.stringify({ type: "note", text: "not a session" }) + "\n")

	const previousAgentDir = process.env.PI_CODING_AGENT_DIR
	process.env.PI_CODING_AGENT_DIR = agentDir
	try {
		const scan1 = await scan({})
		assert.equal(scan1.problems.length, 0, "no problems in a clean tree")
		// The stray file is skipped, and it must not leave an empty entry behind.
		assert.equal(Object.values(scan1.files).filter((f) => !f).length, 0, "no undefined entries in the scan result")
		assert.equal(Object.keys(scan1.files).length, 3, "three session files, the stray one skipped")

		const snap = buildSnapshot(scan1.files, Date.UTC(2026, 0, 5))
		assert.equal(snap.sessions, 2, "the root session and its fork are sessions")
		assert.equal(snap.subagents, 1, "the run-N session is a subagent")
		assert.equal(snap.steps, 4, "four distinct assistant messages: the forked copy counts once")
		assert.equal(snap.prompts, 1, "the forked prompt is not counted twice")
		assert.equal(
			totalTokens(snap.tokens),
			// m1 (125) + m2 (10) + m3 (2) + m9 (5); the forked copy of m1 is counted once.
			125 + 10 + 2 + 5,
			"tokens: the forked copy is not counted twice",
		)

		// A second scan reuses the cache and returns the same numbers.
		const scan2 = await scan({})
		assert.deepEqual(
			Object.keys(scan2.files).sort(),
			Object.keys(scan1.files).sort(),
			"the cached scan finds the same files",
		)
		assert.equal(totalTokens(buildSnapshot(scan2.files, Date.UTC(2026, 0, 5)).tokens), totalTokens(snap.tokens))

		// A corrupt cache must not break the scan.
		writeFileSync(join(agentDir, "pi-stats", "cache.json"), "{not json")
		const scan3 = await scan({})
		assert.equal(totalTokens(buildSnapshot(scan3.files, Date.UTC(2026, 0, 5)).tokens), totalTokens(snap.tokens))

		// An aborted scan stops instead of walking the whole tree.
		const controller = new AbortController()
		controller.abort()
		await assert.rejects(() => scan({ signal: controller.signal }), "an aborted scan rejects")
	} finally {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir
		rmSync(agentDir, { recursive: true, force: true })
	}
}
console.log("✓ scanner: stray files skipped, forks are sessions, fork copies de-duplicated, cache and abort handled")

console.log("\nALL CHECKS PASSED")
