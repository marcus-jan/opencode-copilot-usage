# Copilot usage for OpenCode

A standalone **OpenCode V2** plugin that shows your GitHub Copilot account quota
only while the selected model belongs to `github-copilot` or
`github-copilot-enterprise`.

- **Sessions:** adds a Copilot usage section to the existing sidebar.
- **New-session screen:** adds its own footer line above the bottom health/version
  row. The existing branch, prompt status, MCP status, and version are untouched.
- **Details:** `/copilot-usage` or **Show Copilot account usage** in the command
  palette refreshes usage and opens account, plan, remaining quota, reset date,
  and update-time details when GitHub supplies them.

Example home-footer line:

```text
Copilot: 250 / 1,000 credits · 25.0% used
```

The label is **credits** only when GitHub reports token-based billing. Legacy
plans show **premium requests** instead. This is account-wide usage, not a
per-session cost estimate. Unknown values stay unknown; they are not reported as
zero. Unlimited plans are displayed as unlimited.

## Compatibility and placement

Built and typechecked against OpenCode **2.1.4**. Uses the supported V2 server,
custom RPC, and TUI plugin APIs; it does not support OpenCode V1.

OpenCode currently has no supported vertical slot directly below the branch
inside the prompt footer. All `prompt.footer` contributions share a horizontal
row. This plugin deliberately uses a separate `home.footer` contribution rather
than replacing existing information or mutating OpenCode's internal layout.

## Enable locally

Clone or download this repository, then run `bun install --frozen-lockfile`
inside it. To enable it, merge this entry into your
existing `plugins` array in `~/.config/opencode/opencode.json(c)` (or the project
configuration if you want project-only scope):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/absolute/path/opencode-copilot-usage",
  ],
}
```

Replace the example path with your checkout's absolute path. Preserve all
existing settings and plugin entries. Configure the **directory**,
not an individual source file: its root `index.ts` and `tui.tsx` entrypoints
support local-directory loading; package exports provide the same entrypoints
when published. OpenCode loads the TUI contribution from
the server plugin entry automatically. **Do not add a duplicate entry to
`cli.json`.** With a remote OpenCode server, the directory must be available to
the server and the CLI must be able to resolve the TUI package.

Configuration changes are watched. Use `/reload` if you need to force a reload;
no service restart is needed. Select a Copilot model to see the quota. Sign in
to GitHub Copilot through OpenCode's normal provider connection flow if needed.

To remove it, remove only this plugin entry and save the config (or `/reload`).
No credentials or account state are written by this plugin.

### Optional refresh interval

The default is 60 seconds, with a minimum of 30 seconds:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/opencode-copilot-usage",
      "options": { "refreshSeconds": 120 },
    },
  ],
}
```

It also refreshes shortly after a successful turn in the current session.
Normal requests share a 30-second in-memory, account-scoped cache; manual and
post-turn refreshes bypass it. Concurrent requests are deduplicated. Polling does
not fetch usage while a non-Copilot provider is selected.

## Privacy and limitations

- The server resolves the existing Copilot connection through OpenCode's
  integration API. No separate token, environment variable, or credential file
  is needed.
- GitHub OAuth credentials remain server-side. Only parsed usage fields cross
  the custom RPC channel. Tokens and raw responses are never logged or stored.
- Usage and credential fingerprints exist only in memory. Account changes use
  a different cache key; old account entries are discarded.
- Requests use HTTPS, reject redirects, time out after 10 seconds, and are
  aborted when the server plugin unloads. HTTP failures display a safe status,
  never a raw response body or exception.
- GitHub's `/copilot_internal/user` endpoint is undocumented and may change or
  omit fields for some plans. The UI displays unavailable/missing quota rather
  than guessing. GitHub may also update quota with a delay after a request.
- Enterprise hosts use the connection's `enterpriseUrl` metadata and the
  `https://api.<enterprise-host>` endpoint convention. Availability depends on
  the enterprise's GitHub configuration; this has not been live-tested.
- The sidebar contribution appears when OpenCode's sidebar is visible. This
  plugin does not force the sidebar open or change its visibility preferences.

## Development

Use Bun **1.3.14 or newer** (OpenTUI's minimum). If using Node-based tooling,
OpenTUI requires Node **26.4 or newer**.

```sh
bun install --frozen-lockfile
bun run check
```

The checks cover quota parsing, billing labels, missing and unlimited quotas,
provider matching, endpoint validation, credential handling, error sanitization,
account cache isolation, cleanup, and a real headless OpenTUI render that
switches providers and checks the separate footer line.

Tests use synthetic credentials and mocked GitHub responses. No live Copilot
request or live OpenCode configuration change is made by the test suite.

## Planned improvements

See [ROADMAP.md](ROADMAP.md) for the plan to expand semantic, theme-aware colors
and let each surface choose which lines to show and in what order. Those options
are **not implemented yet**; the current configurable option is `refreshSeconds`.

## References and attribution

- [OpenCode V2 plugins](https://opencode.ai/v2/docs/build/plugins)
- [OpenCode V2 CLI plugins](https://opencode.ai/v2/docs/build/plugins/cli)
- [OpenCode V2 custom RPC](https://opencode.ai/v2/docs/build/plugins/rpc)
- Inspired by and adapts the quota endpoint/parsing approach from
  [murtuzaalisurti/opencode-github-copilot-usage](https://github.com/murtuzaalisurti/opencode-github-copilot-usage).
  See `NOTICE` and `LICENSE` for attribution and the MIT license.
