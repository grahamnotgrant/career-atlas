import { homeResolver } from "./home-location";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { Store } from "./store";
import { SourceWatcher } from "./source-watcher";
export async function createApp(store: Store, staticRoot = resolve("dist")) {
  const watcher = new SourceWatcher(store);
  const home = homeResolver(store);
  await home.refresh();
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  await app.register(cookie);
  app.addHook("onRequest", async (req, reply) => {
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return reply.code(403).send({ error: "Loopback host required." });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`)
      return reply.code(403).send({ error: "Cross-origin request denied." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return reply.code(403).send({ error: "Cross-site request denied." });
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (
      req.url.startsWith("/api/") &&
      req.url !== "/api/session" &&
      req.url !== "/api/health"
    ) {
      const provided =
        req.headers.authorization?.replace(/^Bearer /, "") ??
        req.cookies.career_session ??
        "";
      const a = Buffer.from(provided),
        b = Buffer.from(store.token);
      if (a.length !== b.length || !timingSafeEqual(a, b))
        return reply
          .code(401)
          .send({ error: "Open the app to establish a local session." });
    }
  });
  app.setErrorHandler((e, _req, reply) => {
    const status =
      e instanceof ZodError
        ? 400
        : ((e as { statusCode?: number }).statusCode ?? 500);
    reply.code(status).send({
      error:
        status === 500
          ? "The local operation failed. Your saved data remains on disk."
          : (e as Error).message,
    });
  });
  app.get("/api/health", () => ({ ok: true, version: "0.1.0" }));
  app.get("/api/session", async (_req, reply) => {
    reply.setCookie("career_session", store.token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    return { ok: true };
  });
  app.get("/api/snapshot", () => store.snapshot());
  app.post("/api/commands", (req) => store.command(req.body));
  app.post("/api/shutdown", async (_req, reply) => {
    reply.send({ stopping: true });
    setImmediate(() => {
      void app.close();
    });
  });
  app.get("/api/build", () => {
    try {
      const html = readFileSync(resolve(staticRoot, "index.html"), "utf8");
      const match = html.match(
        /<script\b[^>]*\bsrc=["'](\/assets\/[a-zA-Z0-9._-]+\.js)["']/,
      );
      return { module: match?.[1] ?? null };
    } catch {
      return { module: null };
    }
  });
  app.get("/api/career", () => store.career.snapshot());
  app.post("/api/career/commands", (req) => store.career.command(req.body));
  app.get<{ Params: { id: string } }>(
    "/api/evidence/:id/file",
    (req, reply) => {
      const a = store.artifact(req.params.id);
      return reply
        .type(a.mediaType)
        .header(
          "Content-Disposition",
          `inline; filename="${a.id}.${a.mediaType === "application/pdf" ? "pdf" : "txt"}"`,
        )
        .send(createReadStream(a.path));
    },
  );
  const streams = new Set<import("node:http").ServerResponse>();
  app.get("/api/events", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    const out = reply.raw;
    streams.add(out);
    out.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
    req.raw.on("close", () => streams.delete(out));
  });
  let stamp = "";
  let syncStamp = "";
  let ticks = 0;
  const timer = setInterval(() => {
    void home.refresh();
    if (!streams.size) return;
    const sync = store.meta("sync", "");
    if (sync && sync !== syncStamp) {
      syncStamp = sync;
      for (const stream of streams)
        stream.write(`event: sync\ndata: ${sync}\n\n`);
    }
    const next = `${store.meta("generation", "0")}:${store.getView().revision}:${store.meta("homeLocation", "")}:${store.career.revision()}`;
    if (next !== stamp) {
      stamp = next;
      const data = `event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`;
      for (const stream of streams) stream.write(data);
    } else if (++ticks % 15 === 0)
      for (const stream of streams) stream.write(": keepalive\n\n");
  }, 250);
  timer.unref();
  app.addHook("preClose", async () => {
    watcher.stop();
    home.stop();
    clearInterval(timer);
    for (const stream of streams) stream.end();
  });
  if (existsSync(staticRoot))
    await app.register(staticPlugin, { root: staticRoot });
  return app;
}
