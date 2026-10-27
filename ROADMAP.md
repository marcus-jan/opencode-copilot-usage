# Theme-aware colors and configurable display lines

Status: **planned, not implemented**. This document proposes the next iteration;
the current release only supports `refreshSeconds` as a plugin option.

## Goals and existing behavior

- Keep usage visible only for a selected Copilot provider, without replacing
  OpenCode's existing sidebar, branch, prompt status, or health/version row.
- Preserve the current default layout: sidebar title, usage, remaining quota,
  and reset date; a separate usage line in the home footer.
- Build on the existing semantic theme tokens. Today the title uses
  `text.base`, secondary lines use `text.muted`, and the usage summary switches
  to `text.feedback.warning.base` at 75% used and `text.feedback.error.base`
  at 90%. Retrieval errors use the warning token.
- Make colors and line selection consistent across the sidebar and home footer.
- Keep account credentials server-side and all usage data in memory.

## Proposed configuration

This example is a **design proposal**, not configuration supported today:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/opencode-copilot-usage",
      "options": {
        "refreshSeconds": 60,
        "colors": {
          "mode": "theme",
          "warningAt": 75,
          "criticalAt": 90,
        },
        "display": {
          "sidebar": {
            "enabled": true,
            "lines": ["title", "usage", "remaining", "reset"],
          },
          "home": {
            "enabled": true,
            "lines": ["usage"],
          },
        },
      },
    },
  ],
}
```

### Line selection

Each surface accepts an ordered `lines` array. The same IDs work on both
surfaces; each selected home line occupies its own row in the existing vertical
`home.footer` region. An empty array hides that contribution without leaving
blank space. `enabled: false` hides a surface while retaining its line choices.

| Line ID | Content | Default |
| --- | --- | --- |
| `title` | Copilot usage heading | Sidebar |
| `usage` | Used / entitlement, unit, percentage; unlimited/loading/error state | Both |
| `remaining` | Remaining quota, using GitHub's reported value | Sidebar |
| `reset` | Reset date | Sidebar |
| `account` | Account login | Off |
| `plan` | Plan name | Off |
| `overage` | Overage, only when positive | Off |
| `updated` | Last fetch time | Off |

Rules:

- Omitted options retain today's layout, refresh interval, and thresholds.
- Missing account/plan/date/overage fields do not produce empty rows. Unknown
  numeric quota values remain `?`, never an invented zero.
- Remaining and overage lines are omitted for unlimited quotas. Do not derive
  percentages or severity for unlimited quotas.
- A configured, enabled surface with at least one line shows a compact status
  fallback for loading, unavailable quota, or retrieval errors even if `usage`
  was omitted. Explicitly disabled/empty surfaces remain hidden.
- Account and plan remain opt-in in persistent UI. The details command retains
  the full available account information regardless of surface line selection.
- Poll only while Copilot is selected and at least one surface is enabled with
  nonempty lines. `/copilot-usage` can still fetch manually when both are hidden.

### Theme behavior

- `theme` (default): labels use `text.muted`, ordinary values/headings use
  `text.base`, and usage warnings/critical states use the semantic warning/error
  tokens. Emphasize the quota value rather than coloring every secondary line.
- `muted`: use the theme's muted foreground consistently, retaining text labels
  and explicit error wording.
- `inherit`: omit plugin foreground overrides and inherit the host foreground.
- Read theme tokens reactively during rendering so a live theme change updates
  the contribution without recreating the plugin.
- Do not introduce hard-coded hex/ANSI colors, custom backgrounds, or a separate
  theme palette. Color must not be the only indication of an error or exhaustion.
- Validate finite percentage thresholds with
  `0 <= warningAt < criticalAt <= 100`; an invalid pair falls back to 75/90.

### Normalization and compatibility

- Add one pure options normalizer for defaults, types, enum values, and bounds.
- Merge nested defaults independently: overriding home lines must not reset
  sidebar choices or `refreshSeconds`.
- Accept empty arrays; filter unknown line IDs and remove duplicates while
  preserving order. An invalid non-array value uses the default line list.
- Ignore unknown options for forward compatibility. Invalid modes and booleans
  use defaults; no raw options or credentials should enter logs.
- Continue using the supported additive slots. No renderable lookup/mutation,
  replacement claims, core patches, new config files, or persisted usage state.
- Apply configuration changes through OpenCode's normal watch/reload lifecycle.

## Implementation sequence

1. **Options contract** — add `src/options.ts`, types, defaults, normalization,
   and unit tests. Leave existing server credential and RPC logic unchanged.
2. **Presentation model** — extract ordered display-line construction and
   semantic color roles from rendering. Reuse shared formatting for sidebar,
   home, and details without duplicating quota parsing. Keep details independent
   of surface filtering.
3. **Theme-aware rendering** — render labels and values separately, resolve
   semantic roles against the current theme, and retain severity thresholds and
   inherited/muted modes. Do not change the default text content.
4. **Configurable surfaces** — wire enabled flags and ordered line selection into
   both slots, hide empty contributions, and gate automatic refreshes when both
   surfaces are intentionally hidden. Preserve manual refresh and cleanup.
5. **Verification and documentation** — expand headless UI tests, document the
   actual supported options/defaults and examples in `README.md`, and update the
   package version only when implementation is ready.

## Acceptance criteria

- [ ] Existing config produces the same default text, line order, provider-only
  visibility, additive placement, and 60-second polling.
- [ ] Threshold boundary tests cover below/at 75% and 90%, custom thresholds,
  invalid values, unknown quota, unlimited quota, exhaustion, and HTTP failures.
- [ ] Options tests cover partial nested overrides, invalid types, unknown IDs,
  duplicate IDs, empty arrays, and independent surface toggles.
- [ ] Headless tests assert the resolved foregrounds with contrasting light/dark
  token sets and a live theme change, not just text snapshots.
- [ ] Headless tests cover reordered/hidden/optional lines on both surfaces,
  fallback status, missing data, narrow widths, and no empty layout gaps.
- [ ] Existing branch/status/health rows remain present and are never replaced.
- [ ] Both hidden surfaces stop automatic polling; manual details still work;
  non-Copilot providers issue no quota requests.
- [ ] Unload/reload clears timers/listeners and does not duplicate contributions.
- [ ] Local-directory entrypoint resolution, typecheck, and all tests pass.
- [ ] Manual smoke check confirms theme/config reload in OpenCode 2.1.4 before
  enabling any new option in the live user configuration.

## Out of scope

Progress bars, arbitrary RGB overrides, interactive settings dialogs, theme
editors, credential changes, GitHub endpoint changes, and moving the footer
directly beneath the branch are not part of this iteration.
