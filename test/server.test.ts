import { expect, spyOn, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import plugin from "../src/index"
import type { Usage } from "../src/usage"

test("server resolves OAuth securely, caches by account, and aborts on unload", async () => {
  let handler!: (input: { refresh?: boolean }) => Promise<Usage>
  let credential: unknown = { type: "oauth", refresh: "test-refresh", access: "test-access" }
  let connected = true
  let lastSignal: AbortSignal | undefined
  let requests = 0
  const headers: string[] = []
  const mockFetch = async (...[_url, init]: Parameters<typeof fetch>) => {
    requests++
    lastSignal = init?.signal ?? undefined
    headers.push(new Headers(init?.headers).get("Authorization") ?? "")
    return Response.json({ login: `account-${requests}`, quota_snapshots: {
      premium_interactions: { entitlement: 100, remaining: 70 },
    } })
  }
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(Object.assign(mockFetch, { preconnect: fetch.preconnect }))
  const context = {
    rpc: { register: async (_definition: unknown, handlers: { get: typeof handler }) => { handler = handlers.get } },
    integration: { connection: {
      active: async (id: string) => {
        expect(id).toBe("github-copilot")
        return connected ? { id: "test-connection" } : undefined
      },
      resolve: async () => credential,
    } },
  } as unknown as Plugin.Context
  let cleanup: Awaited<ReturnType<typeof plugin.setup>>
  try {
    cleanup = await plugin.setup(context)
    expect(typeof handler).toBe("function")
    expect(requests).toBe(0) // Loading the plugin alone makes no GitHub request.
    const result = await handler({})
    expect(headers[0]).toBe("token test-refresh")
    expect(JSON.stringify(result)).not.toMatch(/test-refresh|test-access/)
    await handler({})
    expect(requests).toBe(1)
    await handler({ refresh: true })
    expect(requests).toBe(2)

    credential = { type: "oauth", access: "test-other-account" }
    await handler({})
    expect(requests).toBe(3)
    expect(headers[2]).toBe("token test-other-account")
    connected = false
    expect((await handler({})).error).toBe("GitHub Copilot is not connected")
    connected = true
    credential = undefined
    expect((await handler({})).error).toBe("Copilot credential is unavailable")
    credential = { type: "oauth", access: "", refresh: "" }
    expect((await handler({})).error).toBe("Copilot OAuth token is unavailable")
    expect(requests).toBe(3)
    if (typeof cleanup === "function") await cleanup()
    expect(lastSignal?.aborted).toBe(true)
  } finally {
    fetchSpy.mockRestore()
  }
})
