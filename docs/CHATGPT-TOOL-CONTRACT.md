# Game Hub ↔ ChatGPT Tool Contract

Game Hub treats ChatGPT/Codex as the development engine. The production backend should expose a narrow, authenticated tool surface so ChatGPT can operate on the user's own workspace without receiving raw credentials.

## Authentication model

- The user signs into Game Hub.
- The user connects GitHub through OAuth/GitHub App authorization.
- Game Hub stores provider credentials server-side, encrypted and tenant-scoped.
- ChatGPT receives only Game Hub tool access for the currently authorized user/workspace.
- No GitHub token, ChatGPT password or long-lived provider secret is placed in prompts or browser storage.

## Core tools

### `list_projects`
Returns only projects visible to the current Game Hub user/workspace.

### `get_project_context`
Input: `project_id`

Returns repository, branch, permanent root path, runtime target, stable preview URL, build status, latest commit, asset policy and bridge capability.

### `create_project`
Inputs: name, slug, target, visibility, optional template/stack choice.

Creates a permanent private project identity and repository/path. This action must never create a disposable ZIP workflow.

### `search_project`
Inputs: project_id, query.

Searches code/configuration for the development agent before edits.

### `read_project_file`
Inputs: project_id, path.

Reads a text file from the authorized project.

### `commit_text_changes`
Inputs: project_id, commit_message, changes[].

Applies atomic text create/update/delete operations and returns the resulting commit SHA.

### `upload_project_asset`
Inputs: project_id, destination_path, file, metadata.

Uploads a binary game asset through the backend/GitHub provider. This is the required path for generated PNG/WebP/audio/model files; binary data must not be embedded into prompts.

### `register_asset`
Inputs: project_id, asset metadata.

Updates the project's machine-readable asset manifest after the binary file has been persisted.

### `list_assets`
Inputs: project_id, optional type/status filters.

Returns project asset inventory including whether each asset is referenced/in-use.

### `trigger_build`
Input: project_id.

Runs project build/checks using the configured pipeline.

### `get_build_status`
Input: project_id.

Returns current/last build state and relevant logs.

### `get_deploy_status`
Input: project_id.

Returns stable preview URL, deployed commit and health/proof state.

### `publish_game`
Inputs: project_id, publication settings.

Explicitly creates/updates a public release. Development source remains private by default.

### `get_bridge_status`
Input: project_id.

For supported LIVE games, returns configured bridge endpoint/state without exposing machine secrets.

## Asset-generation flow

For a prompt like "create a car game":

1. `create_project`
2. agent designs gameplay and infers asset manifest
3. agent generates needed visuals using available image generation capability
4. each accepted binary is sent through `upload_project_asset`
5. each asset is recorded with `register_asset`
6. game code/config is created with `commit_text_changes`
7. agent verifies every generated runtime asset is actually referenced
8. `trigger_build`
9. `get_build_status`
10. `get_deploy_status`

For an existing project, steps begin with `get_project_context`, `search_project`, `read_project_file` and `list_assets` before generation or edits.

## Write confirmations and safety

Destructive or externally visible actions should be explicit and auditable. At minimum, deleting projects, changing publication visibility, disconnecting GitHub, destructive repository rewrites and production publishing should require clear user intent and appropriate confirmation.

## Completion rule

ChatGPT must not claim that a game or asset change is complete unless the real project files were persisted, the build passed, and the stable preview/deploy state was checked. Generated visuals that remain only inside the chat do not count as imported game assets.
