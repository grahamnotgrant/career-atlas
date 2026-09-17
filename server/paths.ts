import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
export function dataDirectory() {
  if (process.env.CAREER_FLOW_DATA)
    return resolve(process.env.CAREER_FLOW_DATA);
  const root =
    platform() === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : platform() === "win32"
        ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
        : (process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"));
  return join(root, "career-flow");
}
