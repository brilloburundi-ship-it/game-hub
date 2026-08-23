(() => {
  class TikFinityBridge {
    constructor(opts = {}) {
      this.url = opts.url || "ws://localhost:21213/";
      this.onEvent = opts.onEvent || (()=>{});
      this.onStatus = opts.onStatus || (()=>{});
      this.socket = null;
      this.retry = null;
      this.liveRequested = false;
      this.attempt = 0;
    }

    connect() {
      this.liveRequested = true;
      clearTimeout(this.retry);
      try {
        this.onStatus("connecting");
        this.socket = new WebSocket(this.url);
      } catch (err) {
        this.onStatus("error", err);
        this.scheduleReconnect();
        return;
      }
      this.socket.onopen = () => {
        this.attempt = 0;
        this.onStatus("live");
      };
      this.socket.onclose = () => {
        this.onStatus(this.liveRequested ? "offline" : "test");
        if (this.liveRequested) this.scheduleReconnect();
      };
      this.socket.onerror = (err) => this.onStatus("error", err);
      this.socket.onmessage = (msg) => {
        try {
          const packet = JSON.parse(msg.data);
          if (!packet || !packet.event) return;
          this.onEvent(this.normalize(packet));
        } catch (e) {
          console.warn("[TikFinity] malformed packet", e);
        }
      };
    }

    disconnect() {
      this.liveRequested = false;
      clearTimeout(this.retry);
      if (this.socket) {
        try { this.socket.close(); } catch {}
        this.socket = null;
      }
      this.onStatus("test");
    }

    scheduleReconnect() {
      clearTimeout(this.retry);
      const wait = Math.min(12000, 1000 * Math.pow(1.7, this.attempt++));
      this.retry = setTimeout(() => this.connect(), wait);
    }

    normalize(packet) {
      const d = packet.data || {};
      const user = d.uniqueId || d.nickname || d.user?.uniqueId || d.user?.nickname || "viewer";
      const comment = d.comment || d.message || "";
      const giftName = d.giftName || d.gift?.name || "Gift";
      const repeat = Number(d.repeatCount || d.repeatEndCount || 1) || 1;
      const diamondsEach = Number(d.diamondCount || d.gift?.diamondCount || 0) || 0;
      const likeCount = Number(d.likeCount || d.count || 1) || 1;
      return {
        type: String(packet.event),
        user,
        comment: String(comment),
        giftName: String(giftName),
        repeat,
        diamonds: Math.max(0, diamondsEach * repeat),
        likes: Math.max(1, likeCount),
        raw: d
      };
    }

    inject(type, data = {}) {
      this.onEvent({
        type,
        user: data.user || "TestViewer",
        comment: data.comment || "",
        giftName: data.giftName || "Test Gift",
        repeat: data.repeat || 1,
        diamonds: data.diamonds || 0,
        likes: data.likes || 1,
        raw: data
      });
    }
  }

  window.TikFinityBridge = TikFinityBridge;
})();
