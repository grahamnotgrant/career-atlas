import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

export type Agent = "codex" | "claude";
export type Action = "install" | "update" | "uninstall" | "status";
const shortcuts = {
  start: [
    "Open or resume Career Atlas",
    "Choose the route from the user's request and evidence-backed prerequisites. Resume unfinished onboarding when needed; otherwise resume the established workspace and saved operation without repeating answered questions or discarding approvals and valid grants.",
  ],
  sync: [
    "Sync authorized sources and work evidence",
    "Follow Resume and sync in the startup guide and [maintain records](../../../skills/maintain-records/SKILL.md). Check the authorized source scope, retain each source's checked-through point, cursor and blockers, and gather new work evidence incrementally with focused questions where needed. Verify canonical writes and spreadsheet export separately; report the coverage actually checked.",
  ],
  change: [
    "Change preferences, records or the application",
    "Follow Request changes in the startup guide. Classify the user's correction before writing, apply its explicit scope, and preserve provenance, untouched fields and prior submitted materials. Use the shared contracts for changed claims, material versions, grant changes and software changes.",
  ],
  apply: [
    "Apply from the existing queue within valid grants",
    "Follow [run search](../../../skills/run-search/SKILL.md) for eligible roles already in the queue. Reconcile uncertain attempts, vet each role, use the required exclusive claim, and submit only within an existing valid grant using approved material versions. Preserve receipts and scoped blockers. This shortcut does not broaden authorization or authorize discovery.",
  ],
  review: [
    "Audit evidence and review scoped outcomes",
    "Follow [review and improve](../../../skills/review-and-improve/SKILL.md). Audit the available evidence and source coverage before interpreting outcomes; distinguish employer feedback, user reports and agent hypotheses. Limit conclusions to the checked scope and propose any changed claims or materials through the shared approval contract.",
  ],
  scout: [
    "Find and triage new roles",
    "Follow [scout roles](../../../skills/scout-roles/SKILL.md) for discovery and triage only: poll the employer boards with `npm run scout`, store discovered roles as opportunities, triage them, and grow the board list within authorized source coverage. Do not claim, prepare or submit; hand triaged roles to career-apply.",
  ],
  daily: [
    "Run the shared daily Career Atlas workflow",
    "Follow [daily flow](../../../skills/daily-flow/SKILL.md) as the coordinator for source maintenance, incremental work-evidence discovery and focused questions, queue discovery and triage, authorized applications, and scoped review. Reuse startup and saved phase checkpoints across the shared skills. Applications require existing valid grants and approved material versions; preserve blocked phases while continuing independent authorized work.",
  ],
} as const;
const owner = ".career-atlas-owner.json";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function detectAgents(env: NodeJS.ProcessEnv = process.env): Agent[] {
  const executable = (name: string) =>
    (env.PATH ?? "").split(delimiter).some((p) => existsSync(join(p, name)));
  return (["codex", "claude"] as Agent[]).filter((a) =>
    a === "codex"
      ? !!(env.CODEX_HOME || env.CODEX_THREAD_ID || executable("codex"))
      : !!(
          env.CLAUDECODE ||
          env.CLAUDE_CODE_ENTRYPOINT ||
          executable("claude")
        ),
  );
}
export function selectAgents(target: string, env = process.env): Agent[] {
  if (target === "both") return ["codex", "claude"];
  if (target === "codex" || target === "claude") return [target];
  if (target !== "auto") throw new Error("Choose auto, codex, claude or both.");
  const detected = detectAgents(env);
  if (!detected.length)
    throw new Error(
      "No supported agent detected. Specify codex or claude (desktop users can select explicitly).",
    );
  return detected;
}
function safe(root: string, relative: string) {
  let path = root;
  for (const part of relative.split("/")) {
    path = join(path, part);
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error(`Refusing symlink: ${relative}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return path;
}
function files(
  agent: Agent,
  name: string,
  description: string,
  task: string,
): Record<string, string> {
  const result: Record<string, string> = {
    "SKILL.md": `---\nname: career-${name}\ndescription: ${description}\n${agent === "claude" ? "disable-model-invocation: true\n" : ""}---\n\nRead [AGENTS.md](../../../AGENTS.md), the [startup guide](../../../docs/AGENT-START.md) and the [workflow contracts](../../../docs/WORKFLOW-CONTRACTS.md) relative to this skill directory. The repository root is ../../..; resolve other workflow paths from that root.\n\nRun Common startup exactly once per run, reusing its completion across coordinator phases and nested shared skills. Reuse the established workspace, private data directory and saved session; resume its checkpoints. Startup reuse does not replace fresh canonical, grant or claim/lease checks required immediately before a mutation or submission.\n\n${task}\n\nUse the shared instructions and approval, material and source contracts. Preserve evidence, authorization and saved session checkpoints.\n${agent === "claude" ? "\nUser request: $ARGUMENTS\n" : ""}`,
  };
  if (agent === "codex")
    result["agents/openai.yaml"] =
      `interface:\n  display_name: "Career ${name}"\n  short_description: "${description}"\n  default_prompt: "Use $career-${name} for Career Atlas."\npolicy:\n  allow_implicit_invocation: false\n`;
  return result;
}
function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Refusing symlink: ${join(dir, entry.name)}`);
    return entry.isDirectory()
      ? listFiles(join(dir, entry.name), rel + "/")
      : [rel];
  });
}
function manageUnlocked(
  project: string,
  action: Action,
  agents: Agent[],
  lockPath: string,
) {
  if (!["install", "update", "uninstall", "status"].includes(action))
    throw new Error("Unknown command action.");
  const root = realpathSync(project);
  if (!existsSync(join(root, "docs/AGENT-START.md")))
    throw new Error("Career Atlas startup guide is missing.");
  const plans = [...new Set(agents)].flatMap((agent) =>
    Object.entries(shortcuts).map(([name, [description, task]]) => {
      const relative = `${agent === "codex" ? ".agents" : ".claude"}/skills/career-${name}`;
      const path = safe(root, relative);
      const desired = files(agent, name, description, task);
      let state = "missing";
      if (existsSync(path)) {
        state = "conflict";
        try {
          const manifest = JSON.parse(
            readFileSync(safe(root, relative + "/" + owner), "utf8"),
          );
          const actual = listFiles(path)
            .filter((f) => f !== owner)
            .sort();
          if (
            manifest.product === "career-atlas" &&
            manifest.version === 1 &&
            JSON.stringify(actual) ===
              JSON.stringify(Object.keys(manifest.files).sort()) &&
            actual.every(
              (f) =>
                hash(readFileSync(join(path, f), "utf8")) === manifest.files[f],
            )
          ) {
            state =
              JSON.stringify(actual) ===
                JSON.stringify(Object.keys(desired).sort()) &&
              actual.every((f) => hash(desired[f]) === manifest.files[f])
                ? "current"
                : "outdated";
          }
        } catch {
          /* Unknown or modified files belong to the user. */
        }
      }
      if (
        agent === "claude" &&
        existsSync(safe(root, `.claude/commands/career-${name}.md`))
      )
        state = "conflict";
      return { relative, path, desired, state };
    }),
  );
  if (action === "status")
    return plans.map((p) => ({ path: p.relative, state: p.state }));
  const conflicts = plans.filter((p) => p.state === "conflict");
  if (conflicts.length)
    throw new Error(
      `Existing or edited shortcuts preserved. Resolve conflicts first:\n${conflicts.map((p) => p.relative).join("\n")}`,
    );
  for (const p of plans) {
    if (action === "uninstall") {
      if (p.state !== "missing") rmSync(p.path, { recursive: true });
      continue;
    }
    if (p.state === "current") continue;
    mkdirSync(dirname(p.path), { recursive: true });
    const staging = join(lockPath, randomUUID());
    mkdirSync(staging);
    for (const [name, body] of Object.entries(p.desired)) {
      mkdirSync(dirname(join(staging, name)), { recursive: true });
      writeFileSync(join(staging, name), body, { flag: "wx" });
    }
    writeFileSync(
      join(staging, owner),
      JSON.stringify(
        {
          product: "career-atlas",
          version: 1,
          files: Object.fromEntries(
            Object.entries(p.desired).map(([n, b]) => [n, hash(b)]),
          ),
        },
        null,
        2,
      ) + "\n",
    );
    const backup = join(lockPath, randomUUID());
    if (p.state !== "missing") renameSync(p.path, backup);
    try {
      renameSync(staging, p.path);
    } catch (e) {
      if (existsSync(backup)) renameSync(backup, p.path);
      throw e;
    }
  }
  return plans.map((p) => ({
    path: p.relative,
    state: action === "uninstall" ? "removed" : "current",
  }));
}
export function manageCommands(
  project: string,
  action: Action,
  agents: Agent[],
) {
  if (action === "status") return manageUnlocked(project, action, agents, "");
  const root = realpathSync(project);
  const lockPath = safe(root, ".private/agent-commands.lock");
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    mkdirSync(lockPath);
  } catch {
    throw new Error(
      "Another installer may be running. Inspect .private/agent-commands.lock before retrying.",
    );
  }
  try {
    return manageUnlocked(root, action, agents, lockPath);
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [action = "status", target = "auto", ...extra] =
      process.argv.slice(2);
    if (extra.length)
      throw new Error(
        "Usage: npm run commands -- install|update|uninstall|status [auto|codex|claude|both]",
      );
    const agents = selectAgents(target);
    console.log(
      JSON.stringify(manageCommands(root, action as Action, agents), null, 2),
    );
    if (action === "install" || action === "update")
      console.log(
        `Open this project in your agent. Start with ${agents.map((a) => (a === "codex" ? "$career-start (Codex)" : "/career-start (Claude)")).join(" or ")}.`,
      );
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
