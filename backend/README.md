# Game Hub API

This directory is the secure multi-user backend for Game Hub. The static PWA remains the mobile workspace; this API owns identity, GitHub authorization, private project metadata, sessions and plan enforcement.

## What is implemented

- GitHub App OAuth web flow with `state` + PKCE
- server-side GitHub client secret usage
- encrypted GitHub access/refresh tokens at rest
- short-lived GitHub user-token refresh support
- opaque HttpOnly Game Hub sessions
- tenant-scoped workspaces and projects
- Founder / Free / Creator / Pro plan model
- Founder accounts forced to `founder`, `locked_free = 1`
- private-by-default project registration
- repository discovery limited to repositories visible through the user's GitHub App installations
- audit log foundation

## Why a GitHub App

GitHub recommends GitHub Apps over traditional OAuth Apps for integrations because they use fine-grained repository permissions and can use expiring user access tokens. The Game Hub backend therefore assumes a GitHub App rather than asking customers to paste personal access tokens.

Recommended repository permissions for the first production version:

- Contents: Read and write
- Metadata: Read-only
- Actions: Read-only (add write only if Game Hub must dispatch workflows directly)
- Administration: do not request unless a later feature genuinely needs it

Only install the GitHub App on repositories the user wants Game Hub to access.

## Cloudflare Worker + D1

The first backend target is a Cloudflare Worker with D1. This keeps secrets out of GitHub Pages and gives Game Hub a small authenticated API without embedding provider credentials in the iPhone PWA.

### One-time infrastructure setup

From `backend/`:

```bash
npx wrangler@latest login
npx wrangler@latest d1 create game-hub
```

Put the returned D1 database id into `wrangler.toml`, then apply the schema:

```bash
npx wrangler@latest d1 migrations apply game-hub --remote
```

Create a GitHub App and set its callback URL to:

```text
https://<your-worker-domain>/auth/github/callback
```

Then configure Worker secrets:

```bash
npx wrangler@latest secret put GITHUB_CLIENT_ID
npx wrangler@latest secret put GITHUB_CLIENT_SECRET
npx wrangler@latest secret put SESSION_SECRET
npx wrangler@latest secret put TOKEN_ENCRYPTION_KEY
```

`SESSION_SECRET` should be a long random string. `TOKEN_ENCRYPTION_KEY` must be 32 random bytes encoded as base64url.

Deploy:

```bash
npx wrangler@latest deploy
```

## Founder access

`FOUNDER_GITHUB_LOGINS` is a comma-separated allowlist. A matching login is always assigned the internal Founder plan. The database marks this plan with `locked_free = 1`; the login reconciliation path also restores Founder status if billing data is changed accidentally.

The default development value currently contains the original Game Hub founder GitHub account. For production, keep the same identity in the environment configuration and optionally add additional founder accounts explicitly.

## API surface

- `GET /health`
- `GET /auth/github/start?return_to=...`
- `GET /auth/github/callback`
- `POST /auth/logout`
- `GET /api/me`
- `GET /api/github/repositories`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`

All `/api/*` endpoints except `/health` require the Game Hub session.

## Security notes

Provider tokens are encrypted before persistence and never returned by `/api/me` or project APIs. Session cookies are opaque and HttpOnly. The frontend should call this API with `credentials: "include"`.

For reliable iPhone/Safari production auth, serve the app and API on the same registrable custom domain (for example `app.example.com` and `api.example.com`). The current GitHub Pages + `workers.dev` combination is suitable for backend bring-up, but cross-site cookie restrictions can be stricter on Safari.

The static PWA's temporary fine-grained-token field is a migration compatibility path only; remove it once the production GitHub App flow is connected in the UI.
