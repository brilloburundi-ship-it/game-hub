# Fighter Arena — Cloud LIVE Bridge

The hosted Fighter Arena can receive TikTok LIVE events directly from a managed cloud WebSocket, without TikFinity Desktop or the local PC bridge.

## First activation

Open the normal hosted Fighter Arena URL once with the TikTok creator handle:

```text
?liveUser=YOUR_TIKTOK_USERNAME
```

Example:

```text
.../tiktok-fighter-arena/?liveUser=creator_name
```

Use the TikTok username without `@`. The game stores it locally in `fighter_arena_live_user`, so following launches on that browser/device use the cloud bridge automatically.

Aliases accepted: `liveUser`, `tiktokUser`, `creator`.

## Runtime path

```text
TikTok LIVE -> Tik.Tools managed edge -> wss://api.tik.tools -> Fighter Arena -> FighterArenaBridge.emit(...)
```

`live-bridge.js` requests a short-lived browser token from `https://tik.tools/api/live/connect`, opens the managed WebSocket, normalizes the events, queues them until the game runtime is ready, then emits the same internal Fighter Arena events already used by the existing bridge.

Supported cloud events:

- chat/comment -> `join`
- member/enter -> `join`
- like -> `like`
- follow -> `follow`
- gift -> `gift`
- roomUser/viewer count -> status-only
- leave/exit -> `leave`

Gift transactions are de-duplicated so combo updates do not apply the same gift twice.

## Reconnect behavior

The cloud bridge automatically requests a fresh short-lived token after a disconnect and reconnects with bounded backoff. Returning Safari/iPhone to the foreground also triggers a reconnect when necessary.

## Local fallback

The previous `lan-bridge.js` remains unchanged. If no cloud username has been configured, Fighter Arena loads the existing LAN/TikFinity bridge instead.

Force the old local bridge for a session with either:

```text
?bridge=local
```

or:

```text
?cloudBridge=0
```

This keeps the current TikFinity/PC path available for diagnostics without mixing it with the cloud event stream.

## Security

No long-lived Tik.Tools API key is stored in Fighter Arena. The browser receives a short-lived scoped JWT from the frontend connection endpoint and sends only that token to the WebSocket gateway.
