# Dominion — Evolving Realms

Browser strategy game prototype: autonomous realm growth, territory expansion, economy, diplomacy and war.

## Play
Open `dominion/index.html` in a browser, or enable GitHub Pages:
1. Repository **Settings → Pages**
2. Select **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)** (if root index exists) or use the path `/dominion` as the site directory by moving/copying the entry HTML to root.
4. The game file is available at: `https://brilloburundi-ship-it.github.io/game-hub/dominion/` after Pages is enabled and published.

The prototype is self-contained (Canvas + vanilla JavaScript), works on desktop and mobile, and stores optional saves in browser localStorage.

## Controls
- Tap/click a tile to select it.
- **Expand** claims adjacent neutral land.
- Farm, mine, barracks, fort: build on owned land.
- Recruit spends gold and food.
- Change AI doctrine; propose alliance or declare war.
- Speed buttons: 1×, 3×, 8×. Pause, pan, zoom, save/reset.

## Notes
This is a single-file prototype. Multiplayer, cloud persistence, deeper pathfinding and balancing are future iterations.
