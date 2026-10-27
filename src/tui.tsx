/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal, Show } from "solid-js"
import { CopilotUsage } from "./rpc"
import { details, isCopilot, severity, summary, unavailable, type Usage } from "./usage"

export default Plugin.define({
  id: "copilot-usage-sidebar.tui",
  setup(context) {
    const rpc = context.client.rpc(CopilotUsage)
    const [usage, setUsage] = createSignal<Usage>()
    const active = () => isCopilot(context.ui.model.current()?.providerID)
    const rawInterval = context.options.refreshSeconds
    const interval = typeof rawInterval === "number" && Number.isFinite(rawInterval)
      ? Math.max(30, rawInterval) * 1000 : 60_000
    let disposed = false
    let pending: Promise<void> | undefined
    let turnTimer: ReturnType<typeof setTimeout> | undefined

    function refresh(force = false): Promise<void> {
      if (disposed || !active()) return Promise.resolve()
      if (pending) return pending
      pending = rpc.get({ refresh: force }).then((result) => {
        if (!disposed) setUsage(result as Usage)
      }).catch(() => {
        if (!disposed) setUsage(unavailable("Usage service unavailable; enable the server plugin"))
      }).finally(() => { pending = undefined })
      return pending
    }

    // This computation is owned by plugin setup and disposed by OpenCode on unload.
    // Refresh immediately when switching to Copilot, not just at the next poll.
    createEffect(() => {
      const providerID = context.ui.model.current()?.providerID
      if (isCopilot(providerID)) void refresh()
      else setUsage(undefined)
    })
    const timer = setInterval(() => { void refresh() }, interval)
    const stopTurn = context.data.on("session.execution.succeeded", (event) => {
      const route = context.ui.router.current()
      if (!active() || route.type !== "session" || event.data.sessionID !== route.sessionID) return
      clearTimeout(turnTimer)
      turnTimer = setTimeout(() => { void refresh(true) }, 3_000)
    })

    const color = () => {
      const level = severity(usage())
      return level === "normal" ? context.theme.text.muted : context.theme.text.feedback[level].base
    }

    // Additive: no replace claims, host lookups, or mutation of the built-in layout.
    context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <Show when={active()}>
          <box flexDirection="column" flexShrink={0}>
            <text fg={context.theme.text.base}><b>Copilot usage</b></text>
            <text fg={color()}>{summary(usage()).replace(/^Copilot: /, "")}</text>
            <Show when={usage()?.quota && !usage()?.quota?.unlimited && !usage()?.error}>
              <text fg={context.theme.text.muted}>
                Remaining: {usage()?.quota?.remaining?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "?"}
              </text>
            </Show>
            <Show when={usage()?.resetDate && !usage()?.error}>
              <text fg={context.theme.text.muted}>Resets: {usage()?.resetDate?.split("T")[0]}</text>
            </Show>
          </box>
        </Show>
      ),
    })

    // home.footer is a vertical region; prepending creates a genuinely separate
    // line ABOVE the bottom health/version row, not another item in that row.
    context.ui.slot({
      prepend: "home.footer",
      render: () => (
        <Show when={active()}>
          <box paddingLeft={2} paddingRight={2} flexShrink={0}>
            <text fg={color()}>{summary(usage())}</text>
          </box>
        </Show>
      ),
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "copilot-usage-sidebar.show",
        title: "Show Copilot account usage",
        group: "Copilot",
        palette: true,
        enabled: active,
        slash: { name: "copilot-usage" },
        run: async () => {
          await refresh(true)
          if (!disposed) await context.ui.dialog.alert({ title: "Copilot account usage", message: details(usage()).join("\n") })
        },
      }],
    }))

    return () => {
      disposed = true
      clearInterval(timer)
      clearTimeout(turnTimer)
      stopTurn()
    }
  },
})
