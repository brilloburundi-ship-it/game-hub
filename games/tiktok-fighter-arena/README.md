# TikTok Fighter Arena

Permanent Game Hub project for a TikTok LIVE 1v1 auto-fighter queue.

## Core loop
- Viewer JOIN/entry creates a persistent fighter and puts the viewer in the queue.
- Two viewers fight automatically; the winner stays and the next queued challenger enters.
- Likes act as potions and heal the viewer's active fighter.
- Follow unlocks an uncommon fighter (without downgrading an already stronger fighter).
- Rose levels the viewer up, increasing max HP and combat stats.
- Gifts use diamond/value tiers to transform into stronger fighters and trigger instant powers.
- Arena rotates every three fights.

## LIVE bridge
Use `window.FighterArenaBridge.emit(type, payload)`.

Supported event types: `join`, `like`, `follow`, `rose`, `gift`.
Useful payload fields: `userId`, `username`, `count`, `giftName`, `diamondCount`, `repeatCount`.

The game also accepts `postMessage` events with `channel: "tiktok-live"` and `CustomEvent("fighter-arena-event")`.

## Performance
All fighter atlases, effects and arena backgrounds are preloaded before ENTER ARENA. Rendering is one Canvas2D loop with pixel smoothing disabled and no runtime network dependencies after preload.
