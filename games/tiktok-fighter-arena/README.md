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

## Complete WEB APP install
Use `INSTALLA_FIGHTER_ARENA_WEB_SAFE.cmd` once from a complete Fighter Arena package.

The installer:
- copies the complete game into `%LOCALAPPDATA%\FighterArenaWebSafe`;
- checks Node.js and can install Node.js LTS automatically through Windows `winget` if it is missing;
- creates a **Fighter Arena WEB SAFE** shortcut on the Windows Desktop and in the Start menu;
- installs an uninstaller inside the application folder;
- starts the installed app after setup.

After installation, normal use is one click on **Fighter Arena WEB SAFE**. The launcher starts the lightweight local web server and opens the game in Edge/Chrome app-window mode when available.

`AVVIA_FIGHTER_ARENA_LIVE.bat` is kept as a compatibility alias and routes to `START_FIGHTER_ARENA_WEB_SAFE.cmd`.

## TikTool LIVE bridge
The desktop web app now uses TikTool directly. TikFinity is not required.

Flow:

`TikTok LIVE -> TikTool cloud -> short-lived JWT -> Fighter Arena WebSocket -> FighterArenaBridge`

The local server keeps the TikTool API credential on the server side of the web app and mints a short-lived JWT scoped to the configured TikTok creator. The browser connects to `wss://api.tik.tools` with that JWT.

Connection indicator:
- green dot: TikTool WebSocket connected;
- red dot: disconnected, reconnecting, or username not configured;
- first launch: click the red dot and enter the TikTok username without `@`;
- double-click the dot to change the saved TikTok username;
- the username is saved locally in the browser for later launches.

Recommended LIVE order:
1. Start TikTok LIVE Studio and go LIVE.
2. Open **Fighter Arena WEB SAFE** from the desktop.
3. On the first launch, click the red dot and enter the TikTok LIVE username.
4. Wait for the dot to turn green.
5. Enter the arena and test JOIN/like/follow/gift.

## LIVE event interface
Use `window.FighterArenaBridge.emit(type, payload)`.

Supported event types: `join`, `like`, `follow`, `rose`, `gift`.
Useful payload fields: `userId`, `username`, `count`, `giftName`, `diamondCount`, `repeatCount`.

The TikTool bridge normalizes LIVE `member`, `chat`, `like`, `follow` and `gift` events into the existing Fighter Arena event interface so the game logic does not need to know which LIVE provider is in use.

The game also accepts `postMessage` events with `channel: "tiktok-live"` and `CustomEvent("fighter-arena-event")`.

## Runtime reliability
Fighter atlases and effects are validated before use. The active combat, countdown, idle state and roster gate share the v1.4 core state. The render loop is fail-safe so a single invalid atlas cannot freeze the countdown or the arena. Fake/demo viewers remain restricted to `?demo=1`.
