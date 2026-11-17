// src/server/profiles.ts
import { randomBytes as randomBytes2 } from "node:crypto";

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

// src/server/identity.ts
var NAME = /^[\p{L}\p{N}]+(?:[ '\-][\p{L}\p{N}]+)*$/u;
function normalizeNickname(raw) {
  const display = raw.trim().replace(/\s+/g, " ");
  if (display.length < 1 || display.length > 20) return null;
  if (!NAME.test(display)) return null;
  return { display, key: display.toLocaleLowerCase() };
}
function normalizeJersey(raw) {
  const text = raw.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}
function normalizePin(raw) {
  return /^\d{4}$/.test(raw) ? raw : null;
}

// src/server/pin.ts
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function secretEqual(a, b) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
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
var FAIL_LIMIT = 5;
var teamFails = /* @__PURE__ */ new Map();
function recent(map, key, now) {
  const kept = (map.get(key) ?? []).filter((at) => now - at < TEN_MINUTES_MS);
  map.set(key, kept);
  return kept;
}
function blocked(map, key, now) {
  return recent(map, key, now).length >= FAIL_LIMIT;
}
function mark(map, key, now) {
  const list = recent(map, key, now);
  list.push(now);
  map.set(key, list);
}
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
function newToken() {
  return randomBytes2(32).toString("base64url");
}
function identityFrom(body) {
  if (!body || typeof body !== "object") return null;
  const o = body;
  if (typeof o.nickname !== "string" || typeof o.pin !== "string") return null;
  const jerseyText = typeof o.jersey === "number" ? String(o.jersey) : typeof o.jersey === "string" ? o.jersey : "";
  const name = normalizeNickname(o.nickname);
  const jersey = normalizeJersey(jerseyText);
  const pin = normalizePin(o.pin);
  if (!name || jersey == null || !pin) return null;
  return { display: name.display, key: name.key, jersey, pin };
}
function publicPlayer(token, displayName, jersey, nameKey, progress) {
  return { token, displayName, jersey, nameKey, progress };
}
async function handleCreate(request, deps) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!deps.configured) return json(503, { error: "offline" });
  const body = await readJson(request);
  if (body === "too-big" || body === "bad") return json(400, { error: "invalid" });
  const identity = identityFrom(body);
  const teamPassword = body && typeof body === "object" ? body.teamPassword : void 0;
  if (!identity || typeof teamPassword !== "string") return json(400, { error: "invalid" });
  if (deps.teamPassword && identity.pin === deps.teamPassword) return json(400, { error: "invalid" });
  const now = deps.now().getTime();
  if (blocked(teamFails, deps.ip, now)) return json(429, { error: "limited" });
  try {
    const existing = await deps.repo.findByIdentity(identity.key, identity.jersey);
    if (existing) return json(409, { error: "exists" });
    if (!deps.teamPassword || !secretEqual(teamPassword, deps.teamPassword)) {
      mark(teamFails, deps.ip, now);
      return json(401, { error: "team" });
    }
    const rawProgress = body.progress;
    const progress = rawProgress === void 0 ? defaultProg() : normalizeProgress(rawProgress);
    const created = await deps.repo.insert({
      nameKey: identity.key,
      displayName: identity.display,
      jersey: identity.jersey,
      pinHash: hashPin(identity.pin),
      progress
    });
    const token = newToken();
    await deps.repo.createSession(created.id, token, new Date(now + SESSION_MS));
    return json(201, publicPlayer(token, created.displayName, created.jersey, created.nameKey, created.progress));
  } catch (err) {
    if (err instanceof ProfileExistsError) return json(409, { error: "exists" });
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

// src/server/entries/profiles.ts
function POST(request) {
  return handleCreate(request, productionProfileDeps(request));
}
export {
  POST
};
