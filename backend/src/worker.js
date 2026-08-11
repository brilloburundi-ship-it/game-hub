import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
  signPayload,
  verifyPayload
} from "./crypto.js";
import { initialPlanForGitHubLogin, isLockedFreePlan, PLAN_DEFINITIONS } from "./plans.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const OAUTH_COOKIE = "gh_oauth";
const SESSION_COOKIE = "gh_session";
const SESSION_DAYS = 30;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      console.error("Game Hub API error", error);
      return json({ error: "internal_error", message: "Game Hub API could not complete the request." }, 500, request, env);
    }
  }
};

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return corsPreflight(request, env);
  if (url.pathname === "/health") return json({ ok: true, service: "game-hub-api" }, 200, request, env);
  if (url.pathname === "/auth/github/start" && request.method === "GET") return startGitHubAuth(request, env);
  if (url.pathname === "/auth/github/callback" && request.method === "GET") return finishGitHubAuth(request, env);
  if (url.pathname === "/auth/logout" && request.method === "POST") return logout(request, env);
  if (url.pathname === "/api/me" && request.method === "GET") return me(request, env);
  if (url.pathname === "/api/projects" && request.method === "GET") return listProjects(request, env);
  if (url.pathname === "/api/projects" && request.method === "POST") return createProject(request, env);
  if (url.pathname === "/api/github/repositories" && request.method === "GET") return listGitHubRepositories(request, env);
  if (url.pathname.startsWith("/api/projects/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length));
    return getProject(request, env, id);
  }
  return json({ error: "not_found" }, 404, request, env);
}

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  const configured = String(env.APP_ORIGIN || "https://brilloburundi-ship-it.github.io").replace(/\/$/, "");
  return origin === configured ? configured : configured;
}

function corsHeaders(request, env) {
  return {
    "access-control-allow-origin": allowedOrigin(request, env),
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    vary: "Origin"
  };
}

function corsPreflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(payload, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env), ...extraHeaders }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(seconds) {
  return new Date(Date.now() + Number(seconds || 0) * 1000).toISOString();
}

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function parseCookies(request) {
  const result = {};
  const source = request.headers.get("cookie") || "";
  for (const part of source.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

function clearCookie(name, sameSite = "Lax") {
  return cookie(name, "", { maxAge: 0, sameSite });
}

function safeReturnTo(value, env) {
  const appOrigin = String(env.APP_ORIGIN || "https://brilloburundi-ship-it.github.io").replace(/\/$/, "");
  const appPath = String(env.APP_PATH || "/game-hub/");
  const fallback = `${appOrigin}${appPath.startsWith("/") ? appPath : `/${appPath}`}`;
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== appOrigin) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "game")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "game";
}

async function startGitHubAuth(request, env) {
  required(env, "GITHUB_CLIENT_ID");
  required(env, "GITHUB_CLIENT_SECRET");
  required(env, "SESSION_SECRET");
  const url = new URL(request.url);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), env);
  const signed = await signPayload({ state, verifier, returnTo, issuedAt: Date.now() }, env.SESSION_SECRET);
  const callback = `${url.origin}/auth/github/callback`;
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": cookie(OAUTH_COOKIE, signed, { maxAge: 600, sameSite: "Lax" })
    }
  });
}

async function finishGitHubAuth(request, env) {
  required(env, "GITHUB_CLIENT_ID");
  required(env, "GITHUB_CLIENT_SECRET");
  required(env, "SESSION_SECRET");
  required(env, "TOKEN_ENCRYPTION_KEY");
  required(env, "DB");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const signed = parseCookies(request)[OAUTH_COOKIE];
  const oauth = await verifyPayload(signed, env.SESSION_SECRET);
  if (!code || !state || !oauth || oauth.state !== state || Date.now() - oauth.issuedAt > 10 * 60 * 1000) {
    return json({ error: "invalid_oauth_state" }, 400, request, env, { "set-cookie": clearCookie(OAUTH_COOKIE) });
  }

  const callback = `${url.origin}/auth/github/callback`;
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callback,
      code_verifier: oauth.verifier
    })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    console.error("GitHub token exchange failed", token);
    return json({ error: "github_oauth_failed" }, 502, request, env, { "set-cookie": clearCookie(OAUTH_COOKIE) });
  }

  const profileResponse = await githubFetch("/user", token.access_token);
  if (!profileResponse.ok) return json({ error: "github_profile_failed" }, 502, request, env);
  const profile = await profileResponse.json();
  const user = await upsertUserAndWorkspace(env, profile);
  await saveGitHubConnection(env, user.id, token);
  const sessionToken = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256(sessionToken), user.id, addDays(SESSION_DAYS), nowIso()).run();
  await audit(env, user.id, user.workspaceId, "auth.github.connected", "user", user.id, { githubLogin: profile.login });

  const destination = new URL(safeReturnTo(oauth.returnTo, env));
  destination.searchParams.set("auth", "connected");
  return new Response(null, {
    status: 302,
    headers: {
      location: destination.toString(),
      "set-cookie": [
        clearCookie(OAUTH_COOKIE),
        cookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_DAYS * 86400, sameSite: "None" })
      ].join(", ")
    }
  });
}

async function upsertUserAndWorkspace(env, profile) {
  const timestamp = nowIso();
  let user = await env.DB.prepare("SELECT * FROM users WHERE github_id = ?").bind(profile.id).first();
  if (!user) {
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, github_id, github_login, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(userId, profile.id, profile.login, profile.name || profile.login, profile.avatar_url || null, timestamp, timestamp).run();
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  } else {
    await env.DB.prepare(
      "UPDATE users SET github_login = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?"
    ).bind(profile.login, profile.name || profile.login, profile.avatar_url || null, timestamp, user.id).run();
  }

  let workspace = await env.DB.prepare(
    "SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ? AND m.role = 'owner' ORDER BY w.created_at LIMIT 1"
  ).bind(user.id).first();

  if (!workspace) {
    const workspaceId = crypto.randomUUID();
    const baseSlug = slugify(profile.login);
    const workspaceSlug = `${baseSlug}-${randomToken(4).toLowerCase()}`;
    const planId = initialPlanForGitHubLogin(profile.login, env);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO workspaces (id, owner_user_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(workspaceId, user.id, `${profile.login}'s Game Hub`, workspaceSlug, timestamp, timestamp),
      env.DB.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)")
        .bind(workspaceId, user.id, timestamp),
      env.DB.prepare("INSERT INTO subscriptions (workspace_id, plan_id, status, locked_free, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)")
        .bind(workspaceId, planId, isLockedFreePlan(planId) ? 1 : 0, timestamp, timestamp)
    ]);
    workspace = await env.DB.prepare("SELECT * FROM workspaces WHERE id = ?").bind(workspaceId).first();
  } else {
    const planId = initialPlanForGitHubLogin(profile.login, env);
    if (planId === "founder") {
      await env.DB.prepare(
        "UPDATE subscriptions SET plan_id = 'founder', status = 'active', locked_free = 1, billing_provider = NULL, billing_customer_id = NULL, updated_at = ? WHERE workspace_id = ?"
      ).bind(timestamp, workspace.id).run();
    }
  }
  return { ...user, workspaceId: workspace.id };
}

async function saveGitHubConnection(env, userId, token) {
  const timestamp = nowIso();
  const accessTokenEnc = await encryptSecret(token.access_token, env.TOKEN_ENCRYPTION_KEY);
  const refreshTokenEnc = await encryptSecret(token.refresh_token || null, env.TOKEN_ENCRYPTION_KEY);
  const tokenExpiresAt = token.expires_in ? addSeconds(token.expires_in) : null;
  const refreshExpiresAt = token.refresh_token_expires_in ? addSeconds(token.refresh_token_expires_in) : null;
  const existing = await env.DB.prepare(
    "SELECT id FROM provider_connections WHERE user_id = ? AND provider = 'github'"
  ).bind(userId).first();
  if (existing) {
    await env.DB.prepare(
      "UPDATE provider_connections SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?, refresh_expires_at = ?, updated_at = ? WHERE id = ?"
    ).bind(accessTokenEnc, refreshTokenEnc, tokenExpiresAt, refreshExpiresAt, timestamp, existing.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO provider_connections (id, user_id, provider, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, created_at, updated_at) VALUES (?, ?, 'github', ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), userId, accessTokenEnc, refreshTokenEnc, tokenExpiresAt, refreshExpiresAt, timestamp, timestamp).run();
  }
}

async function authenticate(request, env) {
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const hash = await sha256(raw);
  const session = await env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.github_login, u.display_name, u.avatar_url,
            w.id AS workspace_id, w.name AS workspace_name, w.slug AS workspace_slug,
            sub.plan_id, sub.status AS subscription_status, sub.locked_free
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.role = 'owner'
       JOIN workspaces w ON w.id = wm.workspace_id
       JOIN subscriptions sub ON sub.workspace_id = w.id
      WHERE s.id_hash = ?
      ORDER BY w.created_at LIMIT 1`
  ).bind(hash).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(hash).run();
    return null;
  }
  return session;
}

async function requireUser(request, env) {
  const session = await authenticate(request, env);
  if (!session) return { response: json({ error: "unauthorized" }, 401, request, env) };
  return { session };
}

async function me(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const session = auth.session;
  const plan = PLAN_DEFINITIONS[session.plan_id] || PLAN_DEFINITIONS.free;
  return json({
    user: {
      githubLogin: session.github_login,
      displayName: session.display_name,
      avatarUrl: session.avatar_url
    },
    workspace: {
      id: session.workspace_id,
      name: session.workspace_name,
      slug: session.workspace_slug
    },
    plan: { ...plan, lockedFree: Boolean(session.locked_free), status: session.subscription_status }
  }, 200, request, env);
}

async function logout(request, env) {
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (raw) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(raw)).run();
  return json({ ok: true }, 200, request, env, { "set-cookie": clearCookie(SESSION_COOKIE, "None") });
}

async function listProjects(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    `SELECT id, name, slug, repository_id AS repositoryId, repository_full_name AS repository,
            branch, root_path AS rootPath, preview_url AS previewUrl, visibility, created_at AS createdAt, updated_at AS updatedAt
       FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC`
  ).bind(auth.session.workspace_id).all();
  return json({ projects: result.results || [] }, 200, request, env);
}

async function getProject(request, env, id) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const project = await env.DB.prepare(
    `SELECT id, name, slug, repository_id AS repositoryId, repository_full_name AS repository,
            branch, root_path AS rootPath, preview_url AS previewUrl, visibility, created_at AS createdAt, updated_at AS updatedAt
       FROM projects WHERE id = ? AND workspace_id = ?`
  ).bind(id, auth.session.workspace_id).first();
  if (!project) return json({ error: "not_found" }, 404, request, env);
  return json({ project }, 200, request, env);
}

async function createProject(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }
  const name = String(body.name || "").trim();
  const repository = String(body.repository || "").trim();
  const repositoryId = body.repositoryId ? Number(body.repositoryId) : null;
  const branch = String(body.branch || "main").trim() || "main";
  const rootPath = String(body.rootPath || "").replace(/^\/+|\/+$/g, "");
  const previewUrl = body.previewUrl ? String(body.previewUrl).trim() : null;
  const visibility = body.visibility === "public" ? "public" : "private";
  if (!name || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return json({ error: "invalid_project", message: "name and repository owner/name are required" }, 400, request, env);
  }

  const plan = PLAN_DEFINITIONS[auth.session.plan_id] || PLAN_DEFINITIONS.free;
  if (plan.projectLimit !== null) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects WHERE workspace_id = ?").bind(auth.session.workspace_id).first();
    if (Number(count?.total || 0) >= plan.projectLimit) {
      return json({ error: "plan_limit", plan: plan.id, projectLimit: plan.projectLimit }, 403, request, env);
    }
  }

  const token = await currentGitHubToken(env, auth.session.user_id);
  const repoResponse = await githubFetch(`/repos/${repository}`, token);
  if (!repoResponse.ok) return json({ error: "repository_not_authorized" }, 403, request, env);
  const repo = await repoResponse.json();
  if (repositoryId && Number(repo.id) !== repositoryId) return json({ error: "repository_mismatch" }, 400, request, env);

  const id = crypto.randomUUID();
  const slug = slugify(body.slug || name);
  const timestamp = nowIso();
  try {
    await env.DB.prepare(
      `INSERT INTO projects (id, workspace_id, name, slug, repository_id, repository_full_name, branch, root_path, preview_url, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, auth.session.workspace_id, name, slug, repo.id, repo.full_name, branch, rootPath, previewUrl, visibility, timestamp, timestamp).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: "duplicate_project_slug" }, 409, request, env);
    throw error;
  }
  await audit(env, auth.session.user_id, auth.session.workspace_id, "project.created", "project", id, { repository: repo.full_name, visibility });
  return getProject(request, env, id);
}

async function listGitHubRepositories(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const token = await currentGitHubToken(env, auth.session.user_id);
  const installationsResponse = await githubFetch("/user/installations?per_page=100", token);
  if (!installationsResponse.ok) return json({ error: "github_installations_failed" }, 502, request, env);
  const installations = await installationsResponse.json();
  const repositories = [];
  for (const installation of installations.installations || []) {
    const response = await githubFetch(`/user/installations/${installation.id}/repositories?per_page=100`, token);
    if (!response.ok) continue;
    const payload = await response.json();
    for (const repo of payload.repositories || []) {
      repositories.push({
        id: repo.id,
        fullName: repo.full_name,
        private: Boolean(repo.private),
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        installationId: installation.id
      });
    }
  }
  repositories.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return json({ repositories }, 200, request, env);
}

async function currentGitHubToken(env, userId) {
  const connection = await env.DB.prepare(
    "SELECT * FROM provider_connections WHERE user_id = ? AND provider = 'github'"
  ).bind(userId).first();
  if (!connection) throw new Error("GitHub is not connected");
  const expiresSoon = connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) return decryptSecret(connection.access_token_enc, env.TOKEN_ENCRYPTION_KEY);
  if (!connection.refresh_token_enc) throw new Error("GitHub authorization has expired; reconnect GitHub");
  const refreshToken = await decryptSecret(connection.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY);
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required(env, "GITHUB_CLIENT_ID"),
      client_secret: required(env, "GITHUB_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error("GitHub refresh failed; reconnect GitHub");
  await saveGitHubConnection(env, userId, token);
  return token.access_token;
}

function githubFetch(path, token, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "Game-Hub",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
}

async function audit(env, userId, workspaceId, action, objectType, objectId, metadata) {
  await env.DB.prepare(
    "INSERT INTO audit_log (id, user_id, workspace_id, action, object_type, object_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId || null, workspaceId || null, action, objectType || null, objectId || null, metadata ? JSON.stringify(metadata) : null, nowIso()).run();
}
