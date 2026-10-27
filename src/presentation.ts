import { enabled, type LineID, type Surface } from "./options"
import { count, summary, type Usage } from "./usage"

export type Role = "heading" | "label" | "value" | "quota"
export type Segment = { text: string; role: Role }
export type Line = { id: LineID; segments: Segment[] }

/** Pure presentation model; neither theme tokens nor credentials belong here. */
export function displayLines(usage: Usage | undefined, surface: Surface, home = false): Line[] {
  if (!enabled(surface)) return []
  const quota = usage?.quota
  const status = !usage || usage.error || !quota
  const line = (id: LineID): Line | undefined => {
    if (id === "title") return { id, segments: [{ text: "Copilot usage", role: "heading" }] }
    if (id === "usage") return { id, segments: [
      ...(home ? [{ text: "Copilot: ", role: "label" as const }] : []),
      { text: summary(usage).replace(/^Copilot: /, ""), role: "quota" },
    ] }
    if (!usage || usage.error) return undefined
    const values: Partial<Record<LineID, [string, string | undefined]>> = {
      remaining: ["Remaining", quota && !quota.unlimited ? count(quota.remaining) : undefined],
      reset: ["Resets", usage.resetDate?.split("T")[0]],
      account: ["Account", usage.login],
      plan: ["Plan", usage.plan],
      overage: ["Overage", quota && !quota.unlimited && quota.overage ? count(quota.overage) : undefined],
      updated: ["Updated", new Date(usage.fetchedAt).toLocaleTimeString()],
    }
    const value = values[id]
    return value?.[1] ? { id, segments: [
      { text: `${value[0]}: `, role: "label" }, { text: value[1], role: "value" },
    ] } : undefined
  }
  const lines = surface.lines.map(line).filter((value): value is Line => value !== undefined)
  // An enabled surface must not silently hide loading, missing quota, or failures.
  if (status && !surface.lines.includes("usage")) lines.push(line("usage")!)
  return lines
}
