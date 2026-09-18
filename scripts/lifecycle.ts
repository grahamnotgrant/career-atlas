import {
  existsSync,
  mkdirSync,
  readFileSync,
  openSync,
  closeSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../server/paths";
import { backupData } from "../server/operations";
import { Store } from "../server/store";
import { manageCommands, selectAgents } from "./agent-commands";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dir = dataDirectory();
const url =
  process.env.CAREER_FLOW_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4317}`;
const [action, ref] = process.argv.slice(2);
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}). Personal files were preserved.`,
    );
}
async function request(path: string, method = "GET") {
  const headers = {
    Authorization: `Bearer ${readFileSync(join(dir, "control-token"), "utf8").trim()}`,
  };
  return fetch(new URL(path, url), {
    method,
    headers,
    signal: AbortSignal.timeout(2000),
  });
}
function initialize() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Node.js 24 or later is required.");
  const store = new Store(dir);
  store.close();
  for (const name of ["sessions", "templates", "materials"])
    mkdirSync(join(dir, name), { recursive: true, mode: 0o700 });
}
try {
  if (action === "setup") {
    if (ref && !/^--commands=(auto|codex|claude|both)$/.test(ref))
      throw new Error(
        "Use setup --commands=auto|codex|claude|both, or setup alone.",
      );
    const agents = ref ? selectAgents(ref.split("=")[1]) : [];
    initialize();
    run("npm", ["run", "build"]);
    if (agents.length) manageCommands(root, "install", agents);
    console.log(
      `Ready. Personal data: ${dir}\nRead docs/AGENT-START.md with your agent, then run npm run atlas -- start.
${agents.length ? "Start in your agent: " + agents.map((a) => (a === "codex" ? "$career-start (Codex)" : "/career-start (Claude)")).join(" or ") : "Optional shortcuts: npm run commands -- install auto"}`,
    );
  } else if (action === "doctor") {
    const checks: Record<string, unknown> = {
      node: process.versions.node,
      nodeSupported: Number(process.versions.node.split(".")[0]) >= 24,
      built: existsSync(join(root, "dist", "index.html")),
      database: existsSync(join(dir, "career.sqlite")),
      dataDirectory: dir,
    };
    try {
      const probe = join(dir, `.doctor-${randomUUID()}`);
      writeFileSync(probe, "", { flag: "wx", mode: 0o600 });
      unlinkSync(probe);
      checks.writable = true;
    } catch {
      checks.writable = false;
    }
    try {
      checks.server = (await request("/api/snapshot")).status;
    } catch {
      checks.server = "not running or unreachable";
    }
    const status = join(dir, "exports", "workbook-status.json");
    if (existsSync(status))
      checks.workbook = JSON.parse(readFileSync(status, "utf8"));
    console.log(JSON.stringify(checks, null, 2));
    if (
      !checks.nodeSupported ||
      !checks.built ||
      !checks.database ||
      !checks.writable
    )
      process.exitCode = 1;
  } else if (action === "start") {
    initialize();
    if (!existsSync(join(root, "dist", "index.html")))
      throw new Error("Build missing. Run npm run atlas -- setup.");
    try {
      const res = await request("/api/snapshot");
      if (res.ok) {
        console.log(`Already running: ${url}`);
        process.exit(0);
      }
      throw new Error(
        `Another service occupies ${url} (${res.status}). Choose another PORT.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Another service"))
        throw error;
    }
    const fd = openSync(join(dir, "logs", "server.log"), "a", 0o600);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(root, "server", "main.ts")],
      {
        cwd: root,
        env: { ...process.env, CAREER_FLOW_DATA: dir },
        detached: true,
        stdio: ["ignore", fd, fd],
      },
    );
    closeSync(fd);
    child.unref();
    for (let n = 0; n < 50; n++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        if ((await request("/api/snapshot")).ok) {
          console.log(`Running: ${url}`);
          process.exit(0);
        }
      } catch {}
    }
    throw new Error(
      `Startup did not become healthy. Inspect ${join(dir, "logs", "server.log")}.`,
    );
  } else if (action === "stop") {
    const response = await request("/api/shutdown", "POST");
    if (!response.ok)
      throw new Error(
        `Stop refused (${response.status}); no process was killed.`,
      );
    for (let n = 0; n < 30; n++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        await request("/api/snapshot");
      } catch {
        console.log("Stopped. Personal data preserved.");
        process.exit(0);
      }
    }
    throw new Error("Shutdown was requested but the server still responds.");
  } else if (action === "update") {
    if (!ref || ref.startsWith("-") || !/^[a-zA-Z0-9._/-]+$/.test(ref))
      throw new Error(
        "Specify a trusted fetched tag or commit: npm run atlas -- update REF",
      );
    try {
      const response = await request("/api/snapshot");
      if (response.ok) throw new Error("Stop Career Atlas before updating.");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Stop Career Atlas before updating."
      )
        throw error;
    }
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    });
    if (status.status !== 0 || status.stdout.trim())
      throw new Error(
        "Update requires a clean Git checkout. Preserve your changes first.",
      );
    const revision = spawnSync(
      "git",
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { cwd: root, encoding: "utf8" },
    );
    if (revision.status !== 0)
      throw new Error(
        "Unknown version. Fetch and review the intended tag or commit first.",
      );
    const backup = backupData(
      dir,
      join(dirname(dir), `career-atlas-backup-${Date.now()}`),
    );
    console.log(`Backup: ${backup.path}`);
    run("git", ["switch", "--detach", revision.stdout.trim()]);
    run("npm", ["ci"]);
    run("npm", ["run", "build"]);
    run("npm", ["test"]);
    console.log("Update validated. Run npm run atlas -- start.");
  } else
    throw new Error(
      "Usage: npm run atlas -- setup | start | stop | doctor | update TRUSTED_REF",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
