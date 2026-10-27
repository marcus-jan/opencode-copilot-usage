import { expect, test } from "bun:test"
import { normalizeOptions, LINE_IDS, type Surface } from "../src/options"
import { displayLines } from "../src/presentation"
import { details, parseUsage, severity, unavailable, type Usage } from "../src/usage"

const usage = parseUsage({ login: "example", copilot_plan: "pro", quota_reset_date_utc: "2026-11-01T00:00:00Z", token_based_billing: true,
  quota_snapshots: { premium_interactions: { entitlement: 1000, remaining: 100, overage_count: 2 } } }, 0)
const text = (value: Usage | undefined, surface: Surface, home = false) => displayLines(value, surface, home).map((line) => line.segments.map((part) => part.text).join(""))

test("default text and ordered optional lines share formatting", () => {
  const options = normalizeOptions({})
  expect(text(usage, options.display.sidebar)).toEqual(["Copilot usage", "900 / 1,000 credits · 90.0% used", "Remaining: 100", "Resets: 2026-11-01"])
  expect(text(usage, options.display.home, true)).toEqual(["Copilot: 900 / 1,000 credits · 90.0% used"])
  const lines = ["account", "plan", "overage", "updated", "usage"] as const
  expect(displayLines(usage, { enabled: true, lines: [...lines] }).map((line) => line.id)).toEqual([...lines])
  expect(text(usage, { enabled: true, lines: [...lines] }).slice(0, 3)).toEqual(["Account: example", "Plan: pro", "Overage: 2"])
  expect(details(usage).join("\n")).toContain("Account: example")
})

test("status fallback, empty/disabled surfaces and unknown/unlimited values", () => {
  const surface: Surface = { enabled: true, lines: ["account"] }
  expect(text(undefined, surface)).toEqual(["loading usage…"])
  expect(text(unavailable("HTTP 401"), surface, true)).toEqual(["Copilot: HTTP 401"])
  expect(text({ fetchedAt: 0, tokenBasedBilling: false }, surface)).toEqual(["no quota reported"])
  expect(text({ fetchedAt: 0, tokenBasedBilling: false, login: "example" }, surface)).toEqual(["Account: example", "no quota reported"])
  expect(text(undefined, { enabled: true, lines: [] })).toEqual([])
  expect(text(undefined, { enabled: false, lines: ["usage"] })).toEqual([])
  const unknown = parseUsage({ quota_snapshots: { premium_interactions: { unlimited: false } } })
  expect(text(unknown, { enabled: true, lines: ["usage", "remaining", "account", "plan", "overage", "reset"] })).toEqual(["? / ? premium requests", "Remaining: ?"])
  const unlimited = { ...usage, quota: { ...usage.quota!, unlimited: true } }
  expect(text(unlimited, { enabled: true, lines: [...LINE_IDS] }).join("\n")).not.toMatch(/Remaining|Overage|90.0%/)
  expect(text(unlimited, { enabled: true, lines: ["remaining"] })).toEqual([])
  expect(details(unlimited).join("\n")).not.toContain("Overage")
})

test("severity respects boundaries, custom thresholds, unknown and unlimited quotas", () => {
  for (const [percentUsed, expected] of [[74.9, "normal"], [75, "warning"], [89.9, "warning"], [90, "error"], [100, "error"]] as const) {
    expect(severity({ ...usage, quota: { ...usage.quota!, percentUsed } })).toBe(expected)
  }
  expect(severity(usage, 80, 95)).toBe("warning")
  expect(severity(undefined, 0, 10)).toBe("normal")
  expect(severity({ ...usage, quota: { unlimited: false } }, 0, 10)).toBe("normal")
  expect(severity({ ...usage, quota: { unlimited: true, percentUsed: 100 } })).toBe("normal")
  expect(severity(unavailable("HTTP 401"))).toBe("warning")
})
