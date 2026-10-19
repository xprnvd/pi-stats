/**
 * Port of opencode's `/stats` poster
 * (packages/tui/src/feature-plugins/system/stats.tsx + stats-data.ts).
 *
 * Kept: the header, the 5-row block-digit token total, the activity calendar,
 * and the best-streak / active-days / sessions row. Dropped: the opencode
 * `<Logo />` and the `opencode.ai` footer, which are that project's branding.
 */

import {
	backgroundAnsi,
	foregroundAnsi,
	isAppleTerminalSession,
	mixColors,
	rgbColor,
	truncateToWidth,
	visibleWidth,
	type Color,
} from "@earendil-works/pi-tui"
import type { Theme } from "@earendil-works/pi-coding-agent"
import { activityCalendar } from "./calendar.ts"
import type { SessionStatsInfo } from "./types.ts"
import { totalTokens } from "./types.ts"

/** opencode's block-digit glyphs, verbatim. */
const digits: Record<string, string[]> = {
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

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"]

// pi's brand mark, reproduced from its internal `pi-logo` module, which is not
// exported from the package index. The colours are deliberately fixed rather
// than theme-derived, so this is the one element that ignores the theme.
const CORAL = rgbColor(228, 138, 122)
const BLUE = rgbColor(79, 142, 179)
const YELLOW = rgbColor(234, 182, 93)

/**
 * pi's 4x4 startup mark: two lines of half-block cells. Apple Terminal draws
 * gaps between rows and misaligns half blocks, so pi falls back to its wordmark
 * there; this reproduces the same guard.
 */
function piMark(theme: Theme): string[] {
	const mode = theme.getColorMode()
	if (isAppleTerminalSession()) {
		return [`${foregroundAnsi(CORAL, mode)}P\x1b[0m${foregroundAnsi(YELLOW, mode)}i\x1b[0m`]
	}
	return [
		`${foregroundAnsi(CORAL, mode)}${backgroundAnsi(BLUE, mode)}▀\x1b[0m${foregroundAnsi(CORAL, mode)}▀█\x1b[0m `,
		`${foregroundAnsi(BLUE, mode)}█▀\x1b[0m ${foregroundAnsi(YELLOW, mode)}█\x1b[0m`,
	]
}

/** opencode `statsMetrics`: the big number is `metrics()[0]`. */
function statsMetrics(stats: SessionStatsInfo) {
	return [
		{ label: "tokens", value: totalTokens(stats.tokens) },
		{ label: "best streak", value: stats.streak },
		{ label: "active days", value: stats.activeDays },
		{ label: "sessions", value: stats.sessions },
	]
}

/** opencode `statsNumber`. */
function statsNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function posterWidth(termWidth: number): number {
	return Math.max(12, Math.min(110, termWidth - 8))
}

/** Shades 1-4 tint the surface toward the accent; level 0 uses the muted token. */
function shades(theme: Theme): Color[] {
	const base = theme.colors.selectedBg
	const accent = theme.colors.accent
	return [0.3, 0.5, 0.75, 1].map((alpha) => mixColors(base, accent, alpha))
}

function center(text: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - visibleWidth(text)) / 2))
	return " ".repeat(pad) + text
}

/**
 * Centres `text` inside a column of exactly `width` columns, filling both
 * sides. `center` alone pads only on the left, which lets neighbouring columns
 * run together whenever the content is an odd fit.
 */
function column(text: string, width: number): string {
	const slack = Math.max(0, width - visibleWidth(text))
	const left = Math.floor(slack / 2)
	return " ".repeat(left) + text + " ".repeat(slack - left)
}

/** Pads on the right only, so a block of lines keeps a shared left edge. */
function padRight(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)))
}

/**
 * Renders the poster to lines, already padded out to the terminal width.
 *
 * `notes` is not part of opencode's poster: it reports a problem with the
 * scan, so the user knows the totals are incomplete.
 */
export function renderPoster(
	stats: SessionStatsInfo,
	theme: Theme,
	termWidth: number,
	termRows: number,
	notes: string[] = [],
): string[] {
	const width = posterWidth(termWidth)
	const compact = termRows < 38 // opencode's `compact()`
	const gap = compact ? 1 : 2
	const muted = (s: string) => theme.fg("muted", s)
	const base = (s: string) => theme.bold(theme.fg("text", s))

	const metrics = statsMetrics(stats)
	const number = statsNumber(metrics[0]!.value)
	const letters = Array.from(number).map((char) => digits[char])
	const large = letters.every(Boolean) && letters.reduce((sum, char) => sum + char[0]!.length * 2 + 2, -2) <= width

	const calendar = activityCalendar({
		activity: stats.activity,
		from: stats.range.from,
		to: stats.range.to,
		maxWeeks: Math.floor((width - 4) / 2),
	})
	const colors = shades(theme)
	const dates = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).formatRange(
		new Date(stats.range.from),
		new Date(Math.max(stats.range.from, stats.range.to - 1)),
	)

	const sections: string[][] = []

	// Header: opencode uses justifyContent="space-between", so the title sits
	// flush left and the range flush right. Below 44 columns the box switches to
	// a column and both children stretch, so both sit flush left.
	const title = theme.bold(theme.fg("text", "pi / stats"))
	const span = Math.max(1, width - visibleWidth(title) - visibleWidth(dates))
	sections.push(
		width < 44
			? [padRight(title, width), padRight(muted(dates), width)]
			: [center(`${title}${" ".repeat(span)}${muted(dates)}`, width)],
	)

	// opencode renders its logo here, and only when the poster is not compact.
	if (!compact) sections.push(piMark(theme).map((line) => center(line, width)))

	// The big token total. opencode's wrapper box has no flexDirection and its
	// children are a digit block and the label, so it stacks: the five rows, one
	// blank line (gap={1}), then TOKENS, each centred.
	if (large) {
		const rows = [0, 1, 2, 3, 4].map((row) =>
			letters.map((char) => char[row]!.replaceAll("1", "██").replaceAll("0", "  ")).join("  "),
		)
		// opencode stacks the rows in one column box, so they share a left edge;
		// centring each row on its own would produce a staircase.
		const blockWidth = Math.max(...rows.map((row) => visibleWidth(row)))
		const block = rows.map((row) => center(padRight(theme.fg("text", row), blockWidth), width))
		sections.push([...block, "", center(muted("TOKENS"), width)])
	} else {
		sections.push([center(base(number), width), "", center(muted("TOKENS"), width)])
	}

	// Activity calendar: a month-label row over M T W T F S S. Its container is
	// alignItems="center", so every row is centred within the calendar's width.
	const dayRows = ["M", "T", "W", "T", "F", "S", "S"].map((_, day) => {
		let line = muted(`${DAY_INITIALS[day]}   `)
		for (const week of calendar.weeks) {
			const cell = week.days[day]!
			const glyph = cell.level < 0 ? "  " : cell.level === 0 ? "· " : "■ "
			line += theme.style(glyph, { fg: cell.level === 0 ? theme.colors.muted : colors[cell.level - 1]! })
		}
		return line
	})
	const grid = [
		muted(
			"    " +
				calendar.months
					// opencode left-aligns each label in its span*2 field, which leaves the
					// first label flush against the gutter with gaps of 0-7 columns. Centring
					// keeps the field widths (they still track each month's week count) but
					// makes the gaps even. The "does not fit" guard is upstream's.
					.map((month) =>
						month.label.length <= month.span * 2
							? column(month.label, month.span * 2)
							: " ".repeat(month.span * 2),
					)
					.join(""),
		),
		...dayRows,
	]
	const gridWidth = Math.max(...grid.map((line) => visibleWidth(line)))
	sections.push(grid.map((line) => padRight(center(line, gridWidth), width)))
	if (calendar.clipped) sections.push([padRight(center(muted(`Your last ${calendar.weeks.length} weeks`), gridWidth), width)])

	// best streak / active days / sessions, spread evenly across the poster.
	const cells = metrics.slice(1).map((metric) => [
		base(statsNumber(metric.value) + (metric.label === "best streak" ? " days" : "")),
		muted(metric.label),
	])
	const natural = cells.map((cell) => Math.max(...cell.map((line) => visibleWidth(line))))
	const equal = Math.floor(width / cells.length)
	if (natural.every((w) => w <= equal)) {
		// opencode's justifyContent="space-around": equal columns, content centred.
		sections.push([0, 1].map((row) => cells.map((cell) => column(cell[row]!, equal)).join("")))
	} else if (natural.reduce((sum, w) => sum + w, 0) + cells.length <= width) {
		// Columns would clip: give each cell its natural width and spread the
		// slack, keeping a gap between neighbouring cells.
		const cellWidths = natural.map((w) => w + 1)
		const extra = width - cellWidths.reduce((sum, w) => sum + w, 0)
		const share = Math.floor(extra / cells.length)
		const remainder = extra % cells.length
		const widths = cellWidths.map((w, i) => w + share + (i < remainder ? 1 : 0))
		sections.push([0, 1].map((row) => cells.map((cell, i) => column(cell[row]!, widths[i]!)).join("")))
	} else {
		// Too narrow for one row: stack them, the way the wrapping layout falls back.
		sections.push(cells.flatMap((cell) => cell.map((line) => center(line, width))))
	}

	for (const note of notes) sections.push([center(muted(note), width)])

	const lines: string[] = []
	sections.forEach((section, index) => {
		if (index > 0) lines.push(...Array(gap).fill(""))
		lines.push(...section)
	})

	// opencode centres the poster in a scroll box with one line of padding.
	const top = lines.length + 2 <= termRows ? Math.max(1, Math.floor((termRows - lines.length) / 2)) : 1
	// Normalise every line to the poster width first. Sections that are shorter
	// than the poster (the TOKENS line, the blank spacer, the metrics row when
	// the columns do not divide evenly) would otherwise be centred a second
	// time and drift out of alignment with the rest of the poster.
	const body = lines.map((line) => padRight(line, width))
	// pi requires every line to fit the width; opencode's scroll box clipped instead.
	return [...Array(top).fill(""), ...body.map((line) => truncateToWidth(center(line, termWidth), termWidth)), ...Array(top).fill("")]
}
