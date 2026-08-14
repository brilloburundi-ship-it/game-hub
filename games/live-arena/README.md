# Live Arena

TikTok LIVE 2.5D isometric auto-battler.

## Live event contract

The runtime exposes:

```js
window.ArenaLiveBridge.emit(type, payload)
```

Supported event types:
- `join` / `enter` / `viewerEnter`
- `like`
- `giftSmall`
- `giftMedium`
- `giftLarge`
- `gift` with `payload.tier`

Example payload:

```js
{ userId: "123", username: "viewer_name", count: 10 }
```

Rules:
- one fighter per `userId`;
- joins spawn a fighter;
- likes heal the matching fighter;
- gifts permanently improve stats and visible evolution aura;
- fighters auto-target, move, attack, take hits, die and respawn.

## Sprite runtime

The character uses six normalized atlases in `assets/`:
`idle`, `walk`, `attack`, `hit`, `dead`, `vfx`.

Direction row order is:
`N, NW, W, SW, S, SE, E, NE`.

Frames were normalized to stable cells and bottom-center anchors so animation state changes do not jump on screen.
