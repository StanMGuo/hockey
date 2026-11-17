// src/auth/logAccess.ts
var LOG_COOKIE = "hdt_log";
var WEEK_SECONDS = 7 * 24 * 60 * 60;
function bytes(value) {
  return new Uint8Array(new TextEncoder().encode(value));
}
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, bytes(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
function timingEqualText(a, b) {
  return timingEqual(bytes(a), bytes(b));
}
async function verifyCookie(token, adminPassword, now) {
  if (!token || !adminPassword) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expText = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1e3 <= now.getTime()) return false;
  const expected = await hmacHex(adminPassword, expText);
  return timingEqualText(expected, mac);
}
function readCookie(header, name = LOG_COOKIE) {
  if (!header) return void 0;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return void 0;
}

// src/visit/types.ts
var SCREENS = ["gate", "home", "play", "sheet"];
var VISIT_MODES = ["learn", "help", "test", "game"];
var SHEETS = ["how", "settings", "practice-pick", "game-pick", "other"];
var KINDS = ["beat", "end"];

// src/visit/decide.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return UUID.test(value);
}
function durationMs(started, last) {
  const delta = last.getTime() - started.getTime();
  return delta < 0 ? 0 : delta;
}
function sameSpan(a, b) {
  return a.screen === b.screen && a.mode === b.mode && a.scenarioId === b.scenarioId && a.sheet === b.sheet;
}
function decideSpan(current, next) {
  if (!current) return "open";
  return sameSpan(current, next) ? "extend" : "open";
}
function rateLimited(count) {
  return count >= 30;
}
function isScreen(value) {
  return typeof value === "string" && SCREENS.includes(value);
}
function isKind(value) {
  return typeof value === "string" && KINDS.includes(value);
}
function isMode(value) {
  return value === null || typeof value === "string" && VISIT_MODES.includes(value);
}
function isSheet(value) {
  return value === null || typeof value === "string" && SHEETS.includes(value);
}
function isScenario(value) {
  if (value === null) return true;
  return typeof value === "string" && value.length > 0;
}
function validateBody(input) {
  if (!input || typeof input !== "object") return null;
  const raw = input;
  const { visitorId, sessionId, kind, screen, mode, scenarioId, sheet } = raw;
  if (typeof visitorId !== "string" || !isUuid(visitorId)) return null;
  if (typeof sessionId !== "string" || !isUuid(sessionId)) return null;
  if (!isKind(kind) || !isScreen(screen) || !isMode(mode) || !isScenario(scenarioId) || !isSheet(sheet)) return null;
  return { visitorId, sessionId, kind, screen, mode, scenarioId, sheet };
}

// src/logs/format.ts
function formatDevice(userAgent) {
  const agent = userAgent ?? "";
  if (/Windows/i.test(agent)) return "Windows";
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return "Android";
  if (/Mac OS X|Macintosh/i.test(agent)) return "Mac";
  if (/CrOS/i.test(agent)) return "ChromeOS";
  if (/Linux/i.test(agent)) return "Linux";
  return "\u672A\u77E5";
}

// src/server/db.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
loadLocalDatabaseUrl();
var PROJECT_REF = "lxwyjdlepsntcosczors";
var rejectedNoted = false;
function classifyDatabaseUrl(value) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "missing";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return "rejected";
  }
  const user = decodeURIComponent(url.username);
  const role = user.split(".")[0] ?? "";
  const protocolOk = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const userOk = user.startsWith("hockey_app") && role === "hockey_app";
  const portOk = url.port === "6543";
  const sslOk = url.searchParams.get("sslmode") !== "disable";
  const refOk = user.includes(PROJECT_REF) || url.hostname.includes(PROJECT_REF);
  if (protocolOk && userOk && portOk && sslOk && refOk) return "ok";
  return "rejected";
}
function noteRejectedDatabaseUrl() {
  if (rejectedNoted) return;
  rejectedNoted = true;
  console.error("DATABASE_URL rejected");
}
function createSql(url) {
  let client = null;
  return (strings, ...values) => {
    client ??= postgres(url, { max: 1, prepare: false, ssl: "require" });
    return client(strings, ...values);
  };
}
function redactDatabaseError(err) {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return err;
  const pieces = secretPieces(raw);
  const scrub = (text) => pieces.reduce((out, piece) => out.split(piece).join("[redacted]"), text);
  if (typeof err === "string") return scrub(err);
  if (err instanceof Error) {
    const redacted = new Error(scrub(err.message));
    redacted.name = err.name;
    if (err.stack) redacted.stack = scrub(err.stack);
    return redacted;
  }
  return err;
}
function loadLocalDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return;
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    if (key !== "DATABASE_URL" || process.env[key]?.trim()) continue;
    process.env[key] = trimmed.slice(eq + 1);
  }
}
function secretPieces(url) {
  const pieces = /* @__PURE__ */ new Set([url]);
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      pieces.add(parsed.password);
      pieces.add(encodeURIComponent(parsed.password));
    }
  } catch {
    return [url];
  }
  return [...pieces].filter((piece) => piece.length > 0);
}

// src/server/store.ts
var TEN_MINUTES_MS = 10 * 60 * 1e3;
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1e3;

// src/server/visitsStore.ts
function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(String(value));
}
function asText(value) {
  if (value == null) return null;
  return String(value);
}
function createVisitStore(databaseUrl) {
  const sql = createSql(databaseUrl);
  return {
    async ingest(input) {
      const ip = input.place.ip ?? "";
      const windowStart = new Date(input.at.getTime() - TEN_MINUTES_MS);
      const counted = await sql`SELECT count(*)::int AS n FROM visit_ingest WHERE ip = ${ip} AND at >= ${windowStart}`;
      const count = Number(counted[0]?.n ?? 0);
      if (rateLimited(count)) return "limited";
      await sql`INSERT INTO visit_ingest (ip, at) VALUES (${ip}, ${input.at})`;
      const existing = await sql`SELECT id FROM visit_sessions WHERE id = ${input.body.sessionId} LIMIT 1`;
      if (existing.length === 0) {
        await sql`INSERT INTO visit_sessions (
          id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        ) VALUES (
          ${input.body.sessionId},
          ${input.body.visitorId},
          ${input.at},
          ${input.at},
          ${input.place.ip},
          ${input.place.country},
          ${input.place.region},
          ${input.place.city},
          ${input.place.userAgent}
        )`;
      } else {
        await sql`UPDATE visit_sessions SET last_seen_at = ${input.at} WHERE id = ${input.body.sessionId}`;
      }
      const latestRows = await sql`SELECT id, screen, mode, scenario_id, sheet
        FROM visit_spans WHERE session_id = ${input.body.sessionId}
        ORDER BY started_at DESC, id DESC LIMIT 1`;
      const latest = latestRows[0];
      const identity = {
        screen: input.body.screen,
        mode: input.body.mode,
        scenarioId: input.body.scenarioId,
        sheet: input.body.sheet
      };
      const current = latest ? {
        screen: latest.screen,
        mode: latest.mode,
        scenarioId: latest.scenario_id,
        sheet: latest.sheet
      } : null;
      if (decideSpan(current, identity) === "extend" && latest) {
        await sql`UPDATE visit_spans SET last_seen_at = ${input.at} WHERE id = ${latest.id}`;
      } else {
        await sql`INSERT INTO visit_spans (session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at)
          VALUES (
            ${input.body.sessionId},
            ${identity.screen},
            ${identity.mode},
            ${identity.scenarioId},
            ${identity.sheet},
            ${input.at},
            ${input.at}
          )`;
      }
      const cutoff = new Date(input.at.getTime() - NINETY_DAYS_MS);
      await sql`DELETE FROM visit_spans WHERE session_id IN (
        SELECT id FROM visit_sessions WHERE last_seen_at < ${cutoff}
      )`;
      await sql`DELETE FROM visit_sessions WHERE last_seen_at < ${cutoff}`;
      await sql`DELETE FROM visit_ingest WHERE at < ${windowStart}`;
      return "ok";
    },
    async listRecent(limit) {
      const sessionRows = await sql`SELECT id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        FROM visit_sessions ORDER BY started_at DESC LIMIT ${limit}`;
      const ids = sessionRows.map((row) => String(row.id));
      if (ids.length === 0) return [];
      const spanRows = await sql`SELECT session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at
        FROM visit_spans WHERE session_id = ANY(${ids})
        ORDER BY started_at ASC, id ASC`;
      const bySession = /* @__PURE__ */ new Map();
      for (const row of spanRows) {
        const raw = row;
        const sessionId = String(raw.session_id);
        const list = bySession.get(sessionId) ?? [];
        list.push({
          screen: raw.screen,
          mode: raw.mode,
          scenarioId: raw.scenario_id,
          sheet: raw.sheet,
          startedAt: asDate(raw.started_at),
          lastSeenAt: asDate(raw.last_seen_at)
        });
        bySession.set(sessionId, list);
      }
      return sessionRows.map((row) => {
        const raw = row;
        const id = String(raw.id);
        const session = {
          id,
          visitorId: String(raw.visitor_id),
          startedAt: asDate(raw.started_at),
          lastSeenAt: asDate(raw.last_seen_at),
          ip: asText(raw.ip),
          country: asText(raw.country),
          region: asText(raw.region),
          city: asText(raw.city),
          userAgent: asText(raw.user_agent),
          spans: bySession.get(id) ?? []
        };
        return session;
      });
    }
  };
}

// src/server/http.ts
var MAX_BODY = 2048;
function empty(status, headers) {
  return new Response(null, { status, headers });
}
function headerText(request, name) {
  const value = request.headers.get(name);
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded ? decoded : null;
  } catch {
    return null;
  }
}
function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}
function placeFrom(request) {
  const agent = request.headers.get("user-agent");
  return {
    ip: clientIp(request),
    country: headerText(request, "x-vercel-ip-country"),
    region: headerText(request, "x-vercel-ip-country-region"),
    city: headerText(request, "x-vercel-ip-city"),
    userAgent: agent ? agent.slice(0, 200) : null
  };
}
function toSessionView(session) {
  return {
    visitorId: session.visitorId,
    startedAt: session.startedAt.toISOString(),
    durationMs: durationMs(session.startedAt, session.lastSeenAt),
    ip: session.ip,
    country: session.country,
    region: session.region,
    city: session.city,
    device: formatDevice(session.userAgent),
    spans: session.spans.map((span) => ({
      screen: span.screen,
      mode: span.mode,
      scenarioId: span.scenarioId,
      sheet: span.sheet,
      durationMs: durationMs(span.startedAt, span.lastSeenAt)
    }))
  };
}
async function handleVisits(request, deps) {
  if (request.method === "GET") return listVisits(request, deps);
  if (request.method === "POST") return ingestVisit(request, deps);
  return empty(405);
}
async function listVisits(request, deps) {
  const ok = await verifyCookie(readCookie(request.headers.get("cookie")), deps.adminPassword, deps.now());
  if (!ok) return empty(401);
  if (!deps.databaseUrl) return Response.json({ sessions: [], storage: "unconfigured" });
  try {
    const sessions = await deps.store.listRecent(100);
    return Response.json({ sessions: sessions.map(toSessionView) });
  } catch (err) {
    console.error(redactDatabaseError(err));
    return empty(500);
  }
}
async function ingestVisit(request, deps) {
  const text = await request.text();
  if (text.length > MAX_BODY) return empty(400);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return empty(400);
  }
  const body = validateBody(json);
  if (!body) return empty(400);
  if (!deps.databaseUrl) return empty(204);
  try {
    const result = await deps.store.ingest({ body, at: deps.now(), place: placeFrom(request) });
    if (result === "limited") return empty(429);
    return empty(204);
  } catch (err) {
    console.error(redactDatabaseError(err));
    return empty(204);
  }
}
var noopStore = {
  async ingest() {
    return "ok";
  },
  async listRecent() {
    return [];
  }
};
function productionDeps(request) {
  const raw = process.env.DATABASE_URL;
  const verdict = classifyDatabaseUrl(raw);
  if (verdict === "rejected") noteRejectedDatabaseUrl();
  const configured = verdict === "ok";
  return {
    store: configured ? createVisitStore(raw?.trim() ?? "") : noopStore,
    now: () => /* @__PURE__ */ new Date(),
    databaseUrl: configured ? "configured" : null,
    adminPassword: process.env.LOG_ADMIN_PASSWORD,
    secure: process.env.VERCEL === "1" || request.headers.get("x-forwarded-proto") === "https"
  };
}

// src/server/entries/visits.ts
function GET(request) {
  return handleVisits(request, productionDeps(request));
}
function POST(request) {
  return handleVisits(request, productionDeps(request));
}
export {
  GET,
  POST
};
