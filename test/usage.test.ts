import { describe, expect, test } from "bun:test"
import { apiBase, details, fetchUsage, isCopilot, parseUsage, severity, summary } from "../src/usage"

describe("quota parsing", () => {
  test("credits use quota_remaining and credits_used instead of legacy counters", () => {
    const usage = parseUsage({
      token_based_billing: true,
      login: "example",
      copilot_plan: "pro",
      quota_reset_date_utc: "2026-11-01T00:00:00Z",
      quota_snapshots: { premium_interactions: {
        entitlement: 1000, remaining: 990, quota_remaining: 750,
        credits_used: 255, percent_remaining: 75, overage_count: 5,
      } },
    }, 123)
    expect(usage.fetchedAt).toBe(123)
    expect(usage.quota).toMatchObject({ remaining: 750, used: 255, percentUsed: 25, overage: 5 })
    expect(summary(usage)).toBe("Copilot: 255 / 1,000 credits · 25.0% used")
    expect(details(usage)).toContain("Account: example")
    expect(details(usage)).toContain("Resets: 2026-11-01T00:00:00Z")
  })

  test("legacy plans remain labeled premium requests, not credits", () => {
    const usage = parseUsage({ quota_snapshots: { premium_interactions: { entitlement: 300, remaining: 60 } } })
    expect(summary(usage)).toBe("Copilot: 240 / 300 premium requests · 80.0% used")
    expect(severity(usage)).toBe("warning")
  })

  test("unlimited, exhausted, missing, fractional, and zero quotas", () => {
    const make = (quota: object) => parseUsage({ quota_snapshots: { premium_interactions: quota } })
    expect(summary(make({ unlimited: true, entitlement: 0 }))).toBe("Copilot: unlimited")
    expect(severity(make({ unlimited: true, percent_remaining: 0 }))).toBe("normal")
    expect(severity(make({ entitlement: 300, remaining: 0 }))).toBe("error")
    expect(summary(parseUsage({ copilot_plan: "free" }))).toBe("Copilot: no quota reported")
    expect(summary(make({ entitlement: 0, remaining: 0 }))).not.toContain("NaN")
    expect(summary(make({ entitlement: 10, remaining: 9.125 }))).toContain("0.88 / 10")
    expect(summary(make({}))).toBe("Copilot: no quota reported")
  })

  test("malformed numeric values never become NaN or Infinity", () => {
    const usage = parseUsage({ quota_snapshots: { premium_interactions: {
      entitlement: "300", remaining: -1, credits_used: Infinity, percent_remaining: NaN,
    } } })
    expect(usage.quota).toMatchObject({ entitlement: undefined, remaining: undefined, used: undefined, percentUsed: undefined })
    expect(summary(usage)).not.toMatch(/NaN|Infinity/)
    expect(() => parseUsage(null)).toThrow("Invalid quota response")
  })
})

describe("provider and endpoint safety", () => {
  test("only the two built-in Copilot providers qualify", () => {
    expect(isCopilot("github-copilot")).toBe(true)
    expect(isCopilot("github-copilot-enterprise")).toBe(true)
    for (const id of [undefined, "openai", "anthropic", "copilot", "github-copilot-other"]) {
      expect(isCopilot(id)).toBe(false)
    }
  })

  test("enterprise URLs are normalized and invalid URLs fail closed", () => {
    expect(apiBase()).toBe("https://api.github.com")
    expect(apiBase("example.ghe.com")).toBe("https://api.example.ghe.com")
    expect(apiBase("https://example.ghe.com/")).toBe("https://api.example.ghe.com")
    for (const url of ["http://example.ghe.com", "https://user:pass@example.ghe.com", "https://example.ghe.com/path", "https://example.ghe.com?x=1", "https://example.ghe.com:8443", {}]) {
      expect(() => apiBase(url)).toThrow()
    }
  })

  test("quota request uses OAuth, prevents redirects, and only returns usage", async () => {
    let seen: { url: string; init?: RequestInit } | undefined
    const mock = async (url: string, init: RequestInit) => {
      seen = { url: String(url), init }
      return Response.json({ login: "example", quota_snapshots: { premium_interactions: { entitlement: 300, remaining: 100 } } })
    }
    const usage = await fetchUsage("test-only-token", undefined, mock)
    expect(seen?.url).toBe("https://api.github.com/copilot_internal/user")
    expect(seen?.init?.redirect).toBe("error")
    expect(new Headers(seen?.init?.headers).get("Authorization")).toBe("token test-only-token")
    expect(seen?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(usage.login).toBe("example")
    expect(JSON.stringify(usage)).not.toContain("test-only-token")
  })

  test("HTTP, malformed JSON, and network errors do not disclose secrets", async () => {
    const mocks = [
      async () => new Response("secret-response", { status: 401 }),
      async () => new Response("secret-response"),
      async () => { throw new Error("secret-response") },
    ]
    for (const mock of mocks) {
      const usage = await fetchUsage("test-only-token", undefined, mock)
      expect(usage.error).toBeDefined()
      expect(JSON.stringify(usage)).not.toMatch(/secret-response|test-only-token/)
    }
    expect((await fetchUsage("x", undefined, mocks[0])).error).toContain("HTTP 401")
  })
})
