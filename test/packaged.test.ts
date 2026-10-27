import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

test("installed TUI fetches after model hydration without a turn or poll", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-packaged-startup-"))
  try {
    const installed = join(directory, "node_modules/opencode-copilot-usage-sidebar")
    const manifest = JSON.parse(await readFile("package.json", "utf8"))
    const entrypoint = join(installed, manifest.exports["./tui"])
    await mkdir(dirname(entrypoint), { recursive: true })
    await copyFile(resolve(manifest.exports["./tui"]), entrypoint)
    await writeFile(join(installed, "package.json"), JSON.stringify(manifest))
    await symlink(resolve("node_modules/@opencode"), join(directory, "node_modules/@opencode"))
    const child = Bun.spawn([
      process.execPath, "--preload", "@opentui/solid/preload",
      "test/fixtures/packaged-startup.tsx", entrypoint,
    ], { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    expect({ status, stderr }).toEqual({ status: 0, stderr: "" })
    expect(stdout).toContain("packaged startup passed")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
