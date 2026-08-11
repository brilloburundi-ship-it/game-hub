# Game Hub agent contract

GitHub is the source of truth. Edit the real repository and continue working in the same stable project folder. Never create a ZIP, copied project, `v2` folder, or timestamped duplicate as part of normal development.

## Project rules

- Register projects in `data/projects.json`.
- A game must use its own repository or one permanent `rootPath`.
- Keep the configured `liveUrl` stable across updates.
- Make focused commits to the configured branch and let GitHub Actions deploy them.
- Do not store GitHub or OpenAI tokens in source, commits, localStorage, or workflow files.
- Preserve game saves and asset paths unless the requested change requires a migration.
- Run `npm run check` before pushing changes to this repository.

## Completion rule

A UI or game change is not complete because it built successfully. Verify that the relevant workflow succeeded and that the live URL serves the new marker or visible behavior. The deploy proof for the sample game lives at `games/neon-orbit/version.json` and must remain reachable at the same URL.
