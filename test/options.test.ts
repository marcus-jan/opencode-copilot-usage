import { expect, test } from "bun:test"
import { normalizeOptions } from "../src/options"

test("defaults and independent nested overrides", () => {
  const defaults = normalizeOptions(undefined)
  expect(defaults).toEqual({ refreshSeconds: 60,
    colors: { mode: "theme", warningAt: 75, criticalAt: 90 },
    display: { sidebar: { enabled: true, lines: ["title", "usage", "remaining", "reset"] }, home: { enabled: true, lines: ["usage"] } },
  })
  const options = normalizeOptions({ display: { home: { lines: ["plan", "account", "plan", "unknown", null, 2] } }, colors: { warningAt: 50 } })
  expect(options.display.home.lines).toEqual(["plan", "account"])
  expect(options.display.sidebar).toEqual(defaults.display.sidebar)
  expect(options.colors).toEqual({ mode: "theme", warningAt: 50, criticalAt: 90 })
  options.display.sidebar.lines.pop()
  expect(normalizeOptions({}).display.sidebar.lines).toHaveLength(4)
})

test("invalid types, bounds, modes, flags and empty arrays", () => {
  for (const colors of [{ warningAt: 90, criticalAt: 90 }, { warningAt: -1 }, { criticalAt: 101 }, { warningAt: NaN }, { criticalAt: "95" }]) {
    expect(normalizeOptions({ colors }).colors).toEqual({ mode: "theme", warningAt: 75, criticalAt: 90 })
  }
  for (const value of [null, [], false, "bad", 4]) expect(normalizeOptions(value).refreshSeconds).toBe(60)
  for (const refreshSeconds of [NaN, Infinity, "30"]) expect(normalizeOptions({ refreshSeconds }).refreshSeconds).toBe(60)
  expect(normalizeOptions({ refreshSeconds: -5 }).refreshSeconds).toBe(30)
  expect(normalizeOptions({ refreshSeconds: 120 }).refreshSeconds).toBe(120)
  expect(normalizeOptions({ colors: { mode: "muted", warningAt: 0, criticalAt: 100 } }).colors).toEqual({ mode: "muted", warningAt: 0, criticalAt: 100 })
  expect(normalizeOptions({ colors: { mode: "inherit" } }).colors.mode).toBe("inherit")
  expect(normalizeOptions({ colors: { mode: "red" } }).colors.mode).toBe("theme")
  const options = normalizeOptions({ display: { sidebar: { enabled: "false", lines: "usage" }, home: { enabled: false, lines: [] } } })
  expect(options.display.sidebar).toEqual(normalizeOptions({}).display.sidebar)
  expect(options.display.home).toEqual({ enabled: false, lines: [] })
  expect(normalizeOptions({ display: { home: { lines: ["unknown"] } } }).display.home.lines).toEqual([])
})
