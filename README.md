# Game Hub

Game Hub is a mobile-first AI game-development control plane for iPhone. GitHub is the source of truth: every game has one repository or one permanent folder, one current branch, a stable live URL, and continuous commit history. There is no ZIP/version-copy workflow.

Game Hub is now being productized as a **private multi-user platform**: each customer will connect their own GitHub account, see only their own workspaces/projects, use their own ChatGPT/Codex access, and explicitly choose when a game build becomes public. The original Game Hub workspace uses an internal **Founder** entitlement that is free forever.

## What it does today

- Projects dashboard with repository, branch, last commit, build, deploy, and stable live URL
- AI Development Chat that creates a repository-scoped Codex brief and opens ChatGPT/Codex
- GitHub-backed file browser, code search, viewer, and optional mobile editor
- Atomic create/edit/delete/rename commits through the Git Data API
- Embedded live preview and **Open Game** action
- Build/deploy status, commit history, and Git-based Versions / Backup
- Installable PWA with offline shell caching and iPhone safe-area support

## Production direction

The current GitHub Pages PWA remains the working founder prototype. Public multi-user release adds a secure backend for authentication, GitHub OAuth/GitHub App access, tenant isolation, private previews, plans, audit logs, and later billing.

Production rules:

- credentials belong to the user and are never shared between accounts;
- source projects are private by default;
- development preview is private by default;
- public publishing is an explicit action;
- browser-side PAT entry is prototype-only and will be replaced by server-side GitHub authorization;
- Game Hub does not store ChatGPT passwords or resell AI usage;
- founder billing access stays free forever but does not bypass security authorization.

See:

- [`docs/PRODUCT-V1.md`](docs/PRODUCT-V1.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`server/README.md`](server/README.md)
- [`server/schema.sql`](server/schema.sql)
- [`data/plans.json`](data/plans.json)

## AI architecture

The static PWA does not impersonate ChatGPT and never stores an OpenAI API key. The user connects the target GitHub repository to ChatGPT/Codex, selects a project in Game Hub, writes the change request, and taps **Copy brief & open Codex**. The generated brief fixes the repository, branch, permanent project folder, stable URL, checks, and no-ZIP rule. Codex then edits and commits the real GitHub project.

The product architecture deliberately separates Game Hub account/security from the user's own AI account. Future integrations may improve the handoff, but user credentials remain private and provider-owned.

Official reference: [Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering).

## Run locally

```bash
npm run check
npm run dev
```

Open `http://127.0.0.1:4173/`.

## Add a game (founder prototype)

Edit `data/projects.json` in this repository and add one entry. Prefer a dedicated repository. A stable folder in an existing monorepo is also supported through `rootPath`.

```json
{
  "id": "my-game",
  "name": "My Game",
  "repository": "owner/repository",
  "branch": "main",
  "rootPath": "games/my-game",
  "liveUrl": "https://owner.github.io/repository/games/my-game/",
  "description": "One-line description"
}
```

Authorize the same repository in Codex, commit the registry change, and keep that entry/path for all future work.

In the production multi-user version, project registration moves from this shared JSON file into the authenticated workspace database.

## GitHub access on iPhone (prototype)

Public repositories work without a token. For private repositories or direct edits in the current Files screen, the founder prototype can use a fine-grained GitHub token restricted to selected repositories. It is held only for the browser session.

**This is not the customer production design.** Production replaces browser PAT entry with server-side GitHub OAuth/GitHub App authorization and encrypted credential storage. Never paste a GitHub token into AI chat.

## Deployment

`.github/workflows/pages.yml` validates the PWA, builds `dist/`, and deploys to GitHub Pages on every push to `main`. The founder prototype stable URL is:

`https://brilloburundi-ship-it.github.io/game-hub/`

The included sample game stays at:

`https://brilloburundi-ship-it.github.io/game-hub/games/neon-orbit/`

## Real deploy acceptance test

1. Deploy the implementation commit and verify the sample game's `version.json` marker.
2. Modify that exact file in the same repository and folder.
3. Commit to `main`.
4. Wait for the Pages workflow.
5. Fetch the same stable game URL and verify the new marker is live.

Do not call the project complete if any of these steps is missing.
