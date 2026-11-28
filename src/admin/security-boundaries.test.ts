import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import express from "express";
import { AdminLoginRateLimiter } from "./login-rate-limit.js";
import { AdminService } from "./admin-service.js";
import { AdminSessionStore } from "./admin-session.js";
import { createAdminRouter } from "./admin-router.js";
import { WebSpeakDatabase } from "../persistence/database.js";
import { createWebServer } from "../server/server.js";
import { JoinTicketStore } from "../server/join-ticket.js";
import { adminResponses } from "../shared/admin-responses.js";
import type { Logger } from "../logger.js";

const logger: Logger = { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; };

test("login reservations bound pending work, count only failures and preserve other lockouts", () => {
  const limiter = new AdminLoginRateLimiter(2, 8);
  const reserved = Array.from({ length: 5 }, () => limiter.reserve("a", 0));
  assert.ok(reserved.every(value => value.allowed));
  assert.equal(limiter.reserve("a", 0).allowed, false);
  for (const item of reserved) if (item.allowed) item.finish("failure");
  const b = limiter.reserve("b", 0); assert.ok(b.allowed); b.finish("failure");
  assert.equal(limiter.reserve("c", 0).allowed, false, "new IPs cannot evict an existing lockout");
  assert.equal(limiter.reserve("a", 0).allowed, false);
  assert.equal(limiter.reserve("a", 300_001).allowed, true);
  const successes = new AdminLoginRateLimiter(1);
  for (let i = 0; i < 20; i++) { const item = successes.reserve("a", 0); assert.ok(item.allowed); item.finish("success"); }
  const cap = new AdminLoginRateLimiter(10, 2);
  const first = cap.reserve("a", 0), second = cap.reserve("b", 0);
  assert.ok(first.allowed && second.allowed);
  assert.equal(cap.reserve("c", 0).allowed, false, "different IPs share the hash concurrency ceiling");
  first.finish("cancelled"); first.finish("cancelled");
  const third = cap.reserve("c", 0); assert.ok(third.allowed);
  assert.equal(cap.reserve("d", 0).allowed, false, "finishing twice cannot release another request's slot");
  second.finish("success"); third.finish("success");
});

test("a pending check cannot expire out of the reservation count", () => {
  const limiter = new AdminLoginRateLimiter(1);
  const checks = Array.from({ length: 5 }, () => limiter.reserve("a", 0));
  assert.ok(checks.every(item => item.allowed));
  assert.equal(limiter.reserve("a", 400_000).allowed, false);
  for (const item of checks) if (item.allowed) item.finish("cancelled");
  assert.equal(limiter.reserve("b", 400_000).allowed, true);
});

test("a successful concurrent login cannot erase another request's reservation", () => {
  const limiter = new AdminLoginRateLimiter(1);
  const slow = limiter.reserve("a", 0), success = limiter.reserve("a", 0);
  assert.ok(slow.allowed && success.allowed);
  success.finish("success");
  const additional = Array.from({ length: 4 }, () => limiter.reserve("a", 0));
  assert.ok(additional.every(item => item.allowed));
  assert.equal(limiter.reserve("a", 0).allowed, false);
  slow.finish("failure");
  assert.equal(limiter.reserve("a", 0).allowed, false);
});

async function availablePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

for (const trusted of [true, false]) test(`HTTP login and join limits ${trusted ? "separate trusted proxy clients" : "ignore spoofed headers from an untrusted peer"}`, async t => {
  let checks = 0;
  const gate = deferred();
  const service = { credentialRevision: 0, isInitialized: () => true,
    verifyPassword: async () => { checks++; await gate.promise; return false; },
    database: { addAudit() {} },
    getConnectionPolicy: () => ({ accessMode: "fixed", defaultTarget: "8.8.8.8#9987", serverPassword: "" }),
    isPasswordChangeRequired: () => false,
  } as unknown as AdminService;
  const port = await availablePort(), origin = `http://127.0.0.1:${port}`;
  const gateway = createWebServer({ port, logger, adminService: service, voiceBridgeOptions: {
    joinTickets: new JoinTicketStore(), trustedProxies: trusted ? ["127.0.0.1", "::1"] : ["192.0.2.1"],
  } });
  await gateway.start();
  t.after(async () => { gate.resolve(); await gateway.stop(); });
  const post = (route: string, client: string, body: unknown) => fetch(origin + route, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": client }, body: JSON.stringify(body),
  });
  const a = "203.0.113.9", b = "198.51.100.4";
  const logins = Array.from({ length: 12 }, () => post("/api/admin/login", a, { username: "admin", password: "bad" }));
  const results = Promise.all(logins);
  gate.resolve();
  const responses = await results;
  const statuses = responses.map(r => r.status);
  assert.equal(checks, 5);
  assert.equal(statuses.filter(s => s === 401).length, 5);
  assert.equal(statuses.filter(s => s === 429).length, 7);
  assert.ok(Number(responses.find(r => r.status === 429)!.headers.get("retry-after")) > 0);
  assert.equal((await post("/api/admin/login", b, { username: "admin", password: "bad" })).status, trusted ? 401 : 429);
  for (let i = 0; i < 30; i++) assert.equal((await post("/api/join-ticket", a, { nickname: "Test" })).status, 201);
  assert.equal((await post("/api/join-ticket", a, { nickname: "Test" })).status, 429);
  assert.equal((await post("/api/join-ticket", b, { nickname: "Test" })).status, trusted ? 201 : 429);
});

test("password-verifier exceptions release reservations without leaking their details", async t => {
  const app = express(); app.use(express.json());
  const service = { credentialRevision: 0, isInitialized: () => true,
    verifyPassword: async () => { throw new Error("secret verifier failure detail"); },
  } as unknown as AdminService;
  app.use("/api/admin", createAdminRouter({ service, sessions: new AdminSessionStore(), logger,
    getActiveSessions: () => 0, getPeakSessions: () => 0, startedAt: Date.now() }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  for (let i = 0; i < 10; i++) {
    const response = await fetch(origin + "/api/admin/login", { method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "irrelevant" }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, code: "INTERNAL_ERROR" });
  }
});

async function adminFixture(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "webspeak-auth-race-"));
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 3), logger, path.join(directory, "absent.json"));
  await service.initialize(); // Intentionally keep the default password for the bootstrap race.
  const app = express(); app.use(express.json());
  app.use("/api/admin", createAdminRouter({ service, sessions: new AdminSessionStore(), logger,
    getActiveSessions: () => 0, getPeakSessions: () => 0, startedAt: Date.now() }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); database.close(); await rm(directory, { recursive: true }); });
  const post = (route: string, body: unknown, cookie = "", csrf = "") => fetch(origin + "/api/admin" + route, {
    method: "POST", headers: { origin, cookie, "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(body),
  });
  const login = async (password: string) => {
    const response = await post("/login", { username: "admin", password });
    assert.equal(response.status, 200);
    const body = await response.json() as { csrfToken: string };
    return { cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!, csrf: body.csrfToken };
  };
  const authenticated = async (cookie: string) => (await (await fetch(origin + "/api/admin/session", { headers: { cookie } })).json() as { authenticated: boolean }).authenticated;
  return { service, database, origin, post, login, authenticated };
}

test("update compatibility reports only local status and denies both actions after authorization", { timeout: 15_000 }, async t => {
  const previousMode = process.env.WEBSPEAK_DEPLOYMENT_MODE;
  process.env.WEBSPEAK_DEPLOYMENT_MODE = "release-package";
  t.after(() => {
    if (previousMode === undefined) delete process.env.WEBSPEAK_DEPLOYMENT_MODE;
    else process.env.WEBSPEAK_DEPLOYMENT_MODE = previousMode;
  });
  const f = await adminFixture(t);
  const request = fetch;
  const status = (cookie?: string) => request(f.origin + "/api/admin/update", { headers: cookie ? { cookie } : {} });
  const candidate = { version: "0.3.4", confirmVersion: "0.3.4" };
  const paths = ["/update/check", "/update/apply"];
  const post = (route: string, cookie?: string, csrf?: string, origin = f.origin) =>
    request(f.origin + "/api/admin" + route, {
      method: "POST",
      headers: { cookie: cookie ?? "", "x-csrf-token": csrf ?? "", origin, "content-type": "application/json" },
      body: JSON.stringify(candidate),
    });
  async function checkError(result: Promise<Response>, code: string, statusCode: number) {
    const response = await result;
    assert.equal(response.status, statusCode);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, code });
  }

  await checkError(status(), "AUTH_REQUIRED", 401);
  const firstLogin = await f.login("admin");
  await checkError(status(firstLogin.cookie), "PASSWORD_CHANGE_REQUIRED", 403);
  await checkError(post("/update/apply", firstLogin.cookie, firstLogin.csrf), "PASSWORD_CHANGE_REQUIRED", 403);
  const changed = await f.post("/change-password", { newPassword: "update-fixture-password" }, firstLogin.cookie, firstLogin.csrf);
  assert.equal(changed.status, 200);
  const { cookie, csrf } = await f.login("update-fixture-password");
  const audit = f.database.recentAudit(50);

  const remoteRequests = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected updater request"); });
  const response = await status(cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const update = adminResponses.updateStatus(await response.json());
  const diagnostics = await request(f.origin + "/api/admin/diagnostics", { headers: { cookie } });
  assert.equal(update.currentVersion, adminResponses.diagnostics(await diagnostics.json()).gateway.version);
  assert.equal(update.deployment.platform, process.platform);
  assert.equal(update.deployment.architecture, process.arch);
  assert.equal(update.deployment.applyAllowed, false);
  assert.equal(update.deployment.reasonCode, "UPDATE_UNAVAILABLE");
  assert.equal(update.task, null);

  process.env.WEBSPEAK_DEPLOYMENT_MODE = "docker";
  const container = adminResponses.updateStatus(await (await status(cookie)).json());
  assert.equal(container.deployment.mode, "docker");
  assert.equal(container.deployment.upgradePath, "docker-compose");
  assert.equal(container.deployment.applyAllowed, false);
  process.env.WEBSPEAK_DEPLOYMENT_MODE = "release-package";

  for (const route of paths) {
    await checkError(post(route), "AUTH_REQUIRED", 401);
    await checkError(post(route, cookie, csrf, "https://example.invalid"), "ORIGIN_REJECTED", 403);
    await checkError(post(route, cookie), "CSRF_REJECTED", 403);
    await checkError(post(route, cookie, csrf), "UPDATE_UNAVAILABLE", 503);
  }
  assert.equal(remoteRequests.mock.callCount(), 0);
  assert.deepEqual(f.database.recentAudit(50), audit);
});

test("password rotation revokes other default-password sessions and a login finishing after rotation", { timeout: 15_000 }, async t => {
  const f = await adminFixture(t);
  const current = await f.login("admin"), other = await f.login("admin");
  const verified = deferred(), release = deferred();
  const verify = f.service.verifyPassword.bind(f.service);
  t.mock.method(f.service, "verifyPassword", async (username: string, password: string) => {
    const result = await verify(username, password);
    if (password === "admin") { verified.resolve(); await release.promise; }
    return result;
  });
  const pending = f.post("/login", { username: "admin", password: "admin" });
  await verified.promise;
  try {
    const changed = await f.post("/change-password", { newPassword: "new-password-for-test" }, current.cookie, current.csrf);
    assert.equal(changed.status, 200);
    assert.equal(await f.authenticated(current.cookie), true);
    assert.equal(await f.authenticated(other.cookie), false);
  } finally { release.resolve(); }
  const stale = await pending;
  assert.equal(stale.status, 401);
  assert.equal(stale.headers.get("set-cookie"), null, "an old verification cannot mint a new session");
  await f.login("new-password-for-test");
});

test("failed password updates keep other sessions and concurrent rotations cannot overwrite a winner", { timeout: 15_000 }, async t => {
  const f = await adminFixture(t);
  const current = await f.login("admin"), other = await f.login("admin");
  assert.equal((await f.post("/change-password", { newPassword: "short" }, current.cookie, current.csrf)).status, 400);
  assert.equal(await f.authenticated(other.cookie), true);
  const results = await Promise.all([
    f.post("/change-password", { newPassword: "first-possible-password" }, current.cookie, current.csrf),
    f.post("/change-password", { newPassword: "second-possible-password" }, other.cookie, other.csrf),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const winner = results[0]!.status === 200 ? current : other;
  const loser = winner === current ? other : current;
  assert.equal(await f.authenticated(winner.cookie), true);
  assert.equal(await f.authenticated(loser.cookie), false);
});
