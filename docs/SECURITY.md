# Game Hub Security Model

Game Hub is multi-tenant software. Security boundaries must be enforced by the backend, never by hidden buttons or client-side filtering.

## Credentials

- Never collect or store GitHub passwords.
- Never collect or store ChatGPT passwords.
- Production GitHub access must use GitHub OAuth or a GitHub App with the minimum required repository permissions.
- OAuth/GitHub App secrets live only on the server.
- Access/refresh tokens are encrypted at rest and never returned to the browser after connection.
- Do not put OpenAI, GitHub, deployment-provider, or billing secrets in the PWA bundle, localStorage, sessionStorage, source repository, query strings, or logs.

The current browser fine-grained-token editor is a prototype convenience only. It is not the production authentication design.

## Tenant isolation

Every server-side object must carry an owner/workspace boundary. Authorization is checked for every read and write.

Minimum hierarchy:

`user -> workspace -> project -> repository connection / deployment / build`

A guessed project ID, repository name, preview URL, or API route must never bypass authorization.

## Private by default

- New projects default to private.
- Development previews default to authenticated/private.
- Public publishing is a separate explicit operation.
- Public builds must not include development secrets, repository credentials, server tokens, private logs, or internal metadata.

## GitHub permissions

Prefer repository-scoped installations. Request only the permissions required by enabled features. A baseline may include:

- Metadata: read
- Contents: read/write for repositories explicitly selected by the user
- Actions: read for build status
- Workflows: only if Game Hub is explicitly allowed to manage workflows

Do not request organization-wide access when repository-specific access is sufficient.

## Founder access

The Founder plan is a billing entitlement, not a security bypass. Founder/admin users still pass normal authorization checks. Administrative support access to customer projects must not exist by default and, if introduced later, must be explicit, auditable, time-limited, and user-visible.

## Logging

Audit security-relevant events without logging secrets:

- sign in/out
- GitHub connect/disconnect
- repository grant changes
- project create/import/delete
- commits triggered through Game Hub
- publish/unpublish
- billing plan changes
- administrative actions

## Before public beta

- Threat-model OAuth callbacks and CSRF/state handling.
- Add rate limiting and abuse controls.
- Validate all repository/path input server-side.
- Add encrypted secret storage and rotation.
- Add account deletion and connection revocation.
- Add privacy policy and terms.
- Run tenant-isolation tests with at least two accounts.
