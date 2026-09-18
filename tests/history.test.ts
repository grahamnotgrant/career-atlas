import { describe, it, expect } from "vitest";
import {
  jobIdentity,
  receiptApplication,
  applicationsFromDeclines,
  joinDeclines,
  joinConfirmations,
  extractStandaloneConfirmations,
  isIncompleteApplicationMessage,
  workbookOpportunities,
  ledgerApplication,
  reconcileOpportunities,
} from "../shared/history";
const row = {
  key: "a".repeat(64),
  date: "2026-09-01",
  title: "Engineer",
  company: "Example",
  compensation: "",
  location: "Remote",
  raw: '| 2026-09-01 | Engineer | Example | | Remote | ATS | Confirmed on-screen "Your application was successfully submitted." |',
};
describe("historical reconciliation", () => {
  it("never treats submitted membership, another role, or failed attempts as confirmation", () => {
    for (const note of [
      "None",
      "Already applied elsewhere; confirmed submission for a different role",
      "Attempted: application not submitted",
      "No confirmation; prepared resume",
    ])
      expect(
        ledgerApplication(
          {
            ...row,
            raw: row.raw.replace(
              'Confirmed on-screen "Your application was successfully submitted."',
              note,
            ),
          },
          "ledger",
        ),
      ).toBeNull();
    expect(ledgerApplication(row, "ledger")?.status).toBe("pending");
  });
  it("keeps requisitions distinct and strips tracking without dropping identity parameters", () => {
    expect(
      jobIdentity(
        "Acme",
        "Engineer",
        "https://jobs.test/app?id=1&utm_source=a",
      ),
    ).toBe(jobIdentity("Acme", "Engineer", "https://jobs.test/app?id=1"));
    expect(
      jobIdentity("Acme", "Engineer", "https://jobs.test/app?id=1"),
    ).not.toBe(jobIdentity("Acme", "Engineer", "https://jobs.test/app?id=2"));
  });
  it("does not upgrade workbook claims to confirmed applications", () => {
    const [o] = workbookOpportunities(
      [
        {
          Title: "Engineer",
          Company: "Acme",
          "History (APPLICATIONS.md)": "Submitted confirmed",
        },
      ],
      "source",
      "2026-09-17T00:00:00Z",
    );
    expect(o.lifecycle).toBe("discovered");
    expect(o.submittedAt).toBeNull();
  });
  it("preserves ambiguity instead of joining two same-title requisitions", () => {
    const os = workbookOpportunities(
      [1, 2].map((i) => ({
        Title: "Engineer",
        Company: "Example",
        "Apply Link": `https://jobs.test/${i}`,
      })),
      "source",
      "2026-09-17T00:00:00Z",
    );
    expect(
      reconcileOpportunities(os, [ledgerApplication(row, "ledger")!]),
    ).toHaveLength(2);
  });
  it("reconciles 2000 rows deterministically without losing distinct jobs", () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      Title: "Engineer",
      Company: "Acme",
      "Apply Link": `https://jobs.test/${i}`,
    }));
    const a = workbookOpportunities(rows, "source", "2026-09-17T00:00:00Z");
    const b = workbookOpportunities(
      [...rows, ...rows],
      "source",
      "2026-09-17T00:00:00Z",
    );
    expect(a).toHaveLength(2000);
    expect(b).toEqual(a);
  });
});

it("matches receipt identity at word boundaries and rejects failed or wrong-date receipts", () => {
  const source =
    "Example - Engineer\nSubmitted: 2026-09-01\nVERIFIED CONFIRMATION: Your application was successfully submitted.";
  expect(receiptApplication(row, source, "receipt.txt")).not.toBeNull();
  expect(
    receiptApplication({ ...row, company: "Exam" }, source, "receipt.txt"),
  ).toBeNull();
  expect(
    receiptApplication({ ...row, date: "2026-09-02" }, source, "receipt.txt"),
  ).toBeNull();
  expect(
    receiptApplication(row, source + "\nNot submitted", "receipt.txt"),
  ).toBeNull();
});
it("never assigns a decline to ambiguous requisitions or infers an interview stage", () => {
  const app = ledgerApplication(row, "ledger")!;
  const msg = {
    id: "123",
    date: "2026-09-10T12:00:00Z",
    subject: "Example Engineer update",
    from: "Example",
    text: "We have decided to proceed with other candidates.",
    source_url: "https://mail.example/message/123",
  };
  expect(joinDeclines([app, { ...app, id: "different" }], [msg])).toHaveLength(
    1,
  );
  expect(app.status).toBe("pending");
  expect(joinDeclines([app], [msg])).toHaveLength(0);
  expect(app.status).toBe("rejected");
  expect(app.events.at(-1)?.stage).toBeNull();
  joinDeclines([app], [msg]);
  expect(app.events).toHaveLength(2);
});

it("uses unknown submission dates for exact employer acknowledgments, never outreach", () => {
  const m = {
    id: "ack",
    date: "2026-09-10T00:00:00Z",
    subject: "Example Engineer update",
    from: "Example",
    text: "Your application has been reviewed. We are proceeding with other candidates.",
    source_url: "https://mail.example/ack",
  };
  const [a] = applicationsFromDeclines([row], [], [m]);
  expect(a.submitted).toBeNull();
  expect(a.events[0].date).toBeNull();
  expect(
    applicationsFromDeclines(
      [row],
      [],
      [{ ...m, text: "Would you like to apply?" }],
    ),
  ).toHaveLength(0);
});
it("does not reject scheduling problems or ongoing candidate review", () => {
  for (const text of [
    "We are unable to schedule tomorrow.",
    "We are still interviewing other candidates.",
    "We decided to interview other candidates as well as you.",
  ]) {
    const app = ledgerApplication(row, "ledger")!;
    expect(
      joinDeclines(
        [app],
        [
          {
            id: "status",
            date: "2026-09-10T00:00:00Z",
            subject: "Example Engineer",
            from: "Example",
            text,
            source_url: "https://mail.example/status",
          },
        ],
      ),
    ).toHaveLength(1);
    expect(app.status).toBe("pending");
  }
});
it("retains same-title distinct jobs and only crosswalks exact source URLs", () => {
  const os = workbookOpportunities(
    [
      {
        Company: "Example",
        Title: "Engineer",
        "Apply Link": "https://jobs.test/1",
      },
    ],
    "source",
    "2026-09-17T00:00:00Z",
  );
  const a = ledgerApplication(row, "ledger")!;
  expect(reconcileOpportunities(os, [a])).toHaveLength(1);
  a.evidence[0].text += " https://jobs.test/2";
  expect(reconcileOpportunities(os, [a])).toHaveLength(1);
  a.evidence[0].text += " https://jobs.test/1";
  expect(reconcileOpportunities(os, [a])).toHaveLength(0);
});

it("recovers exact-role Gmail confirmations without duplicate applications or inferred dates", () => {
  const apps: ReturnType<typeof ledgerApplication>[] = [];
  const m = {
    id: "email",
    date: "2026-09-02T00:00:00Z",
    subject: "Example Engineer application",
    from: "Example",
    text: "Thank you for applying. We received your application.",
    source_url: "https://mail.example/email",
  };
  const a: NonNullable<ReturnType<typeof ledgerApplication>>[] = [];
  expect(joinConfirmations([row], a, [m])).toHaveLength(0);
  expect(a).toHaveLength(1);
  expect(a[0].submitted).toBeNull();
  joinConfirmations([row], a, [m]);
  expect(a).toHaveLength(1);
  expect(
    joinConfirmations([row], [], [{ ...m, subject: "Verify your email" }]),
  ).toHaveLength(1);
  expect(
    joinConfirmations(
      [row],
      [],
      [{ ...m, subject: "Example Scientist application" }],
    ),
  ).toHaveLength(1);
});

it("rejects negated and incomplete acknowledgments in every inference path", () => {
  const cases = [
    "We have not received your application for the Engineer role at Example.",
    "We haven't received your application for the Engineer role at Example.",
    "We have not yet received your application for the Engineer role at Example.",
    "Your application has not been submitted. Thank you for applying for the Engineer role at Example.",
    "Your application is not yet submitted. Thank you for applying for the Engineer role at Example.",
    "Please complete your application. Thank you for applying for the Engineer role at Example.",
    "To complete your application, verify your email. Thank you for applying for the Engineer role at Example.",
  ];
  for (const text of cases) {
    const m = {
      id: "incomplete",
      date: "2026-09-01T00:00:00Z",
      subject: "Application reminder",
      from: "Example",
      text: `Hi Graham, ${text}`,
      source_url: "https://mail.example/incomplete",
    };
    expect(isIncompleteApplicationMessage(m.text)).toBe(true);
    const a: NonNullable<ReturnType<typeof ledgerApplication>>[] = [];
    expect(joinConfirmations([row], a, [m])).toHaveLength(1);
    expect(a).toHaveLength(0);
    expect(extractStandaloneConfirmations(a, [m], { year: 2026, recipientName: "Graham" })).toBe(0);
    expect(a).toHaveLength(0);
    expect(applicationsFromDeclines([row], [], [m])).toHaveLength(0);
  }
});
it("keeps actual received confirmations eligible", () => {
  expect(
    isIncompleteApplicationMessage(
      "We have received your application. Please complete this optional survey.",
    ),
  ).toBe(false);
  const a: NonNullable<ReturnType<typeof ledgerApplication>>[] = [];
  expect(
    extractStandaloneConfirmations(a, [
      {
        id: "positive",
        date: "2026-09-01T00:00:00Z",
        subject: "Application received",
        from: "Example",
        text: "Hi Graham, We have received your application for the Engineer role at Example.",
        source_url: "https://mail.example/positive",
      },
    ], { year: 2026, recipientName: "Graham" }),
  ).toBe(1);
});

it("preserves non-Latin employers and roles without collapsing identities", () => {
  const rows = [
    { Company: "東京会社", Title: "開発者" },
    { Company: "大阪会社", Title: "開発者" },
    { Company: "東京会社", Title: "管理者" },
  ];
  const os = workbookOpportunities(rows, "source", "2026-09-17T00:00:00Z");
  expect(os).toHaveLength(3);
  expect(os.every((o) => o.companyKey.length > 0)).toBe(true);
});

it("requires the configured recipient and supports an explicit history year", () => {
  const message = {
    id: "other-recipient",
    date: "2030-09-01T00:00:00Z",
    subject: "Application received",
    from: "Example",
    text: "Hi Alex, We have received your application for the Engineer role at Example.",
    source_url: "https://mail.example/other-recipient",
  };
  expect(extractStandaloneConfirmations([], [message], { year: 2030 })).toBe(0);
  expect(extractStandaloneConfirmations([], [message], { year: 2030, recipientName: "Alex" })).toBe(1);
  expect(extractStandaloneConfirmations([], [message], { year: 2026, recipientName: "Alex" })).toBe(0);
  expect(extractStandaloneConfirmations([], [message], { year: 2030, recipientName: "Graham" })).toBe(0);
  expect(extractStandaloneConfirmations([], [{ ...message, text: message.text.replace("Alex", "Alexandra") }], { year: 2030, recipientName: "Alex" })).toBe(0);
  expect(extractStandaloneConfirmations([], [message], { year: 2030, recipientName: ".*" })).toBe(0);
});
