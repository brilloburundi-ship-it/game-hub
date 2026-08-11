# Game Hub — Product V1

## Product promise

Game Hub is a mobile-first game development workspace. A user can connect their own GitHub account, import or create a web game, keep one permanent project, develop it with their own ChatGPT/Codex access, deploy it, and test it from iPhone without repeating ZIP/import/setup steps.

## Core principles

1. **User-owned credentials** — Game Hub never asks for or stores ChatGPT passwords. GitHub authorization must use OAuth/GitHub App flows in production.
2. **Private by default** — source repositories, project metadata, build logs, previews, and workspace data are private unless the owner explicitly publishes a game.
3. **Tenant isolation** — users can only see and operate on projects belonging to their own workspace(s).
4. **One project, one history** — updates modify the same repository/path instead of creating timestamped ZIP copies.
5. **Stable previews** — each project keeps a stable preview/deploy URL.
6. **Bring your own AI** — Game Hub does not resell AI usage. Users authenticate to supported AI products with their own accounts when available.
7. **Mobile first** — all important workflows must be usable from iPhone.

## V1 user flow

1. Create a Game Hub account.
2. Connect GitHub.
3. Create or import a game.
4. Game Hub creates/registers a private project and stable project identity.
5. User opens the project workspace.
6. User develops through ChatGPT/Codex using their own account, with Game Hub providing project context and repository/deploy state.
7. Changes are committed to the real repository.
8. Build/deploy runs automatically.
9. User tests the game from the same preview URL.
10. User can explicitly publish a public build when ready.

## Product areas

- Accounts and sessions
- GitHub connection
- Projects
- File browser
- Versions / commit history
- Build and deploy
- Private preview
- Public publish
- AI handoff / ChatGPT-Codex bridge
- Mobile diagnostics
- Optional TikTok LIVE bridge status for supported games

## Plans

The product is designed for multiple plans. The internal **Founder** plan is free forever for the original Game Hub workspace and is not purchasable by customers. Public plans can evolve independently without affecting founder access.

## V1 acceptance criteria

- Two test users cannot see each other's projects or GitHub connections.
- A private repository can be connected without exposing a token in browser storage.
- A project can be imported once and updated repeatedly in the same repository/path.
- Build and deploy status are visible on iPhone.
- A private preview requires authentication.
- Publishing is an explicit action separate from development privacy.
- Disconnecting GitHub revokes Game Hub's ability to operate on that user's repositories.
- Founder workspace remains free regardless of future paid-plan changes.
