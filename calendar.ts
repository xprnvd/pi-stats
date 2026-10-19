/**
 * Verbatim port of opencode's `activityCalendar`
 * (packages/util/src/activity-calendar.ts). The UTC-ordinal trick keeps DST
 * from adding or dropping cells, and the month label uses the Thursday that
 * owns most of its week. Both are load-bearing, so the logic is unchanged.
 */

export interface CalendarInput {
	activity: readonly { date: string; steps: number }[]
	from: number
	to: number
	maxWeeks: number
}

export interface CalendarWeek {
	days: { date: string; steps: number; level: number }[]
}

export interface ActivityCalendar {
	weeks: CalendarWeek[]
	months: { week: number; label: string; span: number }[]
	clipped: boolean
}

export function activityCalendar(input: CalendarInput): ActivityCalendar {
	// Extract local dates first, then use UTC ordinals so DST cannot add or drop cells.
	const ordinal = (time: number) => {
		const date = new Date(time)
		return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
	}
	const from = ordinal(input.from)
	const to = ordinal(input.to - 1)
	const monday = from - ((new Date(from * 86_400_000).getUTCDay() + 6) % 7)
	const total = input.to <= input.from ? 0 : Math.floor((to - monday) / 7) + 1
	const count = Math.min(total, 53, Math.max(1, Math.floor(input.maxWeeks)))
	const start = monday + Math.max(0, total - count) * 7
	const values = new Map(input.activity.map((day) => [day.date, day.steps]))
	const levels = [...new Set([...values.values()].filter((steps) => steps > 0))].sort((a, b) => a - b)
	const weeks = Array.from({ length: count }, (_, week) => ({
		days: Array.from({ length: 7 }, (_, day) => {
			const date = start + week * 7 + day
			const key = new Date(date * 86_400_000).toISOString().slice(0, 10)
			const steps = values.get(key) ?? 0
			return {
				date: key,
				steps,
				level:
					date < from || date > to
						? -1
						: steps === 0
							? 0
							: Math.max(1, Math.ceil(((levels.indexOf(steps) + 1) / levels.length) * 4)),
			}
		}),
	}))
	const formatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
	// Thursday identifies the month owning most of a week; partial edge weeks stay inside the range.
	const months = weeks
		.map((_, week) => ({
			week,
			label: formatter.format(Math.min(to, Math.max(from, start + week * 7 + 3)) * 86_400_000),
		}))
		.filter((month, index, all) => index === 0 || month.label !== all[index - 1]!.label)
	return {
		weeks,
		months: months.map((month, index) => ({ ...month, span: (months[index + 1]?.week ?? count) - month.week })),
		clipped: count < total,
	}
}
