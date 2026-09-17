import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
it("protects private reads and writes; issues a local cookie and handles valid commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "career-flow-api-")),
    store = new Store(dir),
    app = await createApp(store);
  try {
    expect((await app.inject("/api/snapshot")).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/api/session",
          headers: { host: "malicious.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/session",
          headers: { origin: "https://malicious.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/session",
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).statusCode,
    ).toBe(403);
    const res = await app.inject("/api/session");
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies[0];
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    const headers = { authorization: `Bearer ${store.token}` };
    expect(
      (await app.inject({ url: "/api/snapshot", headers })).json().applications,
    ).toEqual([]);
    const ok = await app.inject({
      method: "POST",
      url: "/api/commands",
      headers,
      payload: {
        id: "cmd",
        expectedRevision: 0,
        action: "theme",
        payload: { theme: "nyc" },
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/commands",
          headers,
          payload: { id: "bad", expectedRevision: 0, action: "reset" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ url: "/api/evidence/not-found/file", headers }))
        .statusCode,
    ).toBe(404);
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
