export const LINE_IDS = ["title", "usage", "remaining", "reset", "account", "plan", "overage", "updated"] as const
export type LineID = typeof LINE_IDS[number]
export type Surface = { enabled: boolean; lines: LineID[] }
export type Options = {
  refreshSeconds: number
  colors: { mode: "theme" | "muted" | "inherit"; warningAt: number; criticalAt: number }
  display: { sidebar: Surface; home: Surface }
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

function surface(value: unknown, defaults: LineID[]): Surface {
  const input = record(value)
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    lines: Array.isArray(input.lines)
      ? [...new Set(input.lines.filter((id): id is LineID => LINE_IDS.includes(id as LineID)))]
      : [...defaults],
  }
}

/** Treat plugin configuration as untrusted; never log raw options. */
export function normalizeOptions(value: unknown): Options {
  const input = record(value)
  const colors = record(input.colors)
  const display = record(input.display)
  const warning = colors.warningAt === undefined ? 75 : colors.warningAt
  const critical = colors.criticalAt === undefined ? 90 : colors.criticalAt
  const valid = finite(warning) && finite(critical) && warning >= 0 && warning < critical && critical <= 100
  return {
    refreshSeconds: finite(input.refreshSeconds) ? Math.max(30, input.refreshSeconds) : 60,
    colors: {
      mode: colors.mode === "muted" || colors.mode === "inherit" ? colors.mode : "theme",
      warningAt: valid ? warning : 75,
      criticalAt: valid ? critical : 90,
    },
    display: {
      sidebar: surface(display.sidebar, ["title", "usage", "remaining", "reset"]),
      home: surface(display.home, ["usage"]),
    },
  }
}

export const enabled = (surface: Surface) => surface.enabled && surface.lines.length > 0
