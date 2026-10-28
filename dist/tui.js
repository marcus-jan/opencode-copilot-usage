// @bun
// src/tui.tsx
import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid";
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid";
import { effect as _$effect } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid";
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createRoot, createSignal, For, Show } from "opentui:runtime-module:solid-js";

// src/rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var CopilotUsage = Rpc.define({
  id: "copilot-usage-sidebar",
  events: {},
  methods: {
    get: {
      input: {
        type: "object",
        properties: {
          refresh: {
            type: "boolean"
          }
        },
        additionalProperties: false
      },
      output: {
        type: "object"
      }
    },
    options: {
      input: {
        type: "object",
        additionalProperties: false
      },
      output: {
        type: "object"
      }
    }
  }
});

// src/options.ts
var LINE_IDS = ["title", "usage", "remaining", "reset", "account", "plan", "overage", "updated"];
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function surface(value, defaults) {
  const input = record(value);
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    lines: Array.isArray(input.lines) ? [...new Set(input.lines.filter((id) => LINE_IDS.includes(id)))] : [...defaults]
  };
}
function normalizeOptions(value) {
  const input = record(value);
  const colors = record(input.colors);
  const display = record(input.display);
  const warning = colors.warningAt === undefined ? 75 : colors.warningAt;
  const critical = colors.criticalAt === undefined ? 90 : colors.criticalAt;
  const valid = finite(warning) && finite(critical) && warning >= 0 && warning < critical && critical <= 100;
  return {
    refreshSeconds: finite(input.refreshSeconds) ? Math.max(30, input.refreshSeconds) : 60,
    colors: {
      mode: colors.mode === "muted" || colors.mode === "inherit" ? colors.mode : "theme",
      warningAt: valid ? warning : 75,
      criticalAt: valid ? critical : 90
    },
    display: {
      sidebar: surface(display.sidebar, ["title", "usage", "remaining", "reset"]),
      home: surface(display.home, ["usage"])
    }
  };
}
var enabled = (surface2) => surface2.enabled && surface2.lines.length > 0;

// src/usage.ts
var PROVIDER_IDS = ["github-copilot", "github-copilot-enterprise"];
function isCopilot(providerID) {
  return PROVIDER_IDS.some((id) => id === providerID);
}
function unavailable(message) {
  return {
    fetchedAt: Date.now(),
    tokenBasedBilling: false,
    error: message
  };
}
var count = (value) => value === undefined ? "?" : value.toLocaleString("en-US", {
  maximumFractionDigits: 2
});
function summary(usage) {
  if (!usage)
    return "Copilot: loading usage\u2026";
  if (usage.error)
    return `Copilot: ${usage.error}`;
  const quota = usage.quota;
  if (!quota)
    return "Copilot: no quota reported";
  if (quota.unlimited)
    return "Copilot: unlimited";
  const unit = usage.tokenBasedBilling ? "credits" : "premium requests";
  const percent = quota.percentUsed === undefined ? "" : ` \xB7 ${quota.percentUsed.toFixed(1)}% used`;
  return `Copilot: ${count(quota.used)} / ${count(quota.entitlement)} ${unit}${percent}`;
}
function severity(usage, warningAt = 75, criticalAt = 90) {
  if (usage?.error)
    return "warning";
  if (usage?.quota?.unlimited)
    return "normal";
  const used = usage?.quota?.percentUsed;
  if (used === undefined)
    return "normal";
  return used >= criticalAt ? "error" : used >= warningAt ? "warning" : "normal";
}
function details(usage) {
  if (!usage || usage.error)
    return [summary(usage)];
  const quota = usage.quota;
  return [summary(usage), ...usage.login ? [`Account: ${usage.login}`] : [], ...usage.plan ? [`Plan: ${usage.plan}`] : [], ...quota && !quota.unlimited ? [`Remaining: ${count(quota.remaining)}`] : [], ...quota?.overage && !quota.unlimited ? [`Overage: ${count(quota.overage)}`] : [], ...usage.resetDate ? [`Resets: ${usage.resetDate}`] : [], `Updated: ${new Date(usage.fetchedAt).toLocaleTimeString()}`];
}

// src/presentation.ts
function displayLines(usage, surface2, home = false) {
  if (!enabled(surface2))
    return [];
  const quota = usage?.quota;
  const status = !usage || usage.error || !quota;
  const line = (id) => {
    if (id === "title")
      return {
        id,
        segments: [{
          text: "Copilot usage",
          role: "heading"
        }]
      };
    if (id === "usage")
      return {
        id,
        segments: [...home ? [{
          text: "Copilot: ",
          role: "label"
        }] : [], {
          text: summary(usage).replace(/^Copilot: /, ""),
          role: "quota"
        }]
      };
    if (!usage || usage.error)
      return;
    const values = {
      remaining: ["Remaining", quota && !quota.unlimited ? count(quota.remaining) : undefined],
      reset: ["Resets", usage.resetDate?.split("T")[0]],
      account: ["Account", usage.login],
      plan: ["Plan", usage.plan],
      overage: ["Overage", quota && !quota.unlimited && quota.overage ? count(quota.overage) : undefined],
      updated: ["Updated", new Date(usage.fetchedAt).toLocaleTimeString()]
    };
    const value = values[id];
    return value?.[1] ? {
      id,
      segments: [{
        text: `${value[0]}: `,
        role: "label"
      }, {
        text: value[1],
        role: "value"
      }]
    } : undefined;
  };
  const lines = surface2.lines.map(line).filter((value) => value !== undefined);
  if (status && !surface2.lines.includes("usage"))
    lines.push(line("usage"));
  return lines;
}

// src/tui.tsx
var tui_default = Plugin.define({
  id: "copilot-usage-sidebar.tui",
  setup(context) {
    const rpc = context.client.rpc(CopilotUsage);
    const [usage, setUsage] = createSignal();
    const active = () => isCopilot(context.ui.model.current()?.providerID);
    const local = Object.keys(context.options ?? {}).length > 0;
    const [options, setOptions] = createSignal(normalizeOptions(context.options), {
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    });
    const [dimensions, setDimensions] = createSignal({
      width: context.renderer.width,
      height: context.renderer.height
    });
    const resize = (width, height) => setDimensions({
      width,
      height
    });
    context.renderer.on("resize", resize);
    const automatic = () => active() && (enabled(options().display.sidebar) || enabled(options().display.home));
    let disposed = false;
    let pending;
    let turnTimer;
    function loadOptions() {
      if (local)
        return Promise.resolve();
      return Promise.resolve().then(() => rpc.options({})).then((result) => {
        if (!disposed)
          setOptions(normalizeOptions(result));
      }).catch(() => {});
    }
    function refresh(force = false) {
      if (disposed || !active())
        return Promise.resolve();
      if (pending)
        return pending;
      pending = rpc.get({
        refresh: force
      }).then((result) => {
        if (!disposed && active())
          setUsage(result);
      }).catch(() => {
        if (!disposed && active())
          setUsage(unavailable("Usage service unavailable; enable the server plugin"));
      }).finally(() => {
        pending = undefined;
      });
      return pending;
    }
    const stopModel = createRoot((dispose) => {
      createEffect(() => {
        const providerID = context.ui.model.current()?.providerID;
        if (isCopilot(providerID) && automatic())
          refresh();
        else
          setUsage(undefined);
      });
      return dispose;
    });
    let timer;
    const stopTimer = createRoot((dispose) => {
      createEffect(() => {
        const seconds = options().refreshSeconds;
        clearInterval(timer);
        timer = setInterval(() => {
          if (local) {
            if (automatic())
              refresh();
            return;
          }
          loadOptions().then(() => {
            if (automatic())
              refresh();
          });
        }, seconds * 1000);
      });
      return dispose;
    });
    loadOptions();
    const stopTurn = context.data.on("session.execution.succeeded", (event) => {
      const route = context.ui.router.current();
      if (!automatic() || route.type !== "session" || event.data.sessionID !== route.sessionID)
        return;
      clearTimeout(turnTimer);
      turnTimer = setTimeout(() => {
        if (automatic())
          refresh(true);
      }, 3000);
    });
    const color = (role) => {
      if (options().colors.mode === "inherit")
        return;
      if (options().colors.mode === "muted" || role === "label")
        return context.theme.text.muted;
      const level = severity(usage(), options().colors.warningAt, options().colors.criticalAt);
      return role === "quota" && level !== "normal" ? context.theme.text.feedback[level].base : context.theme.text.base;
    };
    const Lines = (props) => _$createComponent(For, {
      get each() {
        return props.lines;
      },
      children: (line) => (() => {
        var _el$ = _$createElement("text");
        _$insert(_el$, _$createComponent(For, {
          get each() {
            return line.segments;
          },
          children: (segment) => (() => {
            var _el$2 = _$createElement("span");
            _$insert(_el$2, _$createComponent(Show, {
              get when() {
                return segment.role === "heading";
              },
              get fallback() {
                return segment.text;
              },
              get children() {
                var _el$3 = _$createElement("b");
                _$insert(_el$3, () => segment.text);
                return _el$3;
              }
            }));
            _$effect((_$p) => _$setProp(_el$2, "style", {
              fg: color(segment.role)
            }, _$p));
            return _el$2;
          })()
        }));
        return _el$;
      })()
    });
    const sidebarLines = () => displayLines(usage(), options().display.sidebar);
    const homeLines = () => displayLines(usage(), options().display.home, true);
    context.ui.slot({
      append: "sidebar.content",
      render: () => _$createComponent(Show, {
        get when() {
          return _$memo(() => !!active())() && sidebarLines().length > 0;
        },
        get children() {
          var _el$4 = _$createElement("box");
          _$setProp(_el$4, "flexDirection", "column");
          _$setProp(_el$4, "flexShrink", 0);
          _$insert(_el$4, _$createComponent(Lines, {
            get lines() {
              return sidebarLines();
            }
          }));
          return _el$4;
        }
      })
    });
    context.ui.slot({
      prepend: "home.footer",
      render: () => {
        const spacing = () => dimensions().height >= 16 && dimensions().width >= 44 ? -1 : 0;
        return _$createComponent(Show, {
          get when() {
            return _$memo(() => !!active())() && homeLines().length > 0;
          },
          get children() {
            var _el$5 = _$createElement("box");
            _$setProp(_el$5, "flexDirection", "column");
            _$setProp(_el$5, "paddingLeft", 2);
            _$setProp(_el$5, "paddingRight", 2);
            _$setProp(_el$5, "flexShrink", 0);
            _$insert(_el$5, _$createComponent(Lines, {
              get lines() {
                return homeLines();
              }
            }));
            _$effect((_$p) => _$setProp(_el$5, "marginBottom", spacing(), _$p));
            return _el$5;
          }
        });
      }
    });
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "copilot-usage-sidebar.show",
        title: "Show Copilot account usage",
        group: "Copilot",
        palette: true,
        enabled: active,
        slash: {
          name: "copilot-usage"
        },
        run: async () => {
          if (disposed || !active())
            return;
          await refresh(true);
          if (!disposed)
            await context.ui.dialog.alert({
              title: "Copilot account usage",
              message: details(usage()).join(`
`)
            });
        }
      }]
    }));
    return () => {
      disposed = true;
      stopModel();
      stopTimer();
      clearInterval(timer);
      clearTimeout(turnTimer);
      context.renderer.off("resize", resize);
      stopTurn();
    };
  }
});
export {
  tui_default as default
};
