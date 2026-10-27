import {
  workspaceCommandSchema,
  type WorkspaceCommand,
} from "../shared/workspace";

export type CommandStorage = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>;

/** Journals a request before delivery so transport failures can reuse its ID. */
export class WorkspaceOutbox {
  private prefix: string;
  constructor(
    workspaceId: string,
    private storage: CommandStorage,
  ) {
    this.prefix = `career-atlas.workspace-command.v1.${workspaceId}.`;
  }
  get pending(): WorkspaceCommand | null {
    const keys = Array.from({ length: this.storage.length }, (_, index) =>
      this.storage.key(index),
    )
      .filter((key): key is string => !!key?.startsWith(this.prefix))
      .sort();
    if (!keys.length) return null;
    try {
      const command = workspaceCommandSchema.parse(
        JSON.parse(this.storage.getItem(keys[0]) ?? "null"),
      );
      if (
        command.actor !== "person" ||
        command.channel !== "app" ||
        keys[0] !== `${this.prefix}${command.id}`
      )
        throw new Error("Invalid pending request");
      return command;
    } catch {
      throw new Error(
        "A pending change could not be recovered. Ask your agent to reconcile it before making another change.",
      );
    }
  }
  stage(command: WorkspaceCommand) {
    if (this.pending)
      throw new Error(
        "A previous change still needs confirmation. Retry it before making another change.",
      );
    const parsed = workspaceCommandSchema.parse(command);
    const value = JSON.stringify(parsed),
      key = `${this.prefix}${parsed.id}`;
    this.storage.setItem(key, value);
    if (this.storage.getItem(key) !== value)
      throw new Error(
        "This browser could not preserve the change for safe delivery. Ask your agent to make it.",
      );
  }
  resolve(id: string) {
    this.storage.removeItem(`${this.prefix}${id}`);
  }
}
