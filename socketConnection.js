import { ensureNeoHsLibLoaded } from "./neoHslibLoader.js";

const DEFAULT_SOCKET_URL = "wss://mlhsm.kotaksecurities.com";
const DEFAULT_CHANNEL = 1;
const HANDSHAKE_SETTLE_MS = 1000;

function normalizeScrips(input) {
  if (!input) {
    return "";
  }

  if (Array.isArray(input)) {
    return input.filter(Boolean).join("&");
  }

  return String(input).trim();
}

export class LiveFeedClient {
  constructor({
    token = process.env.NEO_SOCKET_TOKEN,
    sid = process.env.NEO_SOCKET_SID,
    url = process.env.NEO_SOCKET_URL || DEFAULT_SOCKET_URL,
    channelNumber = DEFAULT_CHANNEL
  } = {}) {
    if (!token) {
      throw new Error("Missing NEO_SOCKET_TOKEN in environment");
    }

    if (!sid) {
      throw new Error("Missing NEO_SOCKET_SID in environment");
    }

    this.token = token;
    this.sid = sid;
    this.url = url;
    this.channelNumber = channelNumber;
    this.socket = null;
    this.subscriptions = new Map();
    this.handlers = {
      open: new Set(),
      message: new Set(),
      parsed: new Set(),
      error: new Set(),
      close: new Set()
    };
  }

  on(eventName, handler) {
    if (!this.handlers[eventName]) {
      throw new Error(`Unsupported event: ${eventName}`);
    }

    this.handlers[eventName].add(handler);
    return () => this.handlers[eventName].delete(handler);
  }

  emit(eventName, payload) {
    for (const handler of this.handlers[eventName] || []) {
      handler(payload);
    }
  }

  isConnected() {
    return this.socket?.readyState === 1;
  }

  connect() {
    if (this.isConnected()) {
      return this.socket;
    }

    try {
      const HSWebSocket = ensureNeoHsLibLoaded();
      
      if (!HSWebSocket) {
        throw new Error("HSWebSocket library failed to load - returned null");
      }

      this.socket = new HSWebSocket(this.url);

      if (!this.socket) {
        throw new Error("Failed to create HSWebSocket instance");
      }
    } catch (error) {
      throw new Error(`Socket setup failed: ${error.message}`);
    }

    this.socket.onopen = () => {
      this.socket.send(JSON.stringify({
        Authorization: this.token,
        Sid: this.sid,
        type: "cn"
      }));

      this.emit("open");

      setTimeout(() => {
        this.flushSubscriptions();
      }, HANDSHAKE_SETTLE_MS);
    };

    this.socket.onmessage = (data) => {
      this.emit("message", data);

      try {
        this.emit("parsed", JSON.parse(data));
      } catch {
        this.emit("parsed", data);
      }
    };

    this.socket.onerror = (event) => {
      this.emit("error", event);
    };

    this.socket.onclose = (event) => {
      this.emit("close", event);
    };

    return this.socket;
  }

  disconnect(code = 1000, reason = "Client disconnect") {
    if (this.socket && this.socket.readyState < 2) {
      this.socket.close(code, reason);
    }
  }

  subscribe(type, scrips, channelNumber = this.channelNumber) {
    const normalizedScrips = normalizeScrips(scrips);

    if (!normalizedScrips) {
      throw new Error("Subscribe requires at least one scrip");
    }

    const key = `${type}:${channelNumber}:${normalizedScrips}`;
    const payload = {
      type,
      scrips: normalizedScrips,
      channelnum: channelNumber
    };

    this.subscriptions.set(key, payload);
    this.sendWhenConnected(payload);
    return payload;
  }

  unsubscribe(type, scrips, channelNumber = this.channelNumber) {
    const normalizedScrips = normalizeScrips(scrips);

    if (!normalizedScrips) {
      throw new Error("Unsubscribe requires at least one scrip");
    }

    const key = `${type}:${channelNumber}:${normalizedScrips}`;
    this.subscriptions.delete(key);

    const payload = {
      type: `u${type}`,
      scrips: normalizedScrips,
      channelnum: channelNumber
    };

    this.sendWhenConnected(payload);
    return payload;
  }

  subscribeScrips(scrips, channelNumber = this.channelNumber) {
    return this.subscribe("mws", scrips, channelNumber);
  }

  unsubscribeScrips(scrips, channelNumber = this.channelNumber) {
    return this.unsubscribe("mws", scrips, channelNumber);
  }

  subscribeIndices(scrips, channelNumber = this.channelNumber) {
    return this.subscribe("ifs", scrips, channelNumber);
  }

  unsubscribeIndices(scrips, channelNumber = this.channelNumber) {
    return this.unsubscribe("ifs", scrips, channelNumber);
  }

  subscribeDepth(scrips, channelNumber = this.channelNumber) {
    return this.subscribe("dps", scrips, channelNumber);
  }

  unsubscribeDepth(scrips, channelNumber = this.channelNumber) {
    return this.unsubscribe("dps", scrips, channelNumber);
  }

  flushSubscriptions() {
    for (const payload of this.subscriptions.values()) {
      this.send(payload);
    }
  }

  sendWhenConnected(payload) {
    if (this.isConnected()) {
      this.send(payload);
    }
  }

  send(payload) {
    if (!this.isConnected()) {
      throw new Error("Socket is not connected");
    }

    this.socket.send(JSON.stringify(payload));
  }
}

export function createLiveFeedClient(options) {
  return new LiveFeedClient(options);
}
