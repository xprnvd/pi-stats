/**
 * `/stats` for pi — a port of opencode's TUI `/stats` poster.
 *
 * Run `/stats` in interactive mode; Escape or Ctrl+C closes it. The poster
 * reports year-to-date usage across every pi session on this machine.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey } from "@earendil-works/pi-tui"
import { renderPoster } from "./poster.ts"
import { scan } from "./scan.ts"
import { buildSnapshot } from "./stats.ts"
import type { SessionStatsInfo } from "./types.ts"

type State =
	| { kind: "loading"; progress?: string }
	| { kind: "ready"; stats: SessionStatsInfo; problems: string[] }
	| { kind: "error"; message: string }

export default function statsExtension(pi: ExtensionAPI): void {
	pi.registerCommand("stats", {
		description: "Show year-to-date token usage, activity, and streaks",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/stats requires interactive TUI mode", "warning")
				return
			}

			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
				let state: State = { kind: "loading" }
				let cached: { width: number; rows: number; lines: string[] } | undefined
				let closed = false
				const controller = new AbortController()

				const refresh = (): void => {
					cached = undefined
					tui.requestRender()
				}

				// Long work starts here, not in the factory: some invocations load
				// extensions without ever starting a session.
				void (async () => {
					try {
						const { files, problems } = await scan({
							signal: controller.signal,
							onProgress: (scanned, total) => {
								if (closed || controller.signal.aborted) return
								state = { kind: "loading", progress: `${scanned}/${total}` }
								tui.requestRender()
							},
						})
						if (closed || controller.signal.aborted) return
						state = { kind: "ready", stats: buildSnapshot(files, Date.now()), problems }
					} catch (error) {
						if (closed || controller.signal.aborted) return
						if (error instanceof Error && error.name === "AbortError") return
						state = { kind: "error", message: error instanceof Error ? error.message : String(error) }
					}
					refresh()
				})()

				const render = (width: number): string[] => {
					const rows = tui.terminal.rows
					// The poster depends on the height too: a resize that only
					// changes the row count must re-lay it out.
					if (cached?.width === width && cached.rows === rows) return cached.lines
					let lines: string[]
					if (state.kind === "loading") {
						const progress = state.progress ? ` ${state.progress}` : ""
						lines = [theme.fg("muted", `Gathering your stats…${progress}`)]
					} else if (state.kind === "error") {
						lines = [theme.fg("error", `Could not load stats. ${state.message}`)]
					} else {
						const notes =
							state.problems.length > 0
								? [`${state.problems.length} session file${state.problems.length === 1 ? "" : "s"} could not be read; totals are incomplete`]
								: []
						lines = renderPoster(state.stats, theme, width, rows, notes)
					}
					cached = { width, rows, lines }
					return lines
				}

				return {
					render,
					invalidate: () => {
						cached = undefined
					},
					handleInput: (data: string) => {
						if (!matchesKey(data, Key.escape) && !matchesKey(data, Key.ctrl("c")) && data !== "q") return
						closed = true
						controller.abort()
						done(undefined)
					},
				}
			})
		},
	})
}
