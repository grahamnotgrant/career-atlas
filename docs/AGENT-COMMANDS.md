# Agent shortcuts

Setup can install five project shortcuts:

```sh
npm run atlas -- setup --commands=auto
```

Auto detection checks the current agent environment and executables on PATH. For a desktop app without a CLI, choose `--commands=codex`, `--commands=claude`, or `--commands=both`. Setup without this flag leaves agent configuration alone. Cloning the repository does not install shortcuts.

Open this repository in your agent and start with **career-start**: `$career-start` in Codex, `/career-start` in Claude Code.

| Shortcut      | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| career-start  | Onboard or resume                                           |
| career-sync   | Check sources, reconcile records, verify spreadsheet export |
| career-change | Change preferences, correct records, request app changes    |
| career-apply  | Continue applications within existing authorization         |
| career-review | Analyze outcomes and identify improvements                  |

The shortcuts read [AGENT-START.md](AGENT-START.md) and existing workflow skills. They add no account access or submission permission. Sync runs when invoked; it does not create a background schedule.

## Manage installation

From the repository:

```sh
npm run commands -- install both
npm run commands -- status both
npm run commands -- update both
npm run commands -- uninstall both
```

Replace `both` with `codex`, `claude`, or `auto`. After updating repository code, run the shortcut update command. If a shortcut does not appear, reopen the project in your agent.

The installer uses `.agents/skills/career-*` for Codex and `.claude/skills/career-*` for Claude Code. It writes no home-directory configuration. Each installed directory includes a file-hash manifest. Updates and uninstall refuse edited or unowned directories, additional files, symlinks, and conflicting legacy Claude commands. Move your custom version to another name before retrying. A failed preflight changes no shortcuts. An interrupted install can leave `.private/agent-commands.lock`; inspect its contents and confirm no installer is running before removing it, retaining any backup directories.

The project ignores generated shortcuts in Git. Keep shared instructions in `docs/` and `skills/`, so new clones remain opt-in.

Format references: [Codex skills](https://developers.openai.com/codex/skills/), [Claude Code skills](https://code.claude.com/docs/en/skills).
