// ==============================================================================
// Müzikal - Linux PipeWire & PulseAudio Link Preserver & Discord Ses Köprüsü
// ==============================================================================
// Linux sistemlerinde şarkı değiştiğinde veya akış (stream) yenilendiğinde
// WebKit / GStreamer ses motoru kapatılıp yeniden açılır. Bu esnada PipeWire
// node'u ve qpwgraph / Helvum / patchbay üzerinden Discord veya harici
// uygulamalara (WEBRTC VoiceEngine, OBS vb.) çekilen ses kabloları kopar.
//
// Bu modül:
// 1. PipeWire üzerindeki Müzikal ses çıkışlarını (output_FL / FR) izler.
// 2. Kullanıcının patchbay'den yaptığı ya da doğrudan Discord'a bağladığı
//    tüm özel ses yönlendirmelerini hafızada tutar.
// 3. Şarkı bitip yeni şarkı başladığında (< 25ms içinde) bağlantıları
//    otomatik olarak yeniden bağlayarak kesintisiz yayın sağlar.
// 4. Kullanıcı qpwgraph üzerinden kabloyu elle silerse bunu algılar ve
//    bağlantıyı zorla yeniden kurmayarak kullanıcı kararına saygı duyar.
// 5. Discord ses kanalına tek tıkla doğrudan ses aktarımı (Voice Bridge) sunar.
// ==============================================================================

const { execSync, spawn } = require('child_process');

class PipeWirePreserver {
  constructor() {
    this.isLinux = process.platform === 'linux';
    this.available = false;
    this.savedTargets = {
      FL: new Set(),
      FR: new Set()
    };
    this.discordVoicePorts = { fl: null, fr: null };
    this.discordBridgeEnabled = false;
    this.lastPorts = { fl: null, fr: null };
    this.wasActive = false;
    this.monitorProc = null;
    this.pollTimer = null;
    this.syncDebounceTimer = null;

    if (this.isLinux) {
      this.checkAvailability();
    }
  }

  checkAvailability() {
    try {
      execSync('which pw-link', { stdio: 'ignore' });
      this.available = true;
    } catch (e) {
      this.available = false;
    }
    return this.available;
  }

  findMuzikalPorts() {
    if (!this.available) return { fl: null, fr: null };
    try {
      const out = execSync('pw-link -o', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 });
      let fl = null, fr = null;
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (/zikal/i.test(trimmed)) {
          if (trimmed.endsWith(':output_FL') || trimmed.endsWith(':output_0') || trimmed.includes('output_FL')) {
            fl = trimmed;
          } else if (trimmed.endsWith(':output_FR') || trimmed.endsWith(':output_1') || trimmed.includes('output_FR')) {
            fr = trimmed;
          }
        }
      }
      return { fl, fr };
    } catch (e) {
      return { fl: null, fr: null };
    }
  }

  findDiscordPorts() {
    if (!this.available) return { fl: null, fr: null };
    try {
      const out = execSync('pw-link -i', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 });
      let fl = null, fr = null;
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (/WEBRTC VoiceEngine/i.test(trimmed) || /discord/i.test(trimmed)) {
          if (trimmed.endsWith(':input_FL') || trimmed.endsWith(':input_0') || trimmed.includes('input_FL')) {
            fl = trimmed;
          } else if (trimmed.endsWith(':input_FR') || trimmed.endsWith(':input_1') || trimmed.includes('input_FR')) {
            fr = trimmed;
          }
        }
      }
      return { fl, fr };
    } catch (e) {
      return { fl: null, fr: null };
    }
  }

  getAllInputPorts() {
    if (!this.available) return new Set();
    try {
      const out = execSync('pw-link -i', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 });
      const ports = new Set();
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) ports.add(trimmed);
      }
      return ports;
    } catch (e) {
      return new Set();
    }
  }

  getCurrentLinks() {
    if (!this.available) return new Map();
    try {
      const out = execSync('pw-link -l', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 });
      const links = new Map();
      let currentSrc = null;
      for (const line of out.split('\n')) {
        if (!line) continue;
        if (!line.startsWith(' ')) {
          currentSrc = line.trim();
          if (!links.has(currentSrc)) links.set(currentSrc, []);
        } else if (currentSrc && line.includes('|->')) {
          const dst = line.split('|->')[1].trim();
          links.get(currentSrc).push(dst);
        }
      }
      return links;
    } catch (e) {
      return new Map();
    }
  }

  sync() {
    if (!this.available) return;

    const muzikalPorts = this.findMuzikalPorts();
    const discordPorts = this.findDiscordPorts();
    this.discordVoicePorts = discordPorts;

    // Explicit Discord Bridge toggle active: ensure Discord ports are queued for linking
    if (this.discordBridgeEnabled) {
      if (discordPorts.fl) this.savedTargets.FL.add(discordPorts.fl);
      if (discordPorts.fr) this.savedTargets.FR.add(discordPorts.fr);
    }

    const hasMuzikal = !!(muzikalPorts.fl && muzikalPorts.fr);
    const links = this.getCurrentLinks();
    const allInputs = this.getAllInputPorts();

    if (hasMuzikal) {
      const currentFL = new Set(links.get(muzikalPorts.fl) || []);
      const currentFR = new Set(links.get(muzikalPorts.fr) || []);

      // 1. Detect user manual disconnection in qpwgraph while stream was running:
      if (this.wasActive && this.lastPorts.fl === muzikalPorts.fl && this.lastPorts.fr === muzikalPorts.fr) {
        for (const t of Array.from(this.savedTargets.FL)) {
          if (!currentFL.has(t)) {
            this.savedTargets.FL.delete(t);
            if (this.discordBridgeEnabled && discordPorts.fl === t) {
              this.discordBridgeEnabled = false;
            }
          }
        }
        for (const t of Array.from(this.savedTargets.FR)) {
          if (!currentFR.has(t)) {
            this.savedTargets.FR.delete(t);
            if (this.discordBridgeEnabled && discordPorts.fr === t) {
              this.discordBridgeEnabled = false;
            }
          }
        }
      }

      // 2. Discover new patchbay links:
      for (const t of currentFL) {
        this.savedTargets.FL.add(t);
        if (discordPorts.fl && t === discordPorts.fl) {
          this.discordBridgeEnabled = true;
        }
      }
      for (const t of currentFR) {
        this.savedTargets.FR.add(t);
        if (discordPorts.fr && t === discordPorts.fr) {
          this.discordBridgeEnabled = true;
        }
      }

      // 3. Immediately restore any missing targets (especially after track changes):
      for (const t of this.savedTargets.FL) {
        if (!currentFL.has(t) && allInputs.has(t)) {
          try {
            execSync(`pw-link "${muzikalPorts.fl}" "${t}"`, { stdio: 'ignore', timeout: 1000 });
          } catch (e) {}
        }
      }
      for (const t of this.savedTargets.FR) {
        if (!currentFR.has(t) && allInputs.has(t)) {
          try {
            execSync(`pw-link "${muzikalPorts.fr}" "${t}"`, { stdio: 'ignore', timeout: 1000 });
          } catch (e) {}
        }
      }

      this.lastPorts = muzikalPorts;
      this.wasActive = true;
    } else {
      // Audio stream is temporarily closed (track transition / pause)
      // We keep this.savedTargets intact so the new song gets instantly re-linked!
      this.wasActive = false;
    }
  }

  startMonitoring() {
    if (!this.available || this.monitorProc) return;

    try {
      this.monitorProc = spawn('pw-link', ['-l', '-m']);
      this.monitorProc.stdout.on('data', () => {
        if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
        this.syncDebounceTimer = setTimeout(() => {
          this.sync();
        }, 35);
      });

      this.monitorProc.on('error', () => {
        this.monitorProc = null;
      });

      this.monitorProc.on('exit', () => {
        this.monitorProc = null;
        setTimeout(() => {
          if (!this.monitorProc && this.available) this.startMonitoring();
        }, 2000);
      });
    } catch (e) {
      this.monitorProc = null;
    }
  }

  start() {
    if (!this.available) return;
    this.sync();
    this.startMonitoring();
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        this.sync();
      }, 500);
    }
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
    if (this.monitorProc) {
      try { this.monitorProc.kill('SIGTERM'); } catch (e) {}
      this.monitorProc = null;
    }
  }

  setDiscordBridge(enable) {
    if (!this.available) return { success: false, reason: 'PipeWire ses sunucusu veya pw-link aracı bulunamadı.' };
    const discordPorts = this.findDiscordPorts();
    this.discordVoicePorts = discordPorts;

    if (enable) {
      if (!discordPorts.fl || !discordPorts.fr) {
        return {
          success: false,
          reason: 'Discord ses girişi (WEBRTC VoiceEngine) bulunamadı. Discord uygulamasının açık ve bir ses kanalına bağlı olduğundan emin olun.'
        };
      }
      this.discordBridgeEnabled = true;
      this.savedTargets.FL.add(discordPorts.fl);
      this.savedTargets.FR.add(discordPorts.fr);
      this.sync();
      return { success: true, enabled: true };
    } else {
      this.discordBridgeEnabled = false;
      if (discordPorts.fl) this.savedTargets.FL.delete(discordPorts.fl);
      if (discordPorts.fr) this.savedTargets.FR.delete(discordPorts.fr);

      const muzikalPorts = this.findMuzikalPorts();
      if (muzikalPorts.fl && discordPorts.fl) {
        try { execSync(`pw-link -d "${muzikalPorts.fl}" "${discordPorts.fl}"`, { stdio: 'ignore' }); } catch (e) {}
      }
      if (muzikalPorts.fr && discordPorts.fr) {
        try { execSync(`pw-link -d "${muzikalPorts.fr}" "${discordPorts.fr}"`, { stdio: 'ignore' }); } catch (e) {}
      }
      return { success: true, enabled: false };
    }
  }

  getStatus() {
    const muzikalPorts = this.findMuzikalPorts();
    const discordPorts = this.findDiscordPorts();
    const links = this.getCurrentLinks();

    const isFLConnected = !!(muzikalPorts.fl && discordPorts.fl && (links.get(muzikalPorts.fl) || []).includes(discordPorts.fl));
    const isFRConnected = !!(muzikalPorts.fr && discordPorts.fr && (links.get(muzikalPorts.fr) || []).includes(discordPorts.fr));

    return {
      isLinux: this.isLinux,
      available: this.available,
      muzikalActive: !!(muzikalPorts.fl && muzikalPorts.fr),
      muzikalPorts,
      discordVoiceDetected: !!(discordPorts.fl && discordPorts.fr),
      discordPorts,
      discordBridgeEnabled: this.discordBridgeEnabled || (isFLConnected && isFRConnected),
      savedTargets: {
        FL: Array.from(this.savedTargets.FL),
        FR: Array.from(this.savedTargets.FR)
      }
    };
  }
}

const instance = new PipeWirePreserver();
module.exports = instance;
