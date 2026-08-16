# TikTok Fighter Arena

Permanent Game Hub project for a TikTok LIVE 1v1 auto-fighter queue.

## Core loop
- Viewer JOIN/entry creates a persistent fighter and puts the viewer in the queue.
- Two viewers fight automatically; the winner stays and the next queued challenger enters.
- Likes act as potions and heal the viewer's active fighter.
- Follow unlocks an uncommon fighter without downgrading an already stronger fighter.
- Rose levels the viewer up, increasing max HP and combat stats.
- Gifts use diamond/value tiers to transform into stronger fighters and trigger instant powers.
- The defeated fighter must complete its full death animation before the next round can rotate in.

## Fighter roster
The v1.4 runtime targets all 20 fighter entries assembled from the supplied packs, including the two Medieval Warrior additions and the multi-character Samurai/Magician packs. The combat state machine uses idle, run, hit/hurt, every available attack variant, jump/fall where present, and native death/dead animations. If a source pack has no death sheet, the fighter uses its hit animation followed by a controlled fall so it never simply disappears.

## Desktop LIVE safe web app
For TikTok LIVE Studio on the same Windows PC, use `AVVIA_FIGHTER_ARENA_LIVE.bat`. It now opens `desktop-live.html` on the dedicated local HTTP origin `127.0.0.1:8777`.

Safe desktop rules:
- TikFinity must already be connected to the TikTok LIVE before Fighter Arena is opened.
- The launcher never starts, closes or reconnects TikFinity and never controls LIVE Studio.
- No port `8795` LAN/iPhone bridge is used in desktop mode.
- Fighter Arena finishes its game preload first, then opens exactly one passive Event API WebSocket to `ws://127.0.0.1:21213/`.
- There is no automatic reconnect loop. If the Event API drops, the loading screen exposes `RECONNECT TIKFINITY` for an explicit retry.
- Chrome Web Locks prevent a second `desktop-live.html` tab on the same local origin from opening another TikFinity Event API socket.
- Switching windows/tabs does not trigger reconnects or socket churn.

This keeps the TikFinity ↔ TikTok LIVE/LIVE Studio connection independent from the game. The game only listens to TikFinity's local Event API.

## LIVE bridge
Use `window.FighterArenaBridge.emit(type, payload)`.

Supported event types: `join`, `like`, `follow`, `rose`, `gift`.
Useful payload fields: `userId`, `username`, `count`, `giftName`, `diamondCount`, `repeatCount`.

The game also accepts `postMessage` events with `channel: "tiktok-live"` and `CustomEvent("fighter-arena-event")`.

## Runtime reliability
Fighter atlases and effects are validated before use. The active combat, countdown, idle state and roster gate share the v1.4 core state. The render loop is fail-safe so a single invalid atlas cannot freeze the countdown or the arena. Fake/demo viewers remain restricted to `?demo=1`.
