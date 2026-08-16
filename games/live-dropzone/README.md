# LIVE DROPZONE

Vertical 9:16 TikTok LIVE top-down battle royale prototype built from the supplied shooter asset pack.

## Source prefab renderer

Version 0.3 uses the supplied artwork directly as the source of the in-game visual components:

- the 16 fighters are assembled directly from the modular helmet/head/torso/arm components extracted from `Skins.png`, without redrawing the characters;
- the five visible weapon components are extracted from `Weapons.png` and rotate with the fighter aim;
- floors, cover pieces, health/ammo/chest pickups, crate and hazard are taken from the original 256x256 tileset cells;
- the runtime loads the source-derived display payload before starting the round, rather than substituting generic canvas characters.

The compact runtime atlases are display-optimized derivatives of the supplied source artwork, not replacement artwork.

## LIVE rules

- `JOIN` / `ENTRA` / `PLAY` in chat: creates the viewer fighter, up to 18 active fighters.
- Like: heals the viewer's existing fighter.
- Follow: one-time weapon upgrade + shield for the viewer's existing fighter.
- Rose: level up, HP/stat growth and weapon progression.
- Other gifts: scale from heal/shield to weapon upgrades and high-tier airstrikes.
- Fighters are AI controlled, aim and shoot automatically, use cover, collect pickups and take damage outside the shrinking zone.
- Winner is shown for 5.2 seconds and the roster continues into the next round. Late viewers wait in queue.

## Modes

Normal URL is LIVE-safe: it never creates fake viewers. Use `?demo=1` only for the local/demo roster and test buttons.

The bridge is passive unless a TikTok creator is explicitly supplied with `?liveUser=<username>` or `?tiktokUser=<username>`. It also accepts normalized events through `window.LiveDropzoneBridge.emit(type, payload)` or `window.postMessage`.

## Stable path

`games/live-dropzone/`

Version marker: `LIVE_DROPZONE_V0_3_0_SOURCE_PREFABS`
