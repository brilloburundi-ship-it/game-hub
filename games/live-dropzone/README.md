# LIVE DROPZONE

Vertical 9:16 TikTok LIVE top-down battle royale prototype built from the supplied shooter asset pack.

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

Version marker: `LIVE_DROPZONE_V0_1_0`
