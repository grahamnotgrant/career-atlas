import { describe, it, expect } from "vitest";
import { applyReviewedStages } from "../shared/stage-history";
import { ledgerApplication } from "../shared/history";
const app = () => ({
  ...ledgerApplication(
    {
      key: "b".repeat(64),
      date: "2026-09-01",
      company: "Example",
      title: "Engineer",
      location: "Remote",
      compensation: "",
      raw: '|2026-09-01|Engineer|Example||Remote|ATS|Confirmed "Your application was successfully submitted."|',
    },
    "ledger",
  )!,
  status: "rejected" as const,
});
const source = {
  id: "employer",
  date: "2026-09-10T00:00:00Z",
  subject: "Interview feedback",
  from: "recruiting@example.test",
  text: "Thank you for presenting your technical challenge to the team yesterday.",
  source_url: "https://mail.example/employer",
};
const review = () => [
  {
    applicationId: app().id,
    company: "Example",
    title: "Engineer",
    identityBasis: "Exact employer source and role identity reviewed.",
    events: [
      {
        id: "case-complete",
        stage: "case",
        kind: "interview",
        date: "2026-09-09",
        label: "Technical challenge completed",
        detail: "Employer confirms presentation.",
        proof: [
          {
            sourceId: "employer",
            quote:
              "Thank you for presenting your technical challenge to the team yesterday.",
          },
        ],
      },
    ],
  },
];
describe("reviewed interview history", () => {
  it("merges only explicitly reviewed duplicates, preserving all evidence idempotently", () => {
    const original = app();
    original.events.push({
      id: "generic",
      stage: null,
      kind: "decision",
      date: "2026-09-09",
      label: "Declined",
      detail: "",
      evidenceIds: [...original.events[0].evidenceIds],
    });
    const r = review();
    const event = {
      ...r[0].events[0],
      kind: "decision",
      supersedes: ["generic"],
    };
    const input = [{ ...r[0], events: [event] }];
    const once = applyReviewedStages([original], input, [source]);
    expect(once[0].events.filter((e) => e.kind === "decision")).toHaveLength(1);
    expect(
      once[0].events.find((e) => e.id === "case-complete")!.evidenceIds,
    ).toContain("stage-mail-employer");
    expect(
      once[0].events.find((e) => e.id === "case-complete")!.evidenceIds,
    ).toEqual(expect.arrayContaining(original.events[0].evidenceIds));
    expect(applyReviewedStages(once, input, [source])).toEqual(once);
    expect(() =>
      applyReviewedStages(
        [original],
        [{ ...r[0], events: [{ ...event, date: "2026-09-08" }] }],
        [source],
      ),
    ).toThrow("same kind and date");
  });
  it("preserves rejected status and records historical completed stage idempotently", () => {
    const original = app(),
      once = applyReviewedStages([original], review(), [source]),
      twice = applyReviewedStages(once, review(), [source]);
    expect(once[0].status).toBe("rejected");
    expect(
      once[0].events.some((e) => e.stage === "case" && e.kind === "interview"),
    ).toBe(true);
    expect(twice).toEqual(once);
    expect(original.events).toHaveLength(1);
  });
  it("keeps an invitation distinct from completion", () => {
    const r = review();
    r[0].events[0].kind = "invitation";
    const a = applyReviewedStages([app()], r, [source])[0];
    expect(
      a.events.filter((e) => e.stage === "case" && e.kind === "interview"),
    ).toHaveLength(0);
    expect(
      a.events.filter((e) => e.stage === "case" && e.kind === "invitation"),
    ).toHaveLength(1);
  });
  it("rejects missing sources, unsupported quotes and mismatched applications", () => {
    expect(() => applyReviewedStages([app()], review(), [])).toThrow(
      "Missing stage source",
    );
    expect(() =>
      applyReviewedStages([app()], review(), [
        { ...source, text: "We received your application." },
      ]),
    ).toThrow("Proof quote");
    expect(() =>
      applyReviewedStages([{ ...app(), company: "Other" }], review(), [source]),
    ).toThrow("Identity mismatch");
  });
  it("never counts an expected future interview as completed", () => {
    const r = review();
    r[0].events[0].date = "2026-10-01";
    expect(() => applyReviewedStages([app()], r, [source])).toThrow(
      "Completed interview requires",
    );
  });
  it("does not regress an existing rejection to active interview", () => {
    const r = [{ ...review()[0], status: "interview" }];
    expect(applyReviewedStages([app()], r, [source])[0].status).toBe(
      "rejected",
    );
  });
});
