import { Rpc } from "@opencode/plugin/rpc"

export const CopilotUsage = Rpc.define({
  id: "copilot-usage-sidebar",
  events: {},
  methods: {
    get: {
      input: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
        additionalProperties: false,
      },
      output: { type: "object" },
    },
    options: {
      input: { type: "object", additionalProperties: false },
      output: { type: "object" },
    },
  },
})
