/** @jsxImportSource @opentui/solid */
import { expect, spyOn, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { RGBA } from "@opentui/core"
import { RendererContext, testRender, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createRoot, createSignal, Show } from "solid-js"
import plugin from "../src/tui"
import { parseUsage, unavailable } from "../src/usage"

type Context = Plugin.Context
type Claim = Parameters<Context["ui"]["slot"]>[0]
const quota = parseUsage({ login: "example", copilot_plan: "pro", quota_reset_date: "2026-11-01",
  quota_snapshots: { premium_interactions: { entitlement: 1000, remaining: 100 } } })

async function harness(options: unknown = {}, value = quota, width = 100, height = 25) {
  const claims: Claim[] = []
  const [light, setLight] = createSignal(false)
  const [provider, setProvider] = createSignal("github-copilot")
  const palette = () => light()
    ? { base: "#111111", muted: "#555555", warning: "#996600", error: "#990000" }
    : { base: "#eeeeee", muted: "#aaaaaa", warning: "#ffff00", error: "#ff0000" }
  let calls = 0
  let stops = 0
  let command!: { run: () => Promise<void>; enabled: () => boolean }
  let event!: (event: unknown) => void
  let message = ""
  let disposeRoot!: () => void
  const context = {
    options,
    client: { rpc: () => ({ get: async () => { calls++; return value } }) },
    data: { on: (_: string, handler: typeof event) => { event = handler; return () => { stops++ } } },
    keymap: { layer: (factory: () => { commands: typeof command[] }) => { command = factory().commands[0]! } },
    theme: { text: {
      get base() { return RGBA.fromHex(palette().base) },
      get muted() { return RGBA.fromHex(palette().muted) },
      feedback: {
        warning: { get base() { return RGBA.fromHex(palette().warning) } },
        error: { get base() { return RGBA.fromHex(palette().error) } },
      },
    } },
    ui: {
      model: { current: () => ({ providerID: provider() }) },
      router: { current: () => ({ type: "session", sessionID: "current" }) },
      slot: (claim: Claim) => { claims.push(claim) },
      dialog: { alert: async (input: { message: string }) => { message = input.message } },
    },
  } as unknown as Context
  let cleanup!: () => void
  // Match the built-in footer's responsive padding and visibility.
  const HostFooter = () => {
    const dimensions = useTerminalDimensions()
    return <Show when={dimensions().height >= 14 && dimensions().width >= 44}>
      <box paddingTop={dimensions().height < 16 ? 0 : 1} paddingBottom={dimensions().height < 16 ? 0 : 1}>
        <text>MCP healthy</text>
      </box>
    </Show>
  }
  const view = await testRender(() => {
    Object.assign(context, { renderer: useRenderer() })
    const result = createRoot((dispose) => { disposeRoot = dispose; return plugin.setup(context) })
    if (typeof result !== "function") throw new Error("Expected synchronous cleanup")
    cleanup = result
    return <box flexDirection="column">
    <text>branch: main</text>
    <RendererContext.Provider value={undefined as never}>
      {claims[1]!.render({} as never)}
    </RendererContext.Provider>
    <HostFooter />
    {claims[0]!.render({} as never)}
    <text>after</text>
  </box>
  }, { width, height })
  await view.renderOnce()
  return {
    view, palette, setLight, setProvider, renderer: context.renderer,
    get calls() { return calls }, get stops() { return stops }, get message() { return message },
    command: () => command,
    event: (sessionID: string) => event({ data: { sessionID } }),
    async dispose() { cleanup(); disposeRoot(); await view.dispose() },
  }
}

test("rendered semantic foregrounds follow a live dark/light theme change", async () => {
  const h = await harness({ display: { sidebar: { lines: ["title", "usage", "remaining"] } } })
  try {
    const check = () => {
      const spans = h.view.captureSpans().lines.flatMap((line) => line.spans)
      for (const [text, token] of [["Copilot usage", "base"], ["900 /", "error"], ["Remaining:", "muted"], ["100", "base"]] as const) {
        const span = spans.find((span) => span.text.trim().startsWith(text))
        expect(span).toBeDefined()
        expect(span!.fg.equals(RGBA.fromHex(h.palette()[token]))).toBe(true)
      }
    }
    check()
    h.setLight(true)
    await h.view.renderOnce()
    check()
  } finally { await h.dispose() }
})

test("muted and inherited modes avoid severity overrides", async () => {
  for (const mode of ["muted", "inherit"] as const) {
    const h = await harness({ colors: { mode } })
    try {
      const spans = h.view.captureSpans().lines.flatMap((line) => line.spans)
      const usage = spans.find((span) => span.text.includes("900 /"))!
      const heading = spans.find((span) => span.text.includes("Copilot usage"))!
      const host = spans.find((span) => span.text.includes("branch:"))!
      expect(usage.fg.equals(mode === "muted" ? RGBA.fromHex(h.palette().muted) : host.fg)).toBe(true)
      expect(heading.fg.equals(usage.fg)).toBe(true)
    } finally { await h.dispose() }
  }
})

test("rendered usage severity uses custom thresholds and leaves labels muted", async () => {
  for (const [colors, token] of [
    [{ warningAt: 80, criticalAt: 95 }, "warning"],
    [{ warningAt: 95, criticalAt: 100 }, "base"],
    [{ warningAt: 100, criticalAt: 100 }, "error"],
  ] as const) {
    const h = await harness({ colors })
    try {
      const spans = h.view.captureSpans().lines.flatMap((line) => line.spans)
      expect(spans.find((span) => span.text.includes("900 /"))!.fg.equals(RGBA.fromHex(h.palette()[token]))).toBe(true)
      expect(spans.find((span) => span.text.includes("Remaining:"))!.fg.equals(RGBA.fromHex(h.palette().muted))).toBe(true)
    } finally { await h.dispose() }
  }
})

test("automatic polling and post-turn refresh respect provider, session and unload", async () => {
  const intervals: Array<() => void> = []
  const timeouts: Array<() => void> = []
  const interval = spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, delay: number) => {
    expect(delay).toBe(120_000); intervals.push(fn); return 123
  }) as typeof setInterval)
  const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, delay: number) => {
    expect(delay).toBe(3_000); timeouts.push(fn); return 456
  }) as typeof setTimeout)
  const clear = spyOn(globalThis, "clearTimeout")
  let h: Awaited<ReturnType<typeof harness>> | undefined
  try {
    h = await harness({ refreshSeconds: 120 })
    expect(h.calls).toBe(1)
    intervals[0]!()
    await h.view.renderOnce()
    expect(h.calls).toBe(2)
    h.event("other")
    expect(timeouts).toHaveLength(0)
    h.event("current")
    expect(timeouts).toHaveLength(1)
    timeouts[0]!()
    await h.view.renderOnce()
    expect(h.calls).toBe(3)
    h.event("current")
    await h.dispose()
    expect(clear).toHaveBeenCalledWith(456)
    intervals[0]!()
    timeouts[1]!()
    expect(h.calls).toBe(3)
    expect(h.stops).toBe(1)
    h = undefined
    // A replacement plugin setup owns exactly one listener and two slot claims.
    h = await harness({ refreshSeconds: 120 })
    expect(h.calls).toBe(1)
    expect(intervals).toHaveLength(2)
  } finally {
    if (h) await h.dispose()
    interval.mockRestore(); timeout.mockRestore(); clear.mockRestore()
  }
})

test("ordered home rows, optional sidebar lines and narrow layout preserve host content", async () => {
  const h = await harness({ display: { home: { lines: ["plan", "account"] }, sidebar: { lines: ["reset", "remaining", "account"] } } }, quota, 28)
  try {
    const rows = h.view.captureCharFrame().split("\n").map((row) => row.trim()).filter(Boolean)
    expect(rows).toEqual(["branch: main", "Plan: pro", "Account: example", "Resets: 2026-11-01", "Remaining: 100", "Account: example", "after"])
  } finally { await h.dispose() }
})

test("missing optional fields leave no gaps; errors remain visible without a selected usage line", async () => {
  const options = { display: { home: { lines: ["account"] }, sidebar: { lines: ["plan"] } } }
  const missing = await harness(options, parseUsage({ quota_snapshots: { premium_interactions: { unlimited: true } } }))
  try {
    expect(missing.view.captureCharFrame().split("\n").map((row) => row.trim()).filter(Boolean)).toEqual(["branch: main", "MCP healthy", "after"])
  } finally { await missing.dispose() }
  const failed = await harness(options, unavailable("GitHub quota unavailable (HTTP 401)"))
  try { expect(failed.view.captureCharFrame()).toContain("GitHub quota unavailable (HTTP 401)") }
  finally { await failed.dispose() }
})

test("home footer works without ambient renderer context and stays adjacent on resize", async () => {
  const h = await harness({ display: { sidebar: { enabled: false }, home: { lines: ["usage", "reset"] } } })
  try {
    const check = () => {
      const rows = h.view.captureCharFrame().split("\n")
      const usage = rows.findIndex((row) => row.includes("Copilot: 900"))
      const reset = rows.findIndex((row) => row.includes("Resets:"))
      const health = rows.findIndex((row) => row.includes("MCP healthy"))
      expect(usage).toBeGreaterThanOrEqual(0)
      expect(reset).toBe(usage + 1)
      expect(health).toBe(reset + 1)
      expect(rows.findIndex((row) => row.includes("branch:"))).toBeLessThan(usage)
    }
    check()
    h.view.resize(100, 15)
    await h.view.renderOnce()
    check()
    h.view.resize(100, 25)
    await h.view.renderOnce()
    check()
    h.view.resize(28, 25)
    await h.view.renderOnce()
    const rows = h.view.captureCharFrame().split("\n").map((row) => row.trim()).filter(Boolean)
    expect(rows).toEqual(["branch: main", "Copilot: 900 / 1,000", "premium requests · 90.0%", "used", "Resets: 2026-11-01", "after"])
  } finally { await h.dispose() }
})

test("unloading removes the plugin resize listener", async () => {
  const h = await harness()
  const before = h.renderer.listenerCount("resize")
  const off = spyOn(h.renderer, "off")
  try {
    await h.dispose()
    expect(off.mock.calls.some(([event]) => event === "resize")).toBe(true)
    expect(h.renderer.listenerCount("resize")).toBeLessThan(before)
  } finally { off.mockRestore() }
})

test("hidden surfaces gate automatic refresh, retain manual details, and clean up timers", async () => {
  const intervals: Array<() => void> = []
  const timeouts: Array<() => void> = []
  const interval = spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, delay: number) => {
    expect(delay).toBe(60_000); intervals.push(fn); return 123
  }) as typeof setInterval)
  const timeout = spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { timeouts.push(fn); return 456 }) as typeof setTimeout)
  const cleared = spyOn(globalThis, "clearInterval")
  let h: Awaited<ReturnType<typeof harness>> | undefined
  try {
    h = await harness({ display: { home: { enabled: false }, sidebar: { lines: [] } } })
    intervals[0]!()
    h.event("current")
    expect(timeouts).toHaveLength(0)
    expect(h.calls).toBe(0)
    expect(h.view.captureCharFrame()).not.toContain("Copilot")
    await h.command().run()
    expect(h.calls).toBe(1)
    expect(h.message).toContain("Account: example")
    expect(h.message).toContain("Plan: pro")
    h.setProvider("openai")
    await h.view.renderOnce()
    expect(h.command().enabled()).toBe(false)
    await h.command().run()
    intervals[0]!()
    expect(h.calls).toBe(1)
    await h.dispose()
    expect(h.stops).toBe(1)
    expect(cleared).toHaveBeenCalledWith(123)
    intervals[0]!()
    expect(h.calls).toBe(1)
    h = undefined
  } finally {
    if (h) await h.dispose()
    interval.mockRestore(); timeout.mockRestore(); cleared.mockRestore()
  }
})
