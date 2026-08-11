# Game Hub

Game Hub is a mobile-first AI game-development control plane for iPhone. GitHub is the only source of truth: every game has one repository or one permanent folder, one current branch, a stable live URL, and continuous commit history. There is no ZIP/version-copy workflow.

## What it does

- Projects dashboard with repository, branch, last commit, build, deploy, and stable live URL
- AI Development Chat that creates a repository-scoped Codex brief and opens ChatGPT/Codex
- GitHub-backed file browser, code search, viewer, and optional mobile editor
- Atomic create/edit/delete/rename commits through the Git Data API
- Embedded live preview and **Open Game** action
- Build/deploy status, commit history, and Git-based Versions / Backup
- Installable PWA with offline shell caching and iPhone safe-area support

## AI architecture

The static PWA does not impersonate ChatGPT and never stores an OpenAI API key. The user connects the target GitHub repository to ChatGPT/Codex, selects a project in Game Hub, writes the change request, and taps **Copy brief & open Codex**. The generated brief fixes the repository, branch, permanent project folder, stable URL, checks, and no-ZIP rule. Codex then edits and commits the real GitHub project.

The regular ChatGPT GitHub connector is useful for reading and searching repositories; direct code changes and pushes belong to Codex. This separation keeps repository permissions explicit and avoids an unsafe browser-side OpenAI proxy.

Official reference: [Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering).

## Run locally

```bash
npm run check
npm run dev
```

Open `http://127.0.0.1:4173/`.

## Add a game

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

## GitHub access on iPhone

Public repositories work without a token. For private repositories or direct edits in the Files screen, create a fine-grained GitHub token restricted to the selected repositories with **Contents: read and write** and **Actions: read**. Game Hub keeps it in `sessionStorage` only, clears it on disconnect, and never sends it anywhere except `api.github.com`.

Codex authentication is separate: use the GitHub connection in ChatGPT/Codex. Never paste a token into AI chat.

## Deployment

`.github/workflows/pages.yml` validates the PWA, builds `dist/`, and deploys to GitHub Pages on every push to `main`. The stable URL is:

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
