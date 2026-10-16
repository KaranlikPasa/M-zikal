const net = require('net');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CONFIG_FILE = path.join(__dirname, 'data', 'discord_config.json');

class DiscordRpcManager {
  constructor() {
    this.clientId = '';
    this.enabled = true;
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.currentActivity = null;
    this.pipeId = 0;

    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.clientId = data.clientId || '';
        this.enabled = data.enabled !== undefined ? !!data.enabled : true;
      }
    } catch (e) {
      console.error('[Discord RPC] Config read error:', e);
    }
  }

  saveConfig() {
    try {
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({
        clientId: this.clientId,
        enabled: this.enabled
      }, null, 2), 'utf8');
    } catch (e) {
      console.error('[Discord RPC] Config write error:', e);
    }
  }

  updateConfig({ clientId, enabled }) {
    let changed = false;
    if (clientId !== undefined && clientId !== this.clientId) {
      this.clientId = String(clientId).trim();
      changed = true;
    }
    if (enabled !== undefined && enabled !== this.enabled) {
      this.enabled = !!enabled;
      changed = true;
    }
    if (changed) {
      this.saveConfig();
      if (!this.enabled || !this.clientId) {
        this.disconnect();
      } else {
        this.disconnect();
        this.connect();
      }
    }
    return this.getStatus();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      clientId: this.clientId,
      connected: this.connected,
      hasActivity: !!this.currentActivity
    };
  }

  connect() {
    if (!this.enabled || !this.clientId) return;
    if (this.socket) return;

    this.pipeId = 0;
    this.tryConnectPipe(0);
  }

  tryConnectPipe(id) {
    if (id > 9) {
      // Could not find an active Discord pipe, schedule retry
      this.scheduleReconnect(15000);
      return;
    }

    const pipePath = process.platform === 'win32'
      ? `\\\\.\\pipe\\discord-ipc-${id}`
      : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp', `discord-ipc-${id}`);

    const sock = net.createConnection(pipePath, () => {
      this.socket = sock;
      this.pipeId = id;
      this.sendHandshake();
    });

    sock.once('error', () => {
      sock.destroy();
      this.tryConnectPipe(id + 1);
    });

    sock.on('data', (buf) => this.handleData(buf));

    sock.on('close', () => {
      this.socket = null;
      this.connected = false;
      this.scheduleReconnect(10000);
    });
  }

  scheduleReconnect(delayMs = 10000) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!this.enabled || !this.clientId) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.socket && this.enabled && this.clientId) {
        this.connect();
      }
    }, delayMs);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.clearActivity();
      } catch (e) {}
      try {
        this.socket.destroy();
      } catch (e) {}
      this.socket = null;
    }
    this.connected = false;
    this.currentActivity = null;
  }

  sendPacket(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      const json = JSON.stringify(payload);
      const len = Buffer.byteLength(json);
      const header = Buffer.alloc(8);
      header.writeInt32LE(opcode, 0);
      header.writeInt32LE(len, 4);
      this.socket.write(header);
      this.socket.write(json);
    } catch (e) {
      console.error('[Discord RPC] Send packet error:', e);
    }
  }

  sendHandshake() {
    this.sendPacket(0, {
      v: 1,
      client_id: this.clientId
    });
  }

  handleData(buf) {
    if (buf.length < 8) return;
    try {
      const op = buf.readInt32LE(0);
      const len = buf.readInt32LE(4);
      const bodyStr = buf.slice(8, 8 + len).toString('utf8');
      const body = JSON.parse(bodyStr);

      if (op === 1 && body.cmd === 'DISPATCH' && body.evt === 'READY') {
        this.connected = true;
        console.log(`[Discord RPC] Connected to Discord as client ${this.clientId}`);
        // Restore last known activity if any
        if (this.currentActivity) {
          this.setActivity(this.currentActivity);
        }
      } else if (op === 2) {
        // Error from Discord (e.g. Invalid Client ID)
        console.warn('[Discord RPC] Received error from Discord:', body);
        this.connected = false;
      }
    } catch (e) {
      console.error('[Discord RPC] Parse error:', e);
    }
  }

  /**
   * Set currently playing song activity
   * @param {Object} data - { title, artist, duration, currentTime, isPlaying, thumbnail }
   */
  setActivity(data) {
    if (!data || !data.title) {
      this.clearActivity();
      return;
    }

    this.currentActivity = data;

    if (!this.connected || !this.socket) {
      if (this.enabled && this.clientId && !this.reconnectTimer) {
        this.connect();
      }
      return;
    }

    const title = (data.title || 'Müzik').substring(0, 128);
    const artist = (data.artist || 'Müzikal').substring(0, 128);
    const durationSec = Math.max(0, parseInt(data.duration, 10) || 0);
    const currentSec = Math.max(0, parseInt(data.currentTime, 10) || 0);
    const isPlaying = !!data.isPlaying;

    const activity = {
      type: 2, // 2 = LISTENING ("Listening to ...")
      details: title,
      state: `Sanatçı: ${artist}`,
      assets: {
        large_image: (data.thumbnail && typeof data.thumbnail === 'string' && data.thumbnail.startsWith('http'))
          ? data.thumbnail
          : 'https://raw.githubusercontent.com/KaranlikPasa/M-zikal/main/public/logo.png',
        large_text: title,
        small_image: 'https://raw.githubusercontent.com/KaranlikPasa/M-zikal/main/public/logo.png',
        small_text: isPlaying ? 'Müzikal PRO' : 'Duraklatıldı'
      }
    };

    if (isPlaying) {
      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = Math.max(0, nowSec - currentSec);
      activity.timestamps = {
        start: startSec
      };
      if (durationSec > 0 && durationSec > currentSec) {
        activity.timestamps.end = startSec + durationSec;
      }
    }

    activity.buttons = [
      {
        label: "Müzikal'de Dinle",
        url: "https://github.com/KaranlikPasa/M-zikal"
      }
    ];

    this.sendPacket(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity
      },
      nonce: crypto.randomUUID()
    });
  }

  clearActivity() {
    this.currentActivity = null;
    if (!this.connected || !this.socket) return;

    this.sendPacket(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: null
      },
      nonce: crypto.randomUUID()
    });
  }
}

module.exports = new DiscordRpcManager();
