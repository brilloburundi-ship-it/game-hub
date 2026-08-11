# ChatGPT Asset Pipeline

Game Hub does not embed a second AI model. ChatGPT/Codex is the development engine; Game Hub provides project context, asset inventory, repository/deploy state and the tools required to persist results.

## Goal

A user should be able to say:

> Create a vertical car game with traffic, police chases and upgrades.

The development agent should infer the playable systems and the visual asset set, create or source the required assets, import them into the permanent project, wire them into gameplay, build, deploy and report the result.

## Required sequence

1. Read the current project if one exists.
2. Infer an `asset-manifest` from gameplay needs before generating visuals.
3. Reuse compatible existing assets.
4. Generate only missing/replacement assets required by the requested change.
5. For 2D sprites, prefer transparent backgrounds, isolated subjects, clean edges, consistent perspective, consistent scale and no baked-in labels/text unless the asset itself is typography.
6. Store assets in semantic folders such as:
   - `assets/characters/`
   - `assets/vehicles/`
   - `assets/environment/`
   - `assets/props/`
   - `assets/ui/`
   - `assets/vfx/`
   - `assets/audio/`
7. Optimize dimensions/encoding for the target device instead of keeping unnecessarily large source renders in the runtime path.
8. Import every accepted asset into game code/configuration. A generated image that is not used by the game is not a completed asset task.
9. Validate loading paths and missing-file fallbacks.
10. Build and test the project.
11. Commit the real files to the permanent repository/path.
12. Verify the stable preview/deploy URL.

## Asset manifest

A future Game Hub backend should persist a machine-readable manifest per project. Suggested shape:

```json
{
  "version": 1,
  "style": "2d-transparent-cartoon",
  "items": [
    {
      "id": "player-sports-car",
      "role": "player",
      "path": "assets/vehicles/player-sports-car.webp",
      "source": "generated",
      "transparent": true,
      "status": "in-use"
    }
  ]
}
```

## Security boundary

Generated binary assets must be uploaded through authenticated Game Hub/GitHub project tools. Credentials never belong in prompts. The public client must not receive long-lived repository secrets.

## Product acceptance test

For a brand-new game prompt, the flow is complete only when:

- a permanent project exists;
- the game is playable;
- the required asset set was inferred;
- generated/imported assets are present as individual reusable files;
- those files are referenced by the actual game;
- the build succeeds;
- the stable preview is verified.

A concept image, sprite sheet mockup, ZIP export or uncommitted asset folder does not satisfy the flow.
