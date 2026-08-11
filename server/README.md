# Game Hub Server

The current Game Hub is a static GitHub Pages PWA. A public multi-user release requires a server because private repository credentials, authenticated previews, tenant authorization, billing entitlements, and OAuth secrets must not live in the browser.

## Responsibilities

The server will provide:

- Game Hub account/session authentication
- GitHub OAuth or GitHub App connection
- encrypted token storage and refresh/revocation
- workspace and project authorization
- project registry per user/workspace
- private preview authorization
- build/deploy state aggregation
- audit events
- plan/entitlement checks
- future billing integration
- optional bridge/device registration for LIVE workflows

## API surface (V1 draft)

### Session

- `GET /api/me`
- `POST /api/logout`

### GitHub

- `GET /api/github/connect`
- `GET /api/github/callback`
- `GET /api/github/repositories`
- `DELETE /api/github/connection`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

### Files / versions

Server proxies only authorized repository operations; credentials never reach the PWA.

- `GET /api/projects/:id/tree`
- `GET /api/projects/:id/file?path=...`
- `POST /api/projects/:id/commit`
- `GET /api/projects/:id/commits`

### Build / deploy

- `GET /api/projects/:id/builds`
- `POST /api/projects/:id/deploy`
- `GET /api/projects/:id/deployments`
- `POST /api/projects/:id/publish`
- `POST /api/projects/:id/unpublish`

## Authorization rule

Every project endpoint must resolve the authenticated user, workspace membership, project workspace, and required role before touching GitHub or deployment providers. Client-provided repository names are never sufficient proof of access.

## Founder entitlement

The original workspace receives `plan_id = 'founder'` and `founder_entitlement = true` in server-side data. This means free forever for billing purposes, while all normal authentication and authorization rules still apply.

## Deployment choice

Keep the implementation portable initially. A small serverless runtime plus a relational database is sufficient. Do not couple the frontend to a specific provider before authentication, GitHub OAuth, tenant-isolation tests, and private preview behavior are implemented.

## Migration from prototype

1. Keep the existing static PWA and project registry working.
2. Add server authentication and `/api/me`.
3. Replace browser PAT entry with server-side GitHub OAuth/App connection.
4. Move project registry from `data/projects.json` to the database per workspace.
5. Replace direct browser GitHub writes with authenticated server API calls.
6. Add private preview gateway.
7. Add public publish as an explicit separate action.
8. Only then enable customer billing.
