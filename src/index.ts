import { createHash } from "node:crypto"
import { Plugin } from "@opencode/plugin"
import { createUsageCache } from "./cache"
import { CopilotUsage } from "./rpc"
import { fetchUsage, unavailable } from "./usage"

export default Plugin.define({
  id: "copilot-usage-sidebar",
  async setup(context) {
    const cache = createUsageCache()
    const controller = new AbortController()
    await context.rpc.register(CopilotUsage, {
      get: async (input) => {
        try {
          const connection = await context.integration.connection.active("github-copilot")
          if (!connection) return unavailable("GitHub Copilot is not connected")
          const credential = await context.integration.connection.resolve(connection)
          if (!credential) return unavailable("Copilot credential is unavailable")
          const token = credential.type === "oauth" ? credential.refresh || credential.access
            : credential.type === "key" ? credential.key : undefined
          if (!token) return unavailable("Copilot OAuth token is unavailable")
          const enterpriseUrl = credential.metadata?.enterpriseUrl
          // Fingerprint only in RAM. Credentials never cross RPC or enter persistent storage.
          const key = createHash("sha256").update(JSON.stringify([token, enterpriseUrl])).digest("hex")
          const force = (input as { refresh?: boolean }).refresh === true
          return await cache.get(key, () => fetchUsage(token, enterpriseUrl, fetch, controller.signal), force)
        } catch {
          return unavailable("Could not resolve Copilot connection")
        }
      },
    })
    return () => controller.abort()
  },
})
