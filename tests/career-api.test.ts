import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
it("protects new career routes from unauthenticated and cross-origin writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "career-api-"));
  const store = new Store(dir),
    app = await createApp(store);
  try {
    expect((await app.inject("/api/career")).statusCode).toBe(401);
    for (const url of ["/api/career/commands", "/api/shutdown"])
      expect(
        (await app.inject({ method: "POST", url, payload: {} })).statusCode,
      ).toBe(401);
    const payload = {
      id: "settings",
      expectedRevision: store.career.revision(),
      action: "settings",
      payload: { settings: { goals: "New direction" } },
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/career/commands",
          headers: {
            authorization: `Bearer ${store.token}`,
            origin: "https://evil.example",
          },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    const response = await app.inject({
      method: "POST",
      url: "/api/career/commands",
      headers: { authorization: `Bearer ${store.token}` },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(store.career.snapshot().settings.goals).toBe("New direction");
    expect(
      (
        await app.inject({
          url: "/api/career",
          headers: { authorization: `Bearer ${store.token}` },
        })
      ).json().revision,
    ).toBe(payload.expectedRevision + 1);
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("reports only the public module path and handles absent builds", async () => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "career-build-")),
    root = join(dir, "public");
  mkdirSync(root);
  writeFileSync(
    join(root, "index.html"),
    '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>',
  );
  const store = new Store(join(dir, "data")),
    app = await createApp(store, root);
  try {
    expect((await app.inject("/api/build")).statusCode).toBe(401);
    const read = () =>
      app.inject({
        url: "/api/build",
        headers: { authorization: `Bearer ${store.token}` },
      });
    expect((await read()).json()).toEqual({
      module: "/assets/index-AbC123.js",
    });
    writeFileSync(
      join(root, "index.html"),
      '<script src="/Users/private/a.js"></script>',
    );
    expect((await read()).json()).toEqual({ module: null });
    rmSync(join(root, "index.html"));
    expect((await read()).json()).toEqual({ module: null });
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
