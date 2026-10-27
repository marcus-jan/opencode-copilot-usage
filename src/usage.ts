export const PROVIDER_IDS = ["github-copilot", "github-copilot-enterprise"] as const

export type Quota = {
  entitlement?: number
  remaining?: number
  used?: number
  percentUsed?: number
  unlimited: boolean
  overage?: number
}

export type Usage = {
  fetchedAt: number
  login?: string
  plan?: string
  resetDate?: string
  tokenBasedBilling: boolean
  quota?: Quota
  error?: string
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function parseUsage(value: unknown, now = Date.now()): Usage {
  const body = record(value)
  if (Object.keys(body).length === 0) throw new Error("Invalid quota response")
  const snapshot = record(record(body.quota_snapshots).premium_interactions)
  let quota: Quota | undefined
  if (Object.keys(snapshot).length > 0) {
    const entitlement = number(snapshot.entitlement)
    const remaining = number(snapshot.quota_remaining) ?? number(snapshot.remaining)
    const reported = number(snapshot.percent_remaining)
    const percentRemaining = reported ?? (
      entitlement !== undefined && entitlement > 0 && remaining !== undefined
        ? remaining / entitlement * 100
        : undefined
    )
    quota = {
      entitlement,
      remaining,
      used: number(snapshot.credits_used) ?? (
        entitlement !== undefined && remaining !== undefined ? Math.max(0, entitlement - remaining) : undefined
      ),
      percentUsed: percentRemaining === undefined ? undefined : 100 - Math.min(100, percentRemaining),
      unlimited: snapshot.unlimited === true,
      overage: number(snapshot.overage_count),
    }
  }
  return {
    fetchedAt: now,
    login: string(body.login),
    plan: string(body.copilot_plan) ?? string(body.access_type_sku),
    resetDate: string(body.quota_reset_date_utc) ?? string(body.quota_reset_date),
    tokenBasedBilling: body.token_based_billing === true,
    quota,
  }
}

export function isCopilot(providerID: string | undefined): boolean {
  return PROVIDER_IDS.some((id) => id === providerID)
}

export function apiBase(enterpriseUrl?: unknown): string {
  if (enterpriseUrl === undefined || enterpriseUrl === "") return "https://api.github.com"
  if (typeof enterpriseUrl !== "string") throw new Error("Invalid enterprise host")
  const url = new URL(enterpriseUrl.includes("://") ? enterpriseUrl : `https://${enterpriseUrl}`)
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error("Invalid enterprise host")
  }
  return `https://api.${url.hostname}`
}

export function unavailable(message: string): Usage {
  return { fetchedAt: Date.now(), tokenBasedBilling: false, error: message }
}

/** GitHub OAuth token, not the short-lived Copilot inference token. Never return/log it. */
export async function fetchUsage(
  token: string,
  enterpriseUrl?: unknown,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
  signal?: AbortSignal,
): Promise<Usage> {
  try {
    const response = await fetcher(`${apiBase(enterpriseUrl)}/copilot_internal/user`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `token ${token}`,
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "X-GitHub-Api-Version": "2025-04-01",
      },
    })
    // Do not surface response bodies or arbitrary exceptions: either may contain secrets.
    if (!response.ok) return unavailable(`GitHub quota unavailable (HTTP ${response.status})`)
    return parseUsage(await response.json())
  } catch {
    return unavailable("Could not retrieve Copilot quota")
  }
}

export const count = (value: number | undefined) => value === undefined
  ? "?"
  : value.toLocaleString("en-US", { maximumFractionDigits: 2 })

export function summary(usage: Usage | undefined): string {
  if (!usage) return "Copilot: loading usage…"
  if (usage.error) return `Copilot: ${usage.error}`
  const quota = usage.quota
  if (!quota) return "Copilot: no quota reported"
  if (quota.unlimited) return "Copilot: unlimited"
  const unit = usage.tokenBasedBilling ? "credits" : "premium requests"
  const percent = quota.percentUsed === undefined ? "" : ` · ${quota.percentUsed.toFixed(1)}% used`
  return `Copilot: ${count(quota.used)} / ${count(quota.entitlement)} ${unit}${percent}`
}

export function severity(usage: Usage | undefined, warningAt = 75, criticalAt = 90): "normal" | "warning" | "error" {
  if (usage?.error) return "warning"
  if (usage?.quota?.unlimited) return "normal"
  const used = usage?.quota?.percentUsed
  if (used === undefined) return "normal"
  return used >= criticalAt ? "error" : used >= warningAt ? "warning" : "normal"
}

export function details(usage: Usage | undefined): string[] {
  if (!usage || usage.error) return [summary(usage)]
  const quota = usage.quota
  return [
    summary(usage),
    ...(usage.login ? [`Account: ${usage.login}`] : []),
    ...(usage.plan ? [`Plan: ${usage.plan}`] : []),
    ...(quota && !quota.unlimited ? [`Remaining: ${count(quota.remaining)}`] : []),
    ...(quota?.overage && !quota.unlimited ? [`Overage: ${count(quota.overage)}`] : []),
    ...(usage.resetDate ? [`Resets: ${usage.resetDate}`] : []),
    `Updated: ${new Date(usage.fetchedAt).toLocaleTimeString()}`,
  ]
}
