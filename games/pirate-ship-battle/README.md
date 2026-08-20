# Pirate Ship Battle

Lightweight horizontal 16:9 TikTok LIVE pirate auto-battle.

## V1 gameplay
- `JOIN` creates a viewer ship with a visible username and unique color.
- Ships roam and fight automatically using lightweight Canvas 2D logic.
- HP loss is visible through smoke/fire; destroyed ships sink and respawn.
- Likes repair, Follow boosts HP/speed and grants a shield, Roses level up, and Gift tiers add stronger firepower/rapid fire/broadside/legendary boosts.
- Five-minute rounds track the top captains by kills.
- Test controls can spawn viewers and stress-test extra bots without TikTok LIVE.

## Live bridge API
The page exposes `window.PirateLive`:
- `PirateLive.join(username)`
- `PirateLive.like(username, count)`
- `PirateLive.follow(username)`
- `PirateLive.rose(username)`
- `PirateLive.gift(username, tier)` where tier is 1–4

It also accepts `window.postMessage` objects with `type`, `username`, plus optional `count` or `tier`.

## Assets
The ship sprite is from Kenney's Pirate Pack, licensed CC0.
