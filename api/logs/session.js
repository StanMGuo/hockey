// src/auth/gate.ts
var APP_PASSWORD = "hawksu9red";

// src/auth/logAccess.ts
var LOG_COOKIE = "hdt_log";
var WEEK_SECONDS = 7 * 24 * 60 * 60;
function bytes(value) {
  return new Uint8Array(new TextEncoder().encode(value));
}
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value)));
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
async function passwordOk(submitted, adminPassword) {
  if (!adminPassword) return false;
  const same = timingEqual(await sha256(submitted), await sha256(adminPassword));
  if (submitted === APP_PASSWORD) return false;
  return same;
}
async function signCookie(adminPassword, now) {
  const exp = Math.floor(now.getTime() / 1e3) + WEEK_SECONDS;
  const mac = await hmacHex(adminPassword, String(exp));
  return `${exp}.${mac}`;
}
function cookieHeader(value, secure) {
  const base = `${LOG_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${WEEK_SECONDS}`;
  return secure ? `${base}; Secure` : base;
}

// src/visit/decide.ts
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

// src/server/fileStore.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// src/server/store.ts
var TEN_MINUTES_MS = 10 * 60 * 1e3;
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1e3;

// src/server/memoryStore.ts
function createMemoryStore(hooks) {
  const loaded = revive(hooks?.load?.() ?? null);
  const sessions = loaded.sessions;
  const hits = loaded.hits;
  const save = () => hooks?.save?.({ sessions, hits });
  return {
    async ingest(input) {
      const ip = input.place.ip ?? "";
      const windowStart = input.at.getTime() - TEN_MINUTES_MS;
      const recent = hits.filter((hit) => hit.ip === ip && hit.at.getTime() >= windowStart);
      if (rateLimited(recent.length)) return "limited";
      hits.push({ ip, at: input.at });
      const cutoff = input.at.getTime() - NINETY_DAYS_MS;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].lastSeenAt.getTime() < cutoff) sessions.splice(i, 1);
      }
      for (let i = hits.length - 1; i >= 0; i--) {
        if (hits[i].at.getTime() < windowStart) hits.splice(i, 1);
      }
      applyIngest(sessions, input);
      save();
      return "ok";
    },
    async listRecent(limit) {
      return sessions.slice().sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit).map((session) => ({
        ...session,
        spans: session.spans.slice().sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()).map((span) => ({ ...span }))
      }));
    }
  };
}
function revive(raw) {
  if (!raw || typeof raw !== "object") return { sessions: [], hits: [] };
  const data = raw;
  return {
    sessions: (data.sessions ?? []).map((session) => ({
      ...session,
      startedAt: new Date(session.startedAt),
      lastSeenAt: new Date(session.lastSeenAt),
      spans: (session.spans ?? []).map((span) => ({
        ...span,
        startedAt: new Date(span.startedAt),
        lastSeenAt: new Date(span.lastSeenAt)
      }))
    })),
    hits: (data.hits ?? []).map((hit) => ({ ip: hit.ip, at: new Date(hit.at) }))
  };
}
function applyIngest(sessions, input) {
  let session = sessions.find((item) => item.id === input.body.sessionId);
  if (!session) {
    session = {
      id: input.body.sessionId,
      visitorId: input.body.visitorId,
      startedAt: input.at,
      lastSeenAt: input.at,
      ip: input.place.ip,
      country: input.place.country,
      region: input.place.region,
      city: input.place.city,
      userAgent: input.place.userAgent,
      spans: []
    };
    sessions.push(session);
  } else {
    session.lastSeenAt = input.at;
  }
  const identity = {
    screen: input.body.screen,
    mode: input.body.mode,
    scenarioId: input.body.scenarioId,
    sheet: input.body.sheet
  };
  const latest = session.spans[session.spans.length - 1] ?? null;
  if (decideSpan(latest, identity) === "extend" && latest) {
    latest.lastSeenAt = input.at;
    return;
  }
  session.spans.push({ ...identity, startedAt: input.at, lastSeenAt: input.at });
}

// src/server/fileStore.ts
function createFileStore(filePath) {
  return createMemoryStore({
    load: () => readSnapshot(filePath),
    save: (snapshot) => writeSnapshot(filePath, snapshot)
  });
}
function readSnapshot(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
function writeSnapshot(filePath, snapshot) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(snapshot));
}
var shared = null;
function localFileStore() {
  shared ??= createFileStore(".data/visits.json");
  return shared;
}

// src/server/visitsStore.ts
import { neon } from "@neondatabase/serverless";
function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(String(value));
}
function asText(value) {
  if (value == null) return null;
  return String(value);
}
function createNeonStore(databaseUrl) {
  let ready = null;
  const sql = () => neon(databaseUrl);
  async function ensure() {
    if (!ready) {
      ready = (async () => {
        const q = sql();
        await q`CREATE TABLE IF NOT EXISTS visit_sessions (
          id text PRIMARY KEY,
          visitor_id text NOT NULL,
          started_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          ip text,
          country text,
          region text,
          city text,
          user_agent text
        )`;
        await q`CREATE TABLE IF NOT EXISTS visit_spans (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          session_id text NOT NULL,
          screen text NOT NULL,
          mode text,
          scenario_id text,
          sheet text,
          started_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL
        )`;
        await q`CREATE TABLE IF NOT EXISTS visit_ingest (
          ip text,
          at timestamptz NOT NULL
        )`;
        await q`CREATE INDEX IF NOT EXISTS visit_ingest_ip_at ON visit_ingest (ip, at)`;
      })().catch((err) => {
        ready = null;
        throw err;
      });
    }
    await ready;
  }
  return {
    async ingest(input) {
      const q = sql();
      await ensure();
      const ip = input.place.ip ?? "";
      const windowStart = new Date(input.at.getTime() - TEN_MINUTES_MS);
      const counted = await q`SELECT count(*)::int AS n FROM visit_ingest WHERE ip = ${ip} AND at >= ${windowStart}`;
      const count = Number(counted[0]?.n ?? 0);
      if (rateLimited(count)) return "limited";
      await q`INSERT INTO visit_ingest (ip, at) VALUES (${ip}, ${input.at})`;
      const existing = await q`SELECT id FROM visit_sessions WHERE id = ${input.body.sessionId} LIMIT 1`;
      if (existing.length === 0) {
        await q`INSERT INTO visit_sessions (
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
        await q`UPDATE visit_sessions SET last_seen_at = ${input.at} WHERE id = ${input.body.sessionId}`;
      }
      const latestRows = await q`SELECT id, screen, mode, scenario_id, sheet
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
        await q`UPDATE visit_spans SET last_seen_at = ${input.at} WHERE id = ${latest.id}`;
      } else {
        await q`INSERT INTO visit_spans (session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at)
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
      await q`DELETE FROM visit_spans WHERE session_id IN (
        SELECT id FROM visit_sessions WHERE last_seen_at < ${cutoff}
      )`;
      await q`DELETE FROM visit_sessions WHERE last_seen_at < ${cutoff}`;
      await q`DELETE FROM visit_ingest WHERE at < ${windowStart}`;
      return "ok";
    },
    async listRecent(limit) {
      const q = sql();
      await ensure();
      const sessionRows = await q`SELECT id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        FROM visit_sessions ORDER BY started_at DESC LIMIT ${limit}`;
      const ids = sessionRows.map((row) => String(row.id));
      if (ids.length === 0) return [];
      const spanRows = await q`SELECT session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at
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
function empty(status, headers) {
  return new Response(null, { status, headers });
}
async function handleLogSession(request, deps) {
  if (request.method !== "POST") return empty(405);
  if (!deps.adminPassword) return empty(503);
  let json;
  try {
    json = await request.json();
  } catch {
    return empty(400);
  }
  const password = json && typeof json === "object" ? json.password : void 0;
  if (typeof password !== "string") return empty(400);
  if (!await passwordOk(password, deps.adminPassword)) return empty(401);
  const token = await signCookie(deps.adminPassword, deps.now());
  const headers = new Headers();
  headers.set("set-cookie", cookieHeader(token, deps.secure));
  return empty(204, headers);
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
  const configured = process.env.DATABASE_URL?.trim() || null;
  const local = !configured && !process.env.VERCEL;
  return {
    store: configured ? createNeonStore(configured) : local ? localFileStore() : noopStore,
    now: () => /* @__PURE__ */ new Date(),
    databaseUrl: configured ?? (local ? "file://.data/visits.json" : null),
    adminPassword: process.env.LOG_ADMIN_PASSWORD,
    secure: process.env.VERCEL === "1" || request.headers.get("x-forwarded-proto") === "https"
  };
}

// src/server/entries/session.ts
function POST(request) {
  return handleLogSession(request, productionDeps(request));
}
export {
  POST
};
