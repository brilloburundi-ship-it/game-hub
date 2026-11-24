# Kingdom War 2

Independent sequel to Kingdom War at the permanent Game Hub path `games/kingdom-war-2/`.

## What changed

- All previous citizen and military character art was removed from this project.
- Farmers and workers use the supplied MiniFolks Villagers sprites.
- Armies use the supplied MiniFolks Humans sprites.
- Eight MiniFolks Forest Animal species roam across valid map terrain.
- Farmer/worker clothing and every military sprite replace only the exact source team mask (`#6098E8` / `#4058C0`) with the kingdom palette. Skin, metal and wildlife colors remain unchanged.
- Decorative villagers live inside active kingdoms without procedural overlays.

The original `games/tiktok-god-world-v8-mobile/` project remains unchanged.

## Local Safari + TikFinity bridge

Run `AVVIA_SAFARI_TIKFINITY.bat`. Kingdom War 2 uses port `8794` and a separate local token folder. The generated `URL_IPHONE.txt` is local-only and ignored by Git.

## Credits

MiniFolks Villagers, Humans and Forest Animals by LYASeeK. Asset credit is appreciated by the author and included here; the supplied assets must not be resold by themselves.

## 10.0 Living civilizations

The peace-only entry point is no longer loaded. `kw2-civilization-war.js` owns the military simulation; `kw2-fortifications.js` owns progressive construction, reserved capital sites and faction-coloured gates. Automatic wars require 120 simulation seconds of development for each side; the test ATTACK control can start a reachable non-allied matchup immediately. One war at a time, 96 soldiers per side on desktop and 44 on coarse-pointer devices, with lower recruitment limits at low FPS. Active armies use individual routes, physical combat, finite reserves and battlefield occupation. The original TikFinity bridge remains unchanged (8794). Normal economy and assets are preserved; working citizens contribute to production and troops consume food. This release does not introduce naval wars or a fully physical supply-chain system.
