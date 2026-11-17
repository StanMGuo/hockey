// src/state/progress.ts
function defaultProg() {
  return {
    passes: { 1: 0, 2: 0, 3: 0 },
    completed: 0,
    learnIdx: 0,
    game: {},
    unlockAll: false,
    sound: true,
    seenHow: false
  };
}
function normalizeProgress(raw) {
  const d = defaultProg();
  if (!raw || typeof raw !== "object") return d;
  const o = raw;
  return {
    passes: { 1: o.passes?.[1] || 0, 2: o.passes?.[2] || 0, 3: o.passes?.[3] || 0 },
    completed: typeof o.completed === "number" ? o.completed : 0,
    learnIdx: typeof o.learnIdx === "number" ? o.learnIdx : 0,
    game: o.game && typeof o.game === "object" ? o.game : {},
    unlockAll: !!o.unlockAll,
    sound: o.sound !== false,
    seenHow: !!o.seenHow
  };
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

// src/server/profileStore.ts
var ProfileExistsError = class extends Error {
};
function isUnique(err) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}
function mapRow(row) {
  return {
    id: String(row.id),
    nameKey: String(row.name_key),
    displayName: String(row.display_name),
    jersey: Number(row.jersey),
    pinHash: String(row.pin_hash),
    progress: normalizeProgress(row.progress)
  };
}
function createProfileStore(databaseUrl) {
  const sql = createSql(databaseUrl);
  return {
    async findByIdentity(nameKey, jersey) {
      const rows = await sql`select id, name_key, display_name, jersey, pin_hash, progress
        from profiles where name_key = ${nameKey} and jersey = ${jersey} limit 1`;
      return rows[0] ? mapRow(rows[0]) : null;
    },
    async insert(row) {
      try {
        const progress = JSON.stringify(row.progress);
        const rows = await sql`insert into profiles (name_key, display_name, jersey, pin_hash, progress)
          values (${row.nameKey}, ${row.displayName}, ${row.jersey}, ${row.pinHash}, ${progress}::jsonb)
          returning id, name_key, display_name, jersey, pin_hash, progress`;
        return mapRow(rows[0]);
      } catch (err) {
        if (isUnique(err)) throw new ProfileExistsError();
        throw err;
      }
    },
    async createSession(profileId, token, expiresAt) {
      await sql`insert into sessions (token, profile_id, expires_at) values (${token}, ${profileId}, ${expiresAt})`;
    },
    async findSession(token, now) {
      const rows = await sql`select profile_id from sessions where token = ${token} and expires_at > ${now} limit 1`;
      const row = rows[0];
      return row ? { profileId: String(row.profile_id) } : null;
    },
    async saveProgress(profileId, progress) {
      const payload = JSON.stringify(progress);
      const rows = await sql`update profiles set progress = ${payload}::jsonb where id = ${profileId} returning progress`;
      if (!rows[0]) throw new Error("missing profile");
      return normalizeProgress(rows[0].progress);
    },
    async deleteSession(token) {
      await sql`delete from sessions where token = ${token}`;
    }
  };
}

// src/server/profiles.ts
var TEN_MINUTES_MS = 10 * 60 * 1e3;
var SESSION_MS = 12 * 60 * 60 * 1e3;
var MAX_BODY = 16 * 1024;
function json(status, body) {
  return Response.json(body, { status });
}
function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return "too-big";
  try {
    return JSON.parse(text);
  } catch {
    return "bad";
  }
}
function bearer(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}
async function handleSave(request, deps) {
  if (request.method !== "PUT") return new Response(null, { status: 405 });
  if (!deps.configured) return json(503, { error: "offline" });
  const token = bearer(request);
  if (!token) return json(401, { error: "session" });
  const body = await readJson(request);
  if (body === "too-big" || body === "bad" || !body || typeof body !== "object") return json(400, { error: "invalid" });
  try {
    const session = await deps.repo.findSession(token, deps.now());
    if (!session) return json(401, { error: "session" });
    const progress = await deps.repo.saveProgress(session.profileId, normalizeProgress(body));
    return json(200, { progress });
  } catch (err) {
    console.error(redactDatabaseError(err));
    return json(503, { error: "offline" });
  }
}
function productionProfileDeps(request) {
  const raw = process.env.DATABASE_URL;
  const verdict = classifyDatabaseUrl(raw);
  if (verdict === "rejected") noteRejectedDatabaseUrl();
  const configured = verdict === "ok";
  return {
    repo: configured && raw ? createProfileStore(raw.trim()) : unavailableRepo,
    now: () => /* @__PURE__ */ new Date(),
    teamPassword: process.env.TEAM_PASSWORD,
    ip: clientIp(request),
    configured
  };
}
var unavailableRepo = {
  async findByIdentity() {
    return null;
  },
  async insert() {
    throw new Error("database unavailable");
  },
  async createSession() {
  },
  async findSession() {
    return null;
  },
  async saveProgress() {
    return defaultProg();
  },
  async deleteSession() {
  }
};

// src/server/entries/progress.ts
function PUT(request) {
  return handleSave(request, productionProfileDeps(request));
}
export {
  PUT
};
