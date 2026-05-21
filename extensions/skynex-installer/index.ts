import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

function skynexAgentHome(): string {
  return process.env.SKYNEX_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

interface InstallResult {
  agents: number;
  skipped: number;
}

/**
 * Copy bundled agents from <package>/assets/agents/ to ~/.pi/agent/agents/.
 * Idempotent: only copies if file is missing or content differs.
 * Returns count of installed/skipped files.
 */
export function installSkynexAssets(force = false): InstallResult {
  let agents = 0;
  let skipped = 0;

  const sourceDir = join(ASSETS_DIR, "agents");
  if (!existsSync(sourceDir)) {
    return { agents: 0, skipped: 0 };
  }

  const destDir = join(skynexAgentHome(), "agents");
  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md") continue;

    const sourcePath = join(sourceDir, entry.name);
    const destPath = join(destDir, entry.name);

    try {
      if (!force && existsSync(destPath)) {
        const sourceContent = readFileSync(sourcePath, "utf8");
        const destContent = readFileSync(destPath, "utf8");
        if (sourceContent === destContent) {
          skipped += 1;
          continue;
        }
      }
      const content = readFileSync(sourcePath, "utf8");
      writeFileSync(destPath, content);
      agents += 1;
    } catch {
      skipped += 1;
    }
  }

  return { agents, skipped };
}

/**
 * Count how many bundled assets are stale (missing or out of sync) at the destination.
 */
export function skynexAssetDriftCount(): number {
  let drift = 0;
  const sourceDir = join(ASSETS_DIR, "agents");
  if (!existsSync(sourceDir)) return 0;

  const destDir = join(skynexAgentHome(), "agents");

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md") continue;

    const sourcePath = join(sourceDir, entry.name);
    const destPath = join(destDir, entry.name);

    try {
      if (!existsSync(destPath)) {
        drift += 1;
        continue;
      }
      if (readFileSync(sourcePath, "utf8") !== readFileSync(destPath, "utf8")) {
        drift += 1;
      }
    } catch {
      drift += 1;
    }
  }

  return drift;
}

export default function skynexInstaller(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const result = installSkynexAssets(false);
      if (ctx.hasUI && result.agents > 0) {
        ctx.ui.notify(
          `🌌 skynex-pi: installed ${result.agents} new agent file(s) to ${skynexAgentHome()}/agents/`,
          "info",
        );
      }
    } catch (error) {
      if (ctx.hasUI) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(
          `skynex-pi installer failed: ${message}`,
          "warning",
        );
      }
    }
  });

  pi.registerCommand("skynex:install", {
    description:
      "Repair or refresh skynex-pi agent files. Use --force to overwrite existing files.",
    handler: async (args, ctx) => {
      const force = args.includes("--force");
      const result = installSkynexAssets(force);
      ctx.ui.notify(
        `skynex-pi agents installed: ${result.agents} new file(s), ${result.skipped} already present.`,
        "info",
      );
    },
  });

  pi.registerCommand("skynex:status", {
    description: "Show skynex-pi package status.",
    handler: async (_args, ctx) => {
      const drift = skynexAssetDriftCount();
      const sourceDir = join(ASSETS_DIR, "agents");
      const destDir = join(skynexAgentHome(), "agents");
      const sourceCount = existsSync(sourceDir)
        ? readdirSync(sourceDir).filter((f) => f.endsWith(".md") && f !== "README.md").length
        : 0;

      ctx.ui.notify(
        [
          "skynex-pi package status:",
          `Package root: ${PACKAGE_ROOT}`,
          `Bundled agents: ${sourceCount}`,
          `Install destination: ${destDir}`,
          `Drift: ${drift} file(s)${
            drift > 0
              ? " — run /skynex:install to sync (or /skynex:install --force to overwrite)"
              : ""
          }`,
        ].join("\n"),
        drift > 0 ? "warning" : "info",
      );
    },
  });
}
