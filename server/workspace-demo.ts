import { Store } from "./store";
import type { Manifest } from "../shared/model";

/** Fictional paths across professions. Never seed an existing workspace. */
export function seedWorkspaceDemo(store: Store) {
  if (store.snapshot().mode !== "empty" || store.workspace.revision() !== 0)
    throw new Error(
      "Use a separate empty data directory for the workspace example.",
    );
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const paths = [
    {
      id: "design",
      company: "Example Design Studio",
      title: "Interior Design Assistant",
      label: "Client brief and portfolio",
      observation:
        "A fictional room-planning project includes a brief, alternative layouts and a client review.",
      contribution:
        "The person's choices and the team's implementation still need clarification.",
      wording: null,
    },
    {
      id: "graduate",
      company: "Example Research Institute",
      title: "Graduate Research Associate",
      label: "Coursework and volunteering",
      observation:
        "A fictional course project and volunteer event provide evidence of research and coordination.",
      contribution:
        "The person reports designing the survey and coordinating volunteers.",
      wording:
        "Designed a course-project survey and coordinated volunteers for a community event.",
    },
    {
      id: "operations",
      company: "Example Service Cooperative",
      title: "Operations Coordinator",
      label: "Process improvement",
      observation:
        "A fictional project brief documents handoff problems and a revised process.",
      contribution:
        "The person reports mapping the handoff and testing the revised process with the team.",
      wording:
        "Mapped a team handoff and tested a revised process with colleagues.",
    },
  ];
  const manifest: Manifest = {
    version: 1,
    mode: "demo",
    label: "Fictional workspace examples",
    coverage:
      "Synthetic examples across professions; no real applications or outcomes.",
    applications: paths.map((p) => ({
      id: `example-${p.id}`,
      company: p.company,
      title: p.title,
      location: "Remote",
      theme: "remote",
      compensation: "Not specified in this fictional example",
      status: "pending",
      submitted: day,
      asOf: day,
      verification: "Synthetic receipt only",
      evidence: [
        {
          id: `example-${p.id}-receipt`,
          kind: "receipt",
          label: "Fictional application acknowledgment",
          basis: "Synthetic demonstration",
          text: "This is a fictional acknowledgment for a demonstration application.",
        },
      ],
      events: [
        {
          id: `example-${p.id}-submitted`,
          stage: "applied",
          date: day,
          label: "Fictional submission",
          detail: "Synthetic example only",
          kind: "submission",
          evidenceIds: [`example-${p.id}-receipt`],
        },
      ],
    })),
  };
  store.importManifest(manifest, store.dir);
  let sequence = 0;
  const command = (
    action: string,
    payload: Record<string, unknown>,
    actor = "example-agent",
    channel: "agent" | "app" = "agent",
  ) =>
    store.workspace.command({
      id: `example-command-${++sequence}`,
      expectedRevision: store.workspace.revision(),
      actor,
      channel,
      action,
      payload,
    });
  command("run", {
    run: {
      id: "example-evidence-run",
      label: "Reviewing experience evidence",
      operation: "uncover-evidence",
      owner: "example-agent",
      status: "waiting",
      phase: "Clarifying personal contribution",
      nextAction: "Answer the portfolio question",
    },
  });
  command("question", {
    question: {
      id: "example-portfolio-question",
      prompt:
        "Which decision in the room-planning project was yours, and what changed after the client review?",
      runId: "example-evidence-run",
      support: [
        { label: "Fictional project brief", reference: "example:design-brief" },
      ],
    },
  });
  for (const p of paths) {
    command("fact", {
      fact: {
        id: `example-fact-${p.id}`,
        label: p.label,
        observation: p.observation,
        contribution: p.contribution,
        ownership: p.id === "design" ? "unresolved" : "user-reported",
        outcome: "draft",
        wording: p.wording,
        support: [
          { label: "Fictional example source", reference: `example:${p.id}` },
        ],
      },
    });
    command("material", {
      material: {
        id: `example-material-${p.id}`,
        applicationId: `example-${p.id}`,
        attemptKey: "example-attempt",
        label:
          p.id === "design"
            ? "Portfolio upload inventory"
            : "Application question inventory",
        role: p.id === "design" ? "portfolio" : "answer",
        mediaType: p.id === "design" ? "application/pdf" : "text/plain",
        coverage: "recovery-needed",
        reference: `example:${p.id}-original`,
        support: [
          {
            label: "Fictional source archive",
            reference: `example:${p.id}-archive`,
          },
        ],
        questions: [
          {
            prompt: "Describe a relevant project and your contribution.",
            answer: "",
            status: "uncaptured",
          },
        ],
      },
    });
  }
  command("source", {
    source: {
      id: "example-portfolio-source",
      label: "Portfolio project folder",
      kind: "portfolio",
      scope: "Fictional project brief and review notes",
      authorizationRef: "Synthetic demo only",
      coverage: "partial",
      checkedAt: now,
      message: "Original portfolio files are not included in this example.",
      recoveryAction:
        "Use the authorized original files to verify the project.",
    },
  });
  command(
    "steer",
    {
      instruction:
        "Focus on design and project coordination opportunities, and ask about my own decisions before drafting claims.",
    },
    "person",
    "app",
  );
  return {
    applications: paths.length,
    workspaceRevision: store.workspace.revision(),
    mode: "demo",
  };
}
