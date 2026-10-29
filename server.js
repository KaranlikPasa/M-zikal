const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns');
const { spawn } = require('child_process');
const discordRpc = require('./discord-rpc');

// Force IPv4 first to avoid connection timeouts on Windows
dns.setDefaultResultOrder('ipv4first');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;
const APP_VERSION = '1.4.6';
const APP_VERSION_CODE = 28;
const isLinux = process.platform === 'linux';
const isWin = process.platform === 'win32';

// Resolve writable data directory (XDG compliant on Linux / system installs)
function resolveDataDir() {
  if (isLinux) {
    try {
      const localData = path.join(__dirname, 'data');
      if (!fs.existsSync(localData)) fs.mkdirSync(localData, { recursive: true });
      fs.accessSync(localData, fs.constants.W_OK);
      return localData;
    } catch (e) {
      const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      const xdgMuzikal = path.join(xdgData, 'muzikal', 'data');
      if (!fs.existsSync(xdgMuzikal)) fs.mkdirSync(xdgMuzikal, { recursive: true });
      return xdgMuzikal;
    }
  }
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Resolve music download directory (XDG Music on Linux, local or Music folder)
function resolveDownloadsDir() {
  if (isLinux) {
    try {
      const localDown = path.join(__dirname, 'downloads');
      if (!fs.existsSync(localDown)) fs.mkdirSync(localDown, { recursive: true });
      fs.accessSync(localDown, fs.constants.W_OK);
      return localDown;
    } catch (e) {
      const musicDir = path.join(os.homedir(), 'Music', 'Muzikal');
      if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
      return musicDir;
    }
  }
  const dir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Find yt-dlp executable (system PATH or local bin)
function resolveYtDlpPath() {
  if (isWin) {
    const local = path.join(__dirname, 'bin', 'yt-dlp.exe');
    if (fs.existsSync(local)) return local;
    return 'yt-dlp.exe';
  } else {
    const candidates = [
      path.join(__dirname, 'bin', 'yt-dlp'),
      '/usr/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/bin/yt-dlp'
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return 'yt-dlp';
  }
}

function isYtDlpReady() {
  const p = resolveYtDlpPath();
  if (path.isAbsolute(p)) {
    return fs.existsSync(p);
  }
  return true;
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = resolveDataDir();
const DATA_FILE = path.join(DATA_DIR, 'library.json');
const DOWNLOADS_DIR = resolveDownloadsDir();
const BIN_DIR = path.join(__dirname, 'bin');
const YT_DLP_PATH = resolveYtDlpPath();
const APK_FILE = path.join(__dirname, 'Muzikal.apk');
const USERS_DIR = path.join(DATA_DIR, 'users');

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

function getUserFilePath(email) {
  const safe = (email || 'guest').toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '_');
  return path.join(USERS_DIR, `${safe}.json`);
}

function readUserData(email) {
  try {
    const f = getUserFilePath(email);
    if (fs.existsSync(f)) {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading user data:', e);
  }
  return null;
}

function writeUserData(email, data) {
  try {
    const f = getUserFilePath(email);
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing user data:', e);
    return false;
  }
}

// In-memory cache for search queries (15 minutes TTL)
const searchCache = new Map();
const lyricsCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

// Download status tracker
const activeDownloads = new Map(); // songId -> { status: 'downloading'|'done'|'error', progress: 0, title: '' }

// Preset explore categories (constantly updated modern hit queries)
const EXPLORE_GENRES = {
  'trendler': 'netd müzik yeni klipler official',
  'turkce-pop': 'türkçe pop yeni çıkanlar hit şarkılar official video',
  'turkce-rap': 'türkçe rap yeni çıkanlar official video hip hop',
  'rock': 'türkçe rock yeni ve hit şarkılar official audio',
  'akustik': 'türkçe akustik canlı performans yeni',
  'lofi': 'lofi hip hop radio beats to relax study to',
  'global': 'billboard hot 100 global top hits official music video'
};

// Helper to read library
function readLibrary() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { favorites: [], playlists: [], history: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading library:', e);
    return { favorites: [], playlists: [], history: [] };
  }
}

// Helper to write library
function writeLibrary(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing library:', e);
    return false;
  }
}

// Get list of downloaded track IDs
function getDownloadedTrackIds() {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) return [];
    const files = fs.readdirSync(DOWNLOADS_DIR);
    return files
      .filter(f => f.endsWith('.m4a') || f.endsWith('.mp3'))
      .map(f => path.basename(f, path.extname(f)));
  } catch (e) {
    return [];
  }
}

// Helper to parse duration string (e.g., "3:45" or "1:05:20") into total seconds
function parseDurationSecs(durStr) {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  } else if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

// Strict music search sanitization: filters out gaming, twitch, vlogs, reactions, trailers, and marathon mixes
function isGenuineMusicVideo(title, channel, duration, query = '') {
  const qLower = (query || '').toLowerCase();
  const tLower = (title || '').toLowerCase();
  const cLower = (channel || '').toLowerCase();

  // Allow long sets if user explicitly searched for mix, set, album, podcast
  const allowLong = /\b(mix|set|albüm|album|podcast|full|saat|disko)\b/i.test(qLower);
  const durSecs = parseDurationSecs(duration);

  // Exclude marathon videos > 13 minutes (780s) unless explicitly asked for mixes
  if (!allowLong && durSecs > 780) {
    return false;
  }
  // Exclude short teasers / intros (< 30s)
  if (durSecs > 0 && durSecs < 30) {
    return false;
  }

  // Blacklist gaming videos, vlogs, reactions, trailers, film/dizi clips
  const blacklist = [
    'gameplay', 'lets play', "let's play", 'walkthrough', 'oyun', 'oyunlar', 'gamer',
    'pubg', 'valorant', 'fortnite', 'minecraft', 'gta 5', 'gta v', 'roblox', 'brawl stars',
    'twitch', 'canlı yayın', 'tepki', 'reaction', 'vlog', 'bölüm', 'fragman', 'trailer',
    'dizi', 'film izle', 'özet', 'full izle', 'shorts', 'takas', 'iphone', 'kutu açılımı',
    'challenge', 'satın aldım', 'gün 1', 'gün 2', 'röportaj', 'podcast'
  ];

  for (const word of blacklist) {
    if (!qLower.includes(word)) {
      const regex = new RegExp(`(^|[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ])${word}([^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]|$)`, 'i');
      if (regex.test(tLower) || regex.test(cLower)) {
        return false;
      }
    }
  }

  return true;
}

// YouTube search scraper
async function searchYouTube(query) {
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // sp filter: Videos only
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  const html = await res.text();
  const marker = 'var ytInitialData = ';
  const idx = html.indexOf(marker);
  if (idx === -1) {
    return await searchYouTubeInnerTube(query);
  }

  const jsonStart = idx + marker.length;
  const jsonEnd = html.indexOf(';</script>', jsonStart);
  if (jsonEnd === -1) {
    return await searchYouTubeInnerTube(query);
  }

  const jsonStr = html.substring(jsonStart, jsonEnd);
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON parse error from YouTube search:', e);
    return await searchYouTubeInnerTube(query);
  }

  const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const results = [];
  const seenIds = new Set();

  for (const sec of sections) {
    const items = sec.itemSectionRenderer?.contents || [];
    for (const it of items) {
      const v = it.videoRenderer;
      if (v && v.videoId && !seenIds.has(v.videoId)) {
        seenIds.add(v.videoId);

        let thumbnail = '';
        if (v.thumbnail?.thumbnails?.length) {
          thumbnail = v.thumbnail.thumbnails[v.thumbnail.thumbnails.length - 1].url;
        }

        const title = v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || 'Bilinmeyen Başlık';
        const channel = v.ownerText?.runs?.map(r => r.text).join('') || 'Bilinmeyen Sanatçı';
        const duration = v.lengthText?.simpleText || '';

        // Filter out non-music, gaming, vlogs, and marathon mixes
        if (!isGenuineMusicVideo(title, channel, duration, query)) {
          continue;
        }

        results.push({
          id: v.videoId,
          title: title.trim(),
          channel: channel.trim(),
          duration: duration,
          thumbnail: thumbnail
        });
      }
    }
  }

  if (results.length === 0) {
    return await searchYouTubeInnerTube(query);
  }

  searchCache.set(query, { timestamp: Date.now(), results });
  return results;
}

// YouTube InnerTube JSON API (Direct fallback, fast & resilient)
async function searchYouTubeInnerTube(query) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240101.00.00',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'tr',
            gl: 'TR'
          }
        },
        query: query,
        params: 'EgIQAQ%3D%3D'
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const results = [];
    const seenIds = new Set();
    for (const sec of sections) {
      const items = sec.itemSectionRenderer?.contents || [];
      for (const it of items) {
        const v = it.videoRenderer;
        if (v && v.videoId && !seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          let thumbnail = '';
          if (v.thumbnail?.thumbnails?.length) {
            thumbnail = v.thumbnail.thumbnails[v.thumbnail.thumbnails.length - 1].url;
          }
          const title = v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || 'Bilinmeyen Başlık';
          const channel = v.ownerText?.runs?.map(r => r.text).join('') || 'Bilinmeyen Sanatçı';
          const duration = v.lengthText?.simpleText || '';

          // Filter out non-music, gaming, vlogs, and marathon mixes
          if (!isGenuineMusicVideo(title, channel, duration, query)) {
            continue;
          }

          results.push({
            id: v.videoId,
            title: title.trim(),
            channel: channel.trim(),
            duration: duration,
            thumbnail: thumbnail
          });
        }
      }
    }
    if (results.length > 0) {
      searchCache.set(query, { timestamp: Date.now(), results });
    }
    return results;
  } catch (e) {
    console.error('InnerTube search error:', e);
    return [];
  }
}

// --- SMART RECOMMENDATIONS, OLLAMA AI & ARTIST DIVERSITY ENGINE ---

function normalizeTr(str) {
  if (!str) return '';
  return String(str)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\blevel\b/g, 'lvbel')
    .replace(/\bblok\s*3\b/g, 'blok3')
    .replace(/\blvbel\s*c\s*5\b/g, 'lvbel c5')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLabelNoise(str) {
  if (!str) return '';
  return String(str)
    .replace(/\s*-\s*topic\b/gi, '')
    .replace(/[\(\[][^\)\]]*(?:official|video|klip|audio|lyric|lyrics|sözleri|hd|4k|hq|remastered|visualizer|uhd|mv|prod|feat|ft)[^\)\]]*[\)\]]/gi, '')
    .replace(/\b(?:netd\s*müzik|netd\s*muzik|doğulu\s*music|dogulu\s*music|dmc|poll\s*production|sony\s*music(?:\s*türkiye)?|universal\s*music(?:\s*türkiye)?|warner\s*music|avrupa\s*müzik|dokuz\s*sekiz\s*müzik|pasaj\s*müzik|garaj\s*müzik|mahzen\s*media|hypers|bordo\s*müzik|kalan\s*müzik|esenshop|esen\s*müzik|seyhan\s*müzik|özdemir\s*plak|vevo|official\s*music\s*video|official\s*video|official\s*audio|official\s*channel|official|resmi\s*kanal|video\s*klip|lyric\s*video|music|müzik|muzik|records|yapım|yapim|entertainment|tv|channel)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArtistNames(title, channel) {
  const set = new Set();

  // 1. Extract from title ("Sanatçı - Şarkı" or collaborations)
  if (title) {
    const cleanT = String(title).replace(/[\(\[][^\)\]]*[\)\]]/g, '').trim();
    const parts = cleanT.split(/\s+[-–—:]\s+/);
    if (parts.length > 1) {
      const lead = stripLabelNoise(parts[0]);
      const subs = lead.split(/\s*(?:&|\bve\b|\bfeat\.?|\bft\.?|\bx\b|,|\/|\bwith\b)\s*/i);
      subs.forEach(s => {
        const c = s.trim();
        const norm = normalizeTr(c);
        if (norm.length >= 2 && !/^(official|video|klip|audio|hd|4k|remix|mix|türkçe|turkce|hit)$/i.test(norm)) {
          set.add(c);
        }
      });
    }
  }

  // 2. Extract from channel after stripping record labels ("netd müzik ve Gülşen" -> "Gülşen")
  if (channel) {
    const cleanedCh = stripLabelNoise(channel);
    const chSubs = cleanedCh.split(/\s*(?:&|\bve\b|\bfeat\.?|\bft\.?|\bx\b|,|\/)\s*/i);
    chSubs.forEach(s => {
      const c = s.trim();
      const norm = normalizeTr(c);
      if (norm.length >= 2 && !/^(official|video|klip|audio|hd|4k|remix|mix|netd|dmc|topic|various|artists)$/i.test(norm)) {
        set.add(c);
      }
    });
  }

  return Array.from(set);
}

function matchesAnyArtist(candidateTitle, candidateChannel, targetArtists) {
  if (!targetArtists || targetArtists.length === 0) return false;
  const candArtists = extractArtistNames(candidateTitle, candidateChannel).map(a => normalizeTr(a)).filter(Boolean);
  const candNorm = normalizeTr(`${candidateTitle || ''} ${stripLabelNoise(candidateChannel || '')}`);
  const candTokens = new Set(candNorm.split(' ').filter(Boolean));

  for (const rawTarget of targetArtists) {
    const t = normalizeTr(stripLabelNoise(rawTarget));
    if (!t || t.length < 2) continue;

    // Direct phrase match with word boundaries
    const paddedCand = ` ${candNorm} `;
    if (paddedCand.includes(` ${t} `)) return true;

    for (const c of candArtists) {
      if (c === t || ` ${c} `.includes(` ${t} `) || ` ${t} `.includes(` ${c} `)) return true;
    }

    // Handle multi-word artist where primary token is distinctive (e.g. "lvbel c5" -> "lvbel")
    const tParts = t.split(' ').filter(w => w.length >= 4);
    for (const tp of tParts) {
      if (candTokens.has(tp)) return true;
    }
  }
  return false;
}

const SMART_SIMILARITY_CLUSTERS = [
  {
    id: 'tr_pop_club',
    keywords: ['gulsen', 'hande yener', 'hadise', 'edis', 'simge', 'demet akalin', 'aleyna tilki', 'murat boz', 'irem derici', 'derya ulug', 'ziynet sali', 'tarkan', 'bengu', 'ajda pekkan', 'mustafa sandal', 'kenan dogulu', 'serdar ortac', 'ece Ronay', 'aylin coskun', 'berksan', 'atilla tas', 'itaat yok', 'bangir bangir', 'opucuk', 'aski olayim'],
    artists: ['Hande Yener', 'Gülşen', 'Hadise', 'Edis', 'Simge', 'İrem Derici', 'Derya Uluğ', 'Murat Boz', 'Demet Akalın', 'Aleyna Tilki', 'Ziynet Sali', 'Tarkan', 'Bengü', 'Mustafa Sandal', 'Kenan Doğulu', 'Serdar Ortaç']
  },
  {
    id: 'tr_modern_emotional_pop',
    keywords: ['semicenk', 'dogu swag', 'reynmen', 'burak bulut', 'kurtulus kus', 'rast', 'bilal sonses', 'mustafa ceceli', 'ikilem', 'tugba yurt', 'merve ozbey', 'oguzhan koc', 'buray', 'cem adrian', 'sancak', 'taladro', 'canbay', 'wolker', 'irmak arici', 'nahide babashli', 'melek mosso'],
    artists: ['Semicenk', 'Doğu Swag', 'Reynmen', 'Merve Özbey', 'Buray', 'Oğuzhan Koç', 'Tuğba Yurt', 'İkilem', 'Bilal Sonses', 'Mustafa Ceceli', 'Melek Mosso', 'Cem Adrian', 'Burak Bulut', 'Kurtuluş Kuş']
  },
  {
    id: 'tr_indie_alt',
    keywords: ['mert demir', 'mabel matiz', 'melike sahin', 'dedubluman', 'kofn', 'emir can igrek', 'dolu kadehi ters tut', 'yuzyuzeyken konusuruz', 'madrigal', 'adamlar', 'kalben', 'sena sener', 'evdeki saat', 'perdenin ardindakiler', 'can ozan', 'karsu', 'gaye su akyol', 'jakuzi', 'buyuk ev ablukada', 'son feci bisiklet', 'ufuk beydemir'],
    artists: ['Mert Demir', 'Mabel Matiz', 'Melike Şahin', 'Dedublüman', 'KÖFN', 'Emir Can İğrek', 'Dolu Kadehi Ters Tut', 'Yüzyüzeyken Konuşuruz', 'Madrigal', 'Adamlar', 'Kalben', 'Evdeki Saat', 'Perdenin Ardındakiler', 'Can Ozan']
  },
  {
    id: 'tr_rock',
    keywords: ['duman', 'mor ve otesi', 'manga', 'teoman', 'sebnem ferah', 'athena', 'yuksek sadakat', 'gripin', 'pinhani', 'model', 'fatma turgut', 'hayko cepkin', 'haluk levent', 'cem karaca', 'baris manco', 'erkin koray', 'pentagram', 'kurband', 'gece yolculari', 'seksendort', 'zakkum', 'emre aydin', 'oguzhan', 'anadolu rock'],
    artists: ['Duman', 'Mor ve Ötesi', 'maNga', 'Teoman', 'Şebnem Ferah', 'Athena', 'Yüksek Sadakat', 'Gripin', 'Pinhani', 'Fatma Turgut', 'Emre Aydın', 'Seksendört', 'Zakkum', 'Haluk Levent', 'Hayko Cepkin']
  },
  {
    id: 'tr_slow_divas',
    keywords: ['sezen aksu', 'sertab erener', 'sila', 'nilufer', 'levent yuksel', 'candan ercetin', 'goksel', 'yildiz tilbe', 'funda arar', 'ebru gundes', 'tan tasci', 'yalin', 'gokhan turkmen', 'ferhat gocer', 'toygar isikli', 'sertab', 'sezen'],
    artists: ['Sezen Aksu', 'Sertab Erener', 'Sıla', 'Nilüfer', 'Yıldız Tilbe', 'Göksel', 'Funda Arar', 'Ebru Gündeş', 'Tan Taşçı', 'Yalın', 'Gökhan Türkmen', 'Levent Yüksel', 'Candan Erçetin']
  },
  {
    id: 'tr_newschool_rap_drill',
    keywords: ['lvbel c5', 'lvbel', 'cakal', 'uzi', 'blok3', 'motive', 'ati242', 'batuflex', 'reckol', 'organize', 'era7capone', 'poizi', 'heijan', 'muti', 'mavi', 'jeff redd', 'wegh', 'kuty', 'keskin', 'aksan', 'drill', 'trap', 'sefo', 'murda'],
    artists: ['Lvbel C5', 'Çakal', 'Uzi', 'BLOK3', 'Motive', 'Ati242', 'Batuflex', 'Reckol', 'Organize', 'Era7capone', 'Poizi', 'Sefo', 'Murda', 'Heijan', 'Jeff Redd', 'Wegh']
  },
  {
    id: 'tr_hiphop_classic',
    keywords: ['ezhel', 'ceza', 'sagopa kajmer', 'sagopa', 'sehinşah', 'sehinsah', 'hidra', 'norm ender', 'gazapizm', 'no 1', 'no1', 'patron', 'anil piyanci', 'allame', 'contra', 'sansar salvo', 'defkhan', 'rota', 'khontkar', 'aspova', 'ozbi', 'ben fero'],
    artists: ['Ezhel', 'Ceza', 'Sagopa Kajmer', 'Şehinşah', 'Hidra', 'Gazapizm', 'No.1', 'Norm Ender', 'Anıl Piyancı', 'Aspova', 'Patron', 'Allame', 'Ben Fero', 'Contra']
  },
  {
    id: 'tr_arabesk_fantezi',
    keywords: ['muslum gurses', 'ahmet kaya', 'ibrahim tatlises', 'ferdi tayfur', 'orhan gencebay', 'bergen', 'cengiz kurtoglu', 'hakan altun', 'serkan kaya', 'koray avci', 'azer bulbul', 'gullu', 'kibariye', 'ebru yasar', 'arabesk', 'damar'],
    artists: ['Müslüm Gürses', 'Ahmet Kaya', 'Ferdi Tayfur', 'Orhan Gencebay', 'Bergen', 'Cengiz Kurtoğlu', 'Hakan Altun', 'İbrahim Tatlıses', 'Koray Avcı', 'Ebru Yaşar', 'Serkan Kaya']
  },
  {
    id: 'global_pop',
    keywords: ['the weeknd', 'dua lipa', 'billie eilish', 'taylor swift', 'ed sheeran', 'ariana grande', 'bruno mars', 'rihanna', 'lady gaga', 'harry styles', 'justin bieber', 'sia', 'adele', 'lana del rey', 'post malone', 'shawn mendes', 'camila cabello', 'olivia rodrigo', 'sabrina carpenter', 'charlie puth', 'katy perry', 'maroon 5', 'onerepublic', 'selena gomez', 'miley cyrus'],
    artists: ['The Weeknd', 'Dua Lipa', 'Billie Eilish', 'Taylor Swift', 'Bruno Mars', 'Rihanna', 'Ed Sheeran', 'Ariana Grande', 'Lady Gaga', 'Adele', 'Lana Del Rey', 'Post Malone', 'Sia', 'Justin Bieber', 'OneRepublic']
  },
  {
    id: 'global_hiphop',
    keywords: ['eminem', 'travis scott', 'drake', 'kendrick lamar', '21 savage', 'future', 'metro boomin', 'kanye west', '50 cent', 'tupac', 'central cee', 'playboi carti', 'don toliver', 'pop smoke', 'lil baby', 'nicki minaj', 'cardi b', 'snoop dogg', 'dr dre', 'jay z', 'asap rocky'],
    artists: ['Eminem', 'Travis Scott', 'Drake', 'Kendrick Lamar', 'Metro Boomin', '21 Savage', 'Future', '50 Cent', 'Kanye West', 'Central Cee', 'Don Toliver', 'Pop Smoke']
  },
  {
    id: 'global_rock',
    keywords: ['coldplay', 'linkin park', 'imagine dragons', 'arctic monkeys', 'queen', 'nirvana', 'metallica', 'guns n roses', 'red hot chili peppers', 'the neighbourhood', 'twenty one pilots', 'green day', 'evanescence', 'muse', 'radiohead', 'ac dc', 'bon jovi', 'scorpions'],
    artists: ['Coldplay', 'Linkin Park', 'Imagine Dragons', 'Arctic Monkeys', 'Queen', 'The Neighbourhood', 'Twenty One Pilots', 'Nirvana', 'Red Hot Chili Peppers', 'Evanescence', 'Muse']
  },
  {
    id: 'electronic_phonk',
    keywords: ['alan walker', 'david guetta', 'calvin harris', 'tiesto', 'avicii', 'marshmello', 'martin garrix', 'kordhell', 'interworld', 'dvrst', 'hensonn', 'phonk', 'brazilian phonk', 'skrillex', 'daft punk', 'kygo'],
    artists: ['Calvin Harris', 'David Guetta', 'Avicii', 'Alan Walker', 'Tiësto', 'Martin Garrix', 'Marshmello', 'Kygo', 'Kordhell', 'Interworld']
  }
];

async function queryOllamaRecommendations(currentTitle, currentArtist, excludeArtists = []) {
  try {
    const cleanTitle = stripLabelNoise(currentTitle || '');
    const parsedArtists = extractArtistNames(currentTitle, currentArtist);
    const mainArtist = parsedArtists[0] || stripLabelNoise(currentArtist || '') || 'Bilinmeyen';
    const excludedStr = Array.from(new Set([...parsedArtists, ...excludeArtists])).slice(0, 12).join(', ');

    const prompt = `Sen uzman bir müzik DJ'isin. Şu an çalan şarkı: "${mainArtist} - ${cleanTitle}".
Bu şarkının tam müzik türünü, dilini, dönemini ve enerjisini analiz et.
Aynı türde, aynı dilde ve aynı atmosferde olan ama FARKLI sanatçılara ait 6 popüler gerçek şarkı öner.
KESİNLİKLE şu sanatçıları önerme: ${excludedStr}.
Sadece aşağıdaki JSON dizisi formatında yanıt ver, başka hiçbir açıklama yazma:
[{"artist": "Sanatçı Adı", "song": "Şarkı Adı"}]`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.55,
          num_predict: 220
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const rawText = (data && data.response) ? String(data.response) : '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(it => it && it.artist && it.song && !matchesAnyArtist(it.song, it.artist, [mainArtist, ...excludeArtists]))
      .slice(0, 6);
  } catch (e) {
    // Ollama not running or timed out — silent fallback
    return [];
  }
}

async function getRelatedRecommendations(videoId, currentArtist, currentTitle, excludeArtists = [], excludeIds = []) {
  const currentArtists = extractArtistNames(currentTitle, currentArtist);
  const allExcludedArtists = [
    ...new Set([
      ...currentArtists,
      stripLabelNoise(currentArtist || ''),
      ...(excludeArtists || []).map(a => stripLabelNoise(a || '')).filter(Boolean)
    ])
  ].filter(a => a && a.length >= 2);

  const seenIds = new Set((excludeIds || []).filter(Boolean));
  if (videoId) seenIds.add(videoId);

  // Track artists already added to this recommendation batch so we never return 3 songs by the same artist
  const batchExcludedArtists = [...allExcludedArtists];
  let candidates = [];

  const addCandidateIfValid = (item) => {
    if (!item || !item.id || !item.title || seenIds.has(item.id)) return false;
    if (!isGenuineMusicVideo(item.title, item.channel || '', item.duration || '', '')) return false;
    if (matchesAnyArtist(item.title, item.channel, batchExcludedArtists)) return false;

    seenIds.add(item.id);
    const itemArtists = extractArtistNames(item.title, item.channel);
    if (itemArtists.length > 0) {
      batchExcludedArtists.push(...itemArtists);
    }
    candidates.push({
      id: item.id,
      title: item.title.trim(),
      channel: (item.channel || '').trim(),
      duration: item.duration || '3:30',
      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`
    });
    return true;
  };

  // Run Ollama AI and YouTube Radio Mix in parallel for speed & accuracy
  const [ollamaSuggestions, radioItems] = await Promise.all([
    queryOllamaRecommendations(currentTitle, currentArtist, allExcludedArtists),
    (async () => {
      if (!videoId) return [];
      const items = [];
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20240101.00.00',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'tr', gl: 'TR' } },
            videoId: videoId,
            playlistId: `RD${videoId}`
          })
        });

        if (res.ok) {
          const data = await res.json();
          // Check both Radio Playlist panel and secondary watch-next results
          const playlistContents = data.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents || [];
          for (const plItem of playlistContents) {
            const pv = plItem.playlistPanelVideoRenderer;
            if (!pv) continue;
            const id = pv.videoId || '';
            const title = pv.title?.simpleText || pv.title?.runs?.map(x => x.text).join('') || '';
            const channel = pv.shortBylineText?.runs?.map(x => x.text).join('') || '';
            const duration = pv.lengthText?.simpleText || '';
            const thumb = pv.thumbnail?.thumbnails?.[0]?.url || (id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '');
            if (id && title) items.push({ id, title, channel, duration, thumbnail: thumb });
          }

          const results = data.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];
          for (const it of results) {
            let id = '', title = '', channel = '', duration = '', thumb = '';
            if (it.lockupViewModel) {
              const vm = it.lockupViewModel;
              id = vm.contentId || '';
              const meta = vm.metadata?.lockupMetadataViewModel;
              title = meta?.title?.content || '';
              channel = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';
              const overlays = vm.contentImage?.thumbnailViewModel?.overlays || vm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays || [];
              for (const ov of overlays) {
                const badge = ov?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel;
                if (badge && badge.text) {
                  duration = badge.text;
                  break;
                }
              }
              thumb = vm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url ||
                      vm.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url ||
                      (id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '');
            } else if (it.compactVideoRenderer) {
              const v = it.compactVideoRenderer;
              id = v.videoId || '';
              title = v.title?.simpleText || v.title?.runs?.map(x => x.text).join('') || '';
              channel = v.shortBylineText?.runs?.map(x => x.text).join('') || '';
              duration = v.lengthText?.simpleText || '';
              thumb = v.thumbnail?.thumbnails?.[0]?.url || (id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '');
            }
            if (id && title) items.push({ id, title, channel, duration, thumbnail: thumb });
          }
        }
      } catch (e) {
        console.warn('InnerTube next recommendations error:', e.message);
      }
      return items;
    })()
  ]);

  // 1. Resolve Ollama AI song suggestions first (highest genre & vibe relevance)
  if (ollamaSuggestions && ollamaSuggestions.length > 0) {
    const resolvedOllama = await Promise.all(
      ollamaSuggestions.slice(0, 4).map(async (sug) => {
        try {
          const hits = await searchYouTube(`${sug.artist} ${sug.song}`);
          return hits.find(h => h && h.id && !seenIds.has(h.id) && !matchesAnyArtist(h.title, h.channel, allExcludedArtists)) || null;
        } catch (e) {
          return null;
        }
      })
    );
    for (const item of resolvedOllama) {
      if (item) addCandidateIfValid(item);
    }
  }

  // 2. Add filtered YouTube Radio / Watch-Next items (same genre/era, strictly different artists)
  for (const rItem of radioItems) {
    addCandidateIfValid(rItem);
    if (candidates.length >= 10) break;
  }

  // 3. Peer-Artist Similarity Cluster Search (if more diverse tracks needed)
  if (candidates.length < 8) {
    try {
      const combinedNorm = normalizeTr(`${currentTitle || ''} ${currentArtist || ''}`);
      let matchedCluster = SMART_SIMILARITY_CLUSTERS.find(c =>
        c.keywords.some(k => ` ${combinedNorm} `.includes(` ${normalizeTr(k)} `))
      );

      if (!matchedCluster) {
        // Detect if Turkish or Global based on characters / common words
        const isTurkish = /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|bu|için|ile|ben|sen|yok|var|aşk|ask|kalp|gece|göz|goz|sevda|yalnız|yalniz|müzik|muzik|şarkı|sarki)\b/i.test(`${currentTitle || ''} ${currentArtist || ''}`);
        matchedCluster = isTurkish ? SMART_SIMILARITY_CLUSTERS[0] : SMART_SIMILARITY_CLUSTERS[8];
      }

      const availablePeers = matchedCluster.artists.filter(p => !matchesAnyArtist(p, p, batchExcludedArtists));
      // Shuffle peers
      for (let i = availablePeers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availablePeers[i], availablePeers[j]] = [availablePeers[j], availablePeers[i]];
      }

      const selectedPeers = availablePeers.slice(0, 3);
      const peerResults = await Promise.all(
        selectedPeers.map(peer => searchYouTube(`${peer} official audio`).catch(() => []))
      );

      for (const hits of peerResults) {
        for (const t of hits) {
          if (addCandidateIfValid(t)) break; // Take 1 top hit per peer artist for maximum variety!
        }
        if (candidates.length >= 12) break;
      }
    } catch (e) {
      console.warn('Cluster similarity recommendations error:', e.message);
    }
  }

  return candidates;
}

// Spotify Playlist Scraper
async function fetchSpotifyPlaylist(playlistId) {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  if (!res.ok) {
    throw new Error(`Spotify listesi getirilemedi (HTTP ${res.status})`);
  }

  const html = await res.text();
  const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
  if (!nextMatch) {
    throw new Error('Spotify playlist verisi ayrıştırılamadı. Liste gizli olabilir.');
  }

  const data = JSON.parse(nextMatch[1]);
  const entity = data.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Spotify playlist detayı bulunamadı.');
  }

  const title = entity.title || entity.name || 'Spotify Çalma Listesi';
  const subtitle = entity.subtitle || '';
  const coverUrl = entity.coverArt?.sources?.[0]?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300';
  const rawTracks = entity.trackList || [];

  const tracks = rawTracks.map(t => {
    const mins = Math.floor((t.duration || 0) / 60000);
    const secs = Math.floor(((t.duration || 0) % 60000) / 1000);
    const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    return {
      title: t.title || 'Bilinmeyen Şarkı',
      artist: t.subtitle || 'Bilinmeyen Sanatçı',
      duration: durationStr,
      spotifyUri: t.uri || ''
    };
  });

  return {
    id: playlistId,
    title,
    subtitle,
    coverUrl,
    tracks
  };
}

// YouTube Music Playlist Scraper / Extractor
function formatDurationSecs(secs) {
  if (!secs || isNaN(secs)) return '3:30';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function fetchYouTubeMusicPlaylist(urlOrId) {
  const match = urlOrId.match(/[?&]list=([a-zA-Z0-9_-]+)/) || urlOrId.match(/^([a-zA-Z0-9_-]{10,})$/);
  const playlistId = match ? (match[1] || match[0]) : null;
  if (!playlistId) {
    throw new Error('Geçerli bir YouTube Music çalma listesi bağlantısı veya ID bulunamadı.');
  }

  const targetUrl = `https://music.youtube.com/playlist?list=${playlistId}`;

  return new Promise((resolve, reject) => {
    if (!isYtDlpReady()) {
      return reject(new Error('yt-dlp motoru bulunamadı. Lütfen yt-dlp paketini kurun (Arch: sudo pacman -S yt-dlp).'));
    }

    const { execFile } = require('child_process');
    execFile(YT_DLP_PATH, ['--flat-playlist', '-J', targetUrl], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`YouTube Music listesi alınamadı: ${err.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        const title = data.title || 'YouTube Music Çalma Listesi';
        const uploader = data.uploader || data.channel || 'YouTube Music';
        const rawEntries = Array.isArray(data.entries) ? data.entries : [];
        const coverUrl = data.thumbnails?.[0]?.url ||
          (rawEntries[0]?.thumbnails?.[0]?.url) ||
          (rawEntries[0]?.id ? `https://i.ytimg.com/vi/${rawEntries[0].id}/hqdefault.jpg` : 'https://music.youtube.com/favicon.ico');

        const tracks = rawEntries.map(e => ({
          id: e.id,
          title: e.title || 'Bilinmeyen Şarkı',
          artist: e.uploader || e.channel || uploader || 'Bilinmeyen Sanatçı',
          duration: typeof e.duration === 'number' ? formatDurationSecs(e.duration) : (e.duration || '3:30'),
          thumbnail: (e.thumbnails && e.thumbnails.length > 0) ? e.thumbnails[e.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`
        })).filter(t => t.id);

        if (tracks.length === 0) {
          throw new Error('Çalma listesinde oynatılabilir şarkı bulunamadı. Liste gizli veya boş olabilir.');
        }

        resolve({
          id: playlistId,
          title,
          uploader,
          coverUrl,
          tracks
        });
      } catch (parseErr) {
        reject(new Error(`Playlist verisi ayrıştırılamadı: ${parseErr.message}`));
      }
    });
  });
}

// Download Track Worker using yt-dlp to D:\müzikal\downloads
function startTrackDownload(song) {
  if (!song || !song.id) return Promise.reject(new Error('Invalid song'));
  if (activeDownloads.has(song.id)) return Promise.resolve(activeDownloads.get(song.id));

  activeDownloads.set(song.id, {
    status: 'downloading',
    progress: 0,
    title: song.title,
    artist: song.channel || song.artist || ''
  });

  const outputPath = path.join(DOWNLOADS_DIR, `${song.id}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'ba[ext=m4a]/ba[ext=mp3]/ba',
      '-o', outputPath,
      '--no-playlist',
      '--max-filesize', '50M',
      '--no-warnings',
      `https://www.youtube.com/watch?v=${song.id}`
    ];

    const proc = spawn(YT_DLP_PATH, args, { cwd: DOWNLOADS_DIR });

    proc.stdout.on('data', data => {
      const text = data.toString();
      const match = text.match(/([0-9.]+)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        const current = activeDownloads.get(song.id);
        if (current) current.progress = pct;
      }
    });

    proc.on('close', code => {
      if (code === 0) {
        activeDownloads.set(song.id, {
          status: 'done',
          progress: 100,
          title: song.title,
          artist: song.channel || song.artist || ''
        });
        resolve({ success: true, songId: song.id });
      } else {
        activeDownloads.set(song.id, {
          status: 'error',
          progress: 0,
          title: song.title
        });
        reject(new Error(`Download process exited with code ${code}`));
      }
    });

    proc.on('error', err => {
      activeDownloads.set(song.id, { status: 'error', progress: 0, title: song.title });
      reject(err);
    });
  });
}

// Request Body Parser
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) req.destroy(); // 1MB limit
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg'
};

// --- In-App Updater State & Functions ---
let inAppUpdateState = {
  inProgress: false,
  percent: 0,
  status: '',
  done: false,
  error: null
};

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function fetchUrl(currentUrl, redirects = 0) {
      if (redirects > 10) return reject(new Error('Çok fazla yönlendirme'));
      const parsed = new URL(currentUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Muzikal-Updater/1.4.0',
          'Accept': '*/*'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).href;
          res.resume();
          return fetchUrl(nextUrl, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`İndirme HTTP hatası: ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && typeof onProgress === 'function') {
            const pct = Math.round((downloadedBytes / totalBytes) * 100);
            onProgress(pct, downloadedBytes, totalBytes);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    fetchUrl(url);
  });
}

function copyDirRecursiveSync(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        console.warn(`Could not overwrite ${destPath}:`, err.message);
      }
    }
  }
}

async function runInAppUpdate() {
  try {
    inAppUpdateState.status = 'Son sürüm GitHub üzerinden kontrol ediliyor...';
    inAppUpdateState.percent = 10;

    const ghRes = await fetch('https://api.github.com/repos/KaranlikPasa/M-zikal/releases/latest', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Muzikal-Updater/1.4.0' }
    });
    if (!ghRes.ok) {
      throw new Error(`GitHub API hatası: HTTP ${ghRes.status}`);
    }
    const release = await ghRes.json();

    // 1. FAST IN-APP UPDATE: Hızlı Doğrudan Dosya Güncellemesi (Boyut: ~250 KB, Süre: ~1 sn)
    try {
      inAppUpdateState.status = 'Güncelleme dosyaları indiriliyor (%20)...';
      inAppUpdateState.percent = 20;

      const rawBase = 'https://raw.githubusercontent.com/KaranlikPasa/M-zikal/main';
      const updateFiles = [
        { remote: `${rawBase}/server.js`, local: path.join(__dirname, 'server.js') },
        { remote: `${rawBase}/discord-rpc.js`, local: path.join(__dirname, 'discord-rpc.js') },
        { remote: `${rawBase}/Muzikal.bat`, local: path.join(__dirname, 'Muzikal.bat') },
        { remote: `${rawBase}/README.md`, local: path.join(__dirname, 'README.md') },
        { remote: `${rawBase}/public/app.js`, local: path.join(PUBLIC_DIR, 'app.js') },
        { remote: `${rawBase}/public/index.html`, local: path.join(PUBLIC_DIR, 'index.html') },
        { remote: `${rawBase}/public/style.css`, local: path.join(PUBLIC_DIR, 'style.css') },
        { remote: `${rawBase}/public/favicon.ico`, local: path.join(PUBLIC_DIR, 'favicon.ico') },
        { remote: `${rawBase}/public/favicon.png`, local: path.join(PUBLIC_DIR, 'favicon.png') },
        { remote: `${rawBase}/public/favicon-32.png`, local: path.join(PUBLIC_DIR, 'favicon-32.png') },
        { remote: `${rawBase}/public/apple-touch-icon.png`, local: path.join(PUBLIC_DIR, 'apple-touch-icon.png') }
      ];

      for (let i = 0; i < updateFiles.length; i++) {
        const item = updateFiles[i];
        const res = await fetch(`${item.remote}?t=${Date.now()}`, {
          headers: {
            'User-Agent': 'Muzikal-Updater/1.4.0',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(item.local, buf);
        }
        inAppUpdateState.percent = 20 + Math.round(((i + 1) / updateFiles.length) * 75);
        inAppUpdateState.status = `Dosyalar güncelleniyor: %${inAppUpdateState.percent} (${i + 1}/${updateFiles.length})...`;
      }

      inAppUpdateState.percent = 100;
      inAppUpdateState.status = 'Güncelleme başarıyla tamamlandı! Sayfa yenileniyor...';
      inAppUpdateState.done = true;
      inAppUpdateState.inProgress = false;
      return;
    } catch (fastErr) {
      console.warn('Hızlı güncelleme başarısız oldu, tam arşiv yöntemine geçiliyor:', fastErr.message);
    }

    // 2. FALLBACK: Tam Zip Paketi İndirme ve Açma
    const zipAsset = release.assets && (
      release.assets.find(a => a.name.toLowerCase().endsWith('-windows-x64.zip')) ||
      release.assets.find(a => a.name.toLowerCase().endsWith('.zip'))
    );

    if (!zipAsset) {
      throw new Error('GitHub sürümünde Windows güncelleme paketi (.zip) bulunamadı.');
    }

    const tempDir = path.join(__dirname, 'temp_update_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, 'update.zip');
    const extractDir = path.join(tempDir, 'extracted');

    inAppUpdateState.status = 'Güncelleme paketi indiriliyor (%0)...';
    inAppUpdateState.percent = 10;

    await downloadFileWithProgress(zipAsset.browser_download_url, zipPath, (pct, downloaded, total) => {
      inAppUpdateState.percent = Math.min(80, 10 + Math.round((pct * 70) / 100));
      const mbDl = (downloaded / (1024 * 1024)).toFixed(1);
      const mbTot = (total / (1024 * 1024)).toFixed(1);
      inAppUpdateState.status = `İndiriliyor: %${inAppUpdateState.percent} (${mbDl} / ${mbTot} MB)...`;
    });

    inAppUpdateState.percent = 82;
    inAppUpdateState.status = 'Güncelleme paketi açılıyor...';

    // Extract archive (PowerShell on Windows, unzip on Linux)
    await new Promise((resolve, reject) => {
      fs.mkdirSync(extractDir, { recursive: true });
      let child;
      if (isLinux) {
        child = spawn('unzip', ['-q', '-o', zipPath, '-d', extractDir]);
      } else {
        child = spawn('powershell', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
        ]);
      }
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Arşiv açılamadı, çıkış kodu: ${code}`));
      });
      child.on('error', reject);
    });

    inAppUpdateState.percent = 90;
    inAppUpdateState.status = 'Uygulama dosyaları güncelleniyor...';

    // Look for files either directly in extractDir or in a single subfolder
    let sourceRoot = extractDir;
    const extractedEntries = fs.readdirSync(extractDir);
    if (extractedEntries.length === 1 && fs.statSync(path.join(extractDir, extractedEntries[0])).isDirectory()) {
      sourceRoot = path.join(extractDir, extractedEntries[0]);
    }

    // 1. Copy public directory
    const srcPublic = path.join(sourceRoot, 'public');
    if (fs.existsSync(srcPublic)) {
      copyDirRecursiveSync(srcPublic, PUBLIC_DIR);
    }

    // 2. Copy server.js
    const srcServer = path.join(sourceRoot, 'server.js');
    if (fs.existsSync(srcServer)) {
      try {
        fs.copyFileSync(srcServer, path.join(__dirname, 'server.js'));
      } catch (e) {
        console.warn('server.js overwrite warning:', e.message);
      }
    }

    // 3. Copy Muzikal.bat
    const srcBat = path.join(sourceRoot, 'Muzikal.bat');
    if (fs.existsSync(srcBat)) {
      try {
        fs.copyFileSync(srcBat, path.join(__dirname, 'Muzikal.bat'));
      } catch (e) {
        console.warn('Muzikal.bat overwrite warning:', e.message);
      }
    }

    // 4. Copy README.md
    const srcReadme = path.join(sourceRoot, 'README.md');
    if (fs.existsSync(srcReadme)) {
      try {
        fs.copyFileSync(srcReadme, path.join(__dirname, 'README.md'));
      } catch (e) {
        console.warn('README.md overwrite warning:', e.message);
      }
    }

    // 5. Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Temp cleanup warning:', e.message);
    }

    inAppUpdateState.percent = 100;
    inAppUpdateState.status = 'Güncelleme başarıyla tamamlandı! Sayfa yenileniyor...';
    inAppUpdateState.done = true;
    inAppUpdateState.inProgress = false;
  } catch (err) {
    console.error('In-app update error:', err);
    inAppUpdateState.inProgress = false;
    inAppUpdateState.error = err.message || 'Bilinmeyen hata';
    inAppUpdateState.status = 'Hata: ' + inAppUpdateState.error;
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  const parsedUrl = new URL(req.url, `http://${host || 'localhost:3456'}`);
  const pathname = parsedUrl.pathname;

  // Auto-redirect raw IP 127.0.0.1 to localhost for Web UI so YouTube embed origin restriction does not block music
  if (host.startsWith('127.0.0.1') && !pathname.startsWith('/api/') && !pathname.endsWith('.apk')) {
    res.writeHead(302, { 'Location': `http://localhost:${PORT}${req.url}` });
    res.end();
    return;
  }

  // CORS and Referrer Policy headers so embedded YouTube player is never rejected by Error 153 (MISSING_REFERRER)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Referrer-Policy', 'origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Endpoints ---
  try {
    // 0. Version & Network Sharing API
    if (pathname === '/api/version' && req.method === 'GET') {
      const ip = getLocalNetworkIp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: APP_VERSION,
        versionCode: APP_VERSION_CODE,
        networkIp: ip,
        port: PORT,
        networkUrl: `http://${ip}:${PORT}`,
        apkDownloadUrl: `http://${ip}:${PORT}/Muzikal.apk`
      }));
      return;
    }

    // 0.1 Direct APK Download for Mobile Updates
    if ((pathname === '/Muzikal.apk' || pathname === '/download/Muzikal.apk') && (req.method === 'GET' || req.method === 'HEAD')) {
      if (fs.existsSync(APK_FILE)) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="Muzikal.apk"',
          'Content-Length': fs.statSync(APK_FILE).size
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(APK_FILE).pipe(res);
        return;
      }
    }

    // 1. Search API
    if (pathname === '/api/search' && req.method === 'GET') {
      const q = (parsedUrl.searchParams.get('q') || '').trim();
      if (!q) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [] }));
        return;
      }
      const results = await searchYouTube(q);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query: q, results }));
      return;
    }

    // 1.5 Smart Recommendations API (Diverse artists in same genre for Smart Shuffle)
    if (pathname === '/api/recommendations' && req.method === 'GET') {
      const videoId = (parsedUrl.searchParams.get('videoId') || '').trim();
      const artist = (parsedUrl.searchParams.get('artist') || '').trim();
      const title = (parsedUrl.searchParams.get('title') || '').trim();
      const rawExcludeArtists = parsedUrl.searchParams.get('excludeArtists') || '';
      const rawExcludeIds = parsedUrl.searchParams.get('excludeIds') || '';

      let excludeArtists = [];
      let excludeIds = [];
      try {
        excludeArtists = rawExcludeArtists.startsWith('[') ? JSON.parse(rawExcludeArtists) : rawExcludeArtists.split(',').map(s => s.trim()).filter(Boolean);
      } catch (e) {
        excludeArtists = rawExcludeArtists.split(',').map(s => s.trim()).filter(Boolean);
      }
      try {
        excludeIds = rawExcludeIds.startsWith('[') ? JSON.parse(rawExcludeIds) : rawExcludeIds.split(',').map(s => s.trim()).filter(Boolean);
      } catch (e) {
        excludeIds = rawExcludeIds.split(',').map(s => s.trim()).filter(Boolean);
      }

      const recommendations = await getRelatedRecommendations(videoId, artist, title, excludeArtists, excludeIds);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: recommendations.length, recommendations }));
      return;
    }

    // 2. Explore / Genres API (Dynamic live trends + refresh support)
    if (pathname === '/api/explore' && req.method === 'GET') {
      const genre = parsedUrl.searchParams.get('genre') || 'trendler';
      const forceRefresh = parsedUrl.searchParams.get('refresh') === '1' || parsedUrl.searchParams.get('refresh') === 'true';
      const query = EXPLORE_GENRES[genre] || EXPLORE_GENRES['trendler'];
      if (forceRefresh) {
        searchCache.delete(query);
      }
      const results = await searchYouTube(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ genre, results, refreshedAt: Date.now() }));
      return;
    }

    // 2.1 Lyrics API (Multi-pass intelligent Spotify-style synchronized lyrics)
    if (pathname === '/api/lyrics' && req.method === 'GET') {
      const rawTitle = (parsedUrl.searchParams.get('title') || '').trim();
      const rawArtist = (parsedUrl.searchParams.get('artist') || '').trim();

      const cacheKey = `${rawArtist}:::${rawTitle}`.toLowerCase();
      if (lyricsCache.has(cacheKey)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lyricsCache.get(cacheKey)));
        return;
      }

      // 1. Clean up title
      let cleanTitle = rawTitle
        .replace(/\s*[\[\(](official|resmi|video|klip|audio|lyric|lyrics|sözleri|şarkı sözleri|remix|feat|ft\.|prod|hd|4k|hq|remastered|video klip|canlı|live|akustik|visualizer|performance)[^\)\]]*[\)\]]/gi, '')
        .replace(/[-–—|]\s*(official|resmi|video|klip|audio|lyric|lyrics|sözleri|canlı|live|visualizer).*/gi, '')
        .replace(/\b(official\s+music\s+video|official\s+video|official\s+audio|video\s+klip|resmi\s+video|lyric\s+video)\b/gi, '')
        .trim();

      // Extract primary artist and title if title contains separator
      let primaryArtist = rawArtist.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
      let trackName = cleanTitle;
      let reversedArtist = '';
      let reversedTrack = '';

      if (cleanTitle.includes(' - ')) {
        const parts = cleanTitle.split(' - ').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          primaryArtist = parts[0];
          trackName = parts.slice(1).join(' - ');
          reversedArtist = parts[parts.length - 1];
          reversedTrack = parts.slice(0, -1).join(' - ');
        }
      }

      // Clean artist: remove collaboration suffixes like 'x poizi', 'ft. ...', '& ...'
      const cleanArtist = (primaryArtist || '')
        .replace(/\s*(?:x|&|,|feat\.?|ft\.?|featuring)\s+.*$/i, '')
        .replace(/\s*-\s*topic$/i, '')
        .trim();

      // Clean trackName further
      const finalTrackName = trackName
        .replace(/\s*[\[\(][^\)\]]*[\)\]]/g, '')
        .replace(/\s*(?:feat\.?|ft\.?|prod\.?\s*by)\s+.*$/i, '')
        .replace(/["'"]/g, '')
        .trim();

      // Candidate search queries in order of precision:
      const queriesToTry = [];
      if (cleanArtist && finalTrackName) {
        queriesToTry.push(`${cleanArtist} ${finalTrackName}`);
      }
      if (primaryArtist && trackName && primaryArtist !== cleanArtist) {
        queriesToTry.push(`${primaryArtist} ${trackName}`);
      }
      if (reversedArtist && reversedTrack) {
        queriesToTry.push(`${reversedArtist} ${reversedTrack}`);
      }
      if (finalTrackName) {
        queriesToTry.push(finalTrackName);
      }
      if (rawTitle) {
        queriesToTry.push(rawTitle.replace(/\s*[\[\(][^\)\]]*[\)\]]/g, '').trim());
      }

      const headers = { 'User-Agent': 'Muzikal/1.4.0 (https://github.com/KaranlikPasa/M-zikal)' };

      // Helper to try LRCLIB search
      async function tryLrclib(query) {
        try {
          const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
          const fetchRes = await fetch(url, { headers });
          if (!fetchRes.ok) return null;
          const items = await fetchRes.json();
          if (Array.isArray(items) && items.length > 0) {
            // Find best matching item that has lyrics (preferably synced)
            const withSynced = items.find(it => it && it.syncedLyrics && it.syncedLyrics.trim().length > 0);
            if (withSynced) return withSynced;
            const withPlain = items.find(it => it && it.plainLyrics && it.plainLyrics.trim().length > 0);
            if (withPlain) return withPlain;
            return items[0];
          }
        } catch (e) {}
        return null;
      }

      // Helper to try LRCLIB direct get
      async function tryLrclibGet(artist, track) {
        try {
          const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
          const fetchRes = await fetch(url, { headers });
          if (!fetchRes.ok) return null;
          const data = await fetchRes.json();
          if (data && (data.syncedLyrics || data.plainLyrics)) return data;
        } catch (e) {}
        return null;
      }

      let matchedItem = null;

      // Pass 1: Direct get if both artist and track exist
      if (cleanArtist && finalTrackName) {
        matchedItem = await tryLrclibGet(cleanArtist, finalTrackName);
      }

      // Pass 2: Search queries in order
      if (!matchedItem || (!matchedItem.syncedLyrics && !matchedItem.plainLyrics)) {
        const uniqueQueries = Array.from(new Set(queriesToTry)).filter(Boolean);
        for (const q of uniqueQueries) {
          const resItem = await tryLrclib(q);
          if (resItem && (resItem.syncedLyrics || resItem.plainLyrics)) {
            matchedItem = resItem;
            break;
          }
        }
      }

      // Pass 3: lyrics.ovh fallback for plain lyrics
      if (!matchedItem || (!matchedItem.syncedLyrics && !matchedItem.plainLyrics)) {
        if (cleanArtist && finalTrackName) {
          try {
            const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(finalTrackName)}`;
            const ovhRes = await fetch(ovhUrl);
            if (ovhRes.ok) {
              const ovhData = await ovhRes.json();
              if (ovhData && ovhData.lyrics) {
                matchedItem = {
                  trackName: finalTrackName,
                  artistName: cleanArtist,
                  plainLyrics: ovhData.lyrics,
                  syncedLyrics: null
                };
              }
            }
          } catch (e) {}
        }
      }

      if (matchedItem && (matchedItem.syncedLyrics || matchedItem.plainLyrics)) {
        const payload = {
          success: true,
          trackName: matchedItem.trackName || finalTrackName,
          artistName: matchedItem.artistName || cleanArtist,
          albumName: matchedItem.albumName || null,
          duration: matchedItem.duration || null,
          plainLyrics: matchedItem.plainLyrics || null,
          syncedLyrics: matchedItem.syncedLyrics || null
        };
        lyricsCache.set(cacheKey, payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Şarkı sözü bulunamadı' }));
      return;
    }

    // --- GOOGLE SIGN-IN & CLOUD SYNC API ---
    if (pathname === '/api/auth/google' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Geçerli bir Google e-posta adresi gereklidir' }));
        return;
      }

      const name = (body.name || email.split('@')[0]).trim();
      const avatar = body.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4285F4&color=fff&bold=true`;
      
      let existingUser = readUserData(email);
      let incomingLibrary = body.library || { favorites: [], playlists: [], history: [] };

      if (!existingUser) {
        existingUser = {
          user: { email, name, avatar, createdAt: Date.now() },
          library: {
            favorites: incomingLibrary.favorites || [],
            playlists: incomingLibrary.playlists || [],
            history: incomingLibrary.history || []
          }
        };
      } else {
        // Merge favorites (preserve unique)
        const favMap = new Map();
        (existingUser.library.favorites || []).forEach(s => favMap.set(s.id, s));
        (incomingLibrary.favorites || []).forEach(s => favMap.set(s.id, s));
        existingUser.library.favorites = Array.from(favMap.values());

        // Deep merge playlists (match by name or ID, merge all songs without duplicates)
        const plMap = new Map();
        (existingUser.library.playlists || []).forEach(p => {
          plMap.set(p.name, { ...p, songs: [...(p.songs || [])] });
        });
        (incomingLibrary.playlists || []).forEach(p => {
          if (!plMap.has(p.name)) {
            plMap.set(p.name, p);
          } else {
            const targetPl = plMap.get(p.name);
            const songMap = new Map();
            (targetPl.songs || []).forEach(s => songMap.set(s.id, s));
            (p.songs || []).forEach(s => songMap.set(s.id, s));
            targetPl.songs = Array.from(songMap.values());
            if (p.cover && !targetPl.cover) targetPl.cover = p.cover;
            if (p.description && !targetPl.description) targetPl.description = p.description;
          }
        });
        existingUser.library.playlists = Array.from(plMap.values());

        // Merge history (preserve unique, keep recent first)
        const histMap = new Map();
        (incomingLibrary.history || []).forEach(s => histMap.set(s.id, s));
        (existingUser.library.history || []).forEach(s => {
          if (!histMap.has(s.id)) histMap.set(s.id, s);
        });
        existingUser.library.history = Array.from(histMap.values()).slice(0, 100);

        // Update profile details if provided
        existingUser.user.name = name;
        if (body.avatar) existingUser.user.avatar = body.avatar;
        existingUser.user.lastSync = Date.now();
      }

      writeUserData(email, existingUser);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: existingUser.user,
        library: existingUser.library
      }));
      return;
    }

    if (pathname === '/api/auth/google-sync' && req.method === 'GET') {
      const email = (parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'E-posta gerekli' }));
        return;
      }

      const userData = readUserData(email);
      if (userData) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: userData.user, library: userData.library }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Kullanıcı bulunamadı' }));
      }
      return;
    }

    if (pathname === '/api/auth/sync' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (email && body.library) {
        let userData = readUserData(email);
        if (userData) {
          userData.library = body.library;
          userData.user.lastSync = Date.now();
          writeUserData(email, userData);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Explicit Push Local Library to Cloud Account
    if (pathname === '/api/auth/push-library' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !body.library) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Email ve kütüphane gereklidir' }));
        return;
      }
      let userData = readUserData(email);
      if (!userData) {
        userData = {
          user: { email, name: (body.name || email.split('@')[0]), avatar: body.avatar || '', createdAt: Date.now() },
          library: body.library
        };
      } else {
        userData.library = body.library;
        userData.user.lastSync = Date.now();
      }
      writeUserData(email, userData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Tüm çalma listeleri ve favoriler Google hesabınıza başarıyla aktarıldı!',
        lastSync: userData.user.lastSync,
        playlistCount: (userData.library.playlists || []).length,
        favoriteCount: (userData.library.favorites || []).length
      }));
      return;
    }

    // Explicit Pull Cloud Library from Account
    if (pathname === '/api/auth/pull-library' && req.method === 'GET') {
      const email = (parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Email gereklidir' }));
        return;
      }
      const userData = readUserData(email);
      if (!userData) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bu hesaba ait bulut kaydı bulunamadı' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: userData.user,
        library: userData.library,
        playlistCount: (userData.library.playlists || []).length,
        favoriteCount: (userData.library.favorites || []).length
      }));
      return;
    }

    // 3. Library API (Get favorites & playlists)
    if (pathname === '/api/library' && req.method === 'GET') {
      const library = readLibrary();
      const downloaded = getDownloadedTrackIds();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...library, downloadedIds: downloaded }));
      return;
    }

    // 3.1 Save / Sync Full Library to Local Disk
    if (pathname === '/api/library/save' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body && (Array.isArray(body.favorites) || Array.isArray(body.playlists))) {
        const current = readLibrary();
        const updated = {
          favorites: Array.isArray(body.favorites) ? body.favorites : (current.favorites || []),
          playlists: Array.isArray(body.playlists) ? body.playlists : (current.playlists || []),
          history: Array.isArray(body.history) ? body.history : (current.history || [])
        };
        writeLibrary(updated);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 3.2 Discord Rich Presence (RPC) Endpoints
    if (pathname === '/api/discord/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(discordRpc.getStatus()));
      return;
    }

    if (pathname === '/api/discord/config' && req.method === 'POST') {
      const body = await parseBody(req);
      const updated = discordRpc.updateConfig(body || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...updated }));
      return;
    }

    if (pathname === '/api/discord/activity' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body && body.song) {
        discordRpc.setActivity({
          title: body.song.title,
          artist: body.song.artist || body.song.channel || 'Müzikal',
          thumbnail: body.song.thumbnail,
          duration: body.duration || body.song.durationSec || 0,
          currentTime: body.currentTime || 0,
          isPlaying: !!body.isPlaying
        });
      } else {
        discordRpc.clearActivity();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 4. Toggle Favorite
    if (pathname === '/api/library/toggle-favorite' && req.method === 'POST') {
      const { song } = await parseBody(req);
      if (!song || !song.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Song required' }));
        return;
      }
      const library = readLibrary();
      const existingIdx = library.favorites.findIndex(s => s.id === song.id);
      let isFavorite = false;
      if (existingIdx >= 0) {
        library.favorites.splice(existingIdx, 1);
        isFavorite = false;
      } else {
        library.favorites.unshift(song);
        isFavorite = true;
      }
      writeLibrary(library);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, isFavorite, favorites: library.favorites }));
      return;
    }

    // 5. Create Playlist
    if (pathname === '/api/library/playlist' && req.method === 'POST') {
      const { name, description } = await parseBody(req);
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Name required' }));
        return;
      }
      const library = readLibrary();
      const newPlaylist = {
        id: 'pl_' + Date.now(),
        name: name.trim(),
        description: (description || '').trim(),
        songs: []
      };
      library.playlists.push(newPlaylist);
      writeLibrary(library);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, playlist: newPlaylist }));
      return;
    }

    // 6. Add/Remove song from Playlist
    if (pathname.startsWith('/api/library/playlist/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const playlistId = parts[4];
      const action = parts[5]; // 'add' or 'remove'
      const body = await parseBody(req);
      const library = readLibrary();
      const playlist = library.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Playlist not found' }));
        return;
      }

      if (action === 'add' && body.song) {
        if (!playlist.songs.some(s => s.id === body.song.id)) {
          playlist.songs.push(body.song);
          writeLibrary(library);
        }
      } else if (action === 'remove' && body.songId) {
        playlist.songs = playlist.songs.filter(s => s.id !== body.songId);
        writeLibrary(library);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, playlist }));
      return;
    }

    // 7. Delete Playlist
    if (pathname.startsWith('/api/library/playlist/') && req.method === 'DELETE') {
      const playlistId = pathname.split('/')[4];
      const library = readLibrary();
      library.playlists = library.playlists.filter(p => p.id !== playlistId);
      writeLibrary(library);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, playlists: library.playlists }));
      return;
    }

    // 8. Add to history
    if (pathname === '/api/library/history' && req.method === 'POST') {
      const { song } = await parseBody(req);
      if (song && song.id) {
        const library = readLibrary();
        library.history = library.history.filter(s => s.id !== song.id);
        library.history.unshift(song);
        if (library.history.length > 50) library.history = library.history.slice(0, 50);
        writeLibrary(library);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // --- SPOTIFY INTEGRATION ---

    // 9. Spotify Playlist Import
    if (pathname === '/api/spotify/import' && req.method === 'POST') {
      const { url: spUrl } = await parseBody(req);
      if (!spUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Spotify bağlantısı gereklidir.' }));
        return;
      }

      // Extract playlist ID
      const match = spUrl.match(/playlist[\/:]([a-zA-Z0-9]+)/) || spUrl.match(/^[a-zA-Z0-9]{22}$/);
      const playlistId = match ? (match[1] || match[0]) : null;

      if (!playlistId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçerli bir Spotify çalma listesi bağlantısı bulunamadı.' }));
        return;
      }

      const spData = await fetchSpotifyPlaylist(playlistId);
      const library = readLibrary();

      // Convert tracks into Müzikal songs (resolve the first 8 immediately for instant playback)
      const songs = [];
      const resolveLimit = Math.min(spData.tracks.length, 8);

      for (let i = 0; i < spData.tracks.length; i++) {
        const tr = spData.tracks[i];
        if (i < resolveLimit) {
          try {
            const searchResults = await searchYouTube(`${tr.title} ${tr.artist}`);
            if (searchResults && searchResults.length > 0) {
              const best = searchResults[0];
              songs.push({
                id: best.id,
                title: tr.title,
                channel: tr.artist,
                duration: best.duration || tr.duration,
                thumbnail: best.thumbnail || spData.coverUrl,
                spotifyResolved: true
              });
              continue;
            }
          } catch (e) {
            console.error('Search error for track:', tr.title, e);
          }
        }

        // Deferred / pending resolution
        songs.push({
          id: `sp_${playlistId}_${i}`,
          title: tr.title,
          channel: tr.artist,
          duration: tr.duration,
          thumbnail: spData.coverUrl,
          spotifySearchQuery: `${tr.title} ${tr.artist}`,
          spotifyResolved: false
        });
      }

      const newPlaylist = {
        id: 'sp_pl_' + Date.now(),
        name: spData.title,
        description: spData.subtitle || `Spotify'dan aktarıldı (${spData.tracks.length} şarkı)`,
        cover: spData.coverUrl,
        isSpotify: true,
        spotifyId: playlistId,
        songs: songs
      };

      library.playlists.push(newPlaylist);
      writeLibrary(library);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, playlist: newPlaylist }));
      return;
    }

    // 10. Resolve single Spotify Track to YouTube
    if (pathname === '/api/spotify/resolve' && req.method === 'GET') {
      const q = (parsedUrl.searchParams.get('q') || '').trim();
      if (!q) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Query required' }));
        return;
      }
      const results = await searchYouTube(q);
      const best = results && results.length > 0 ? results[0] : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: best }));
      return;
    }

    // 10.1 YouTube Music Playlist Import
    if ((pathname === '/api/ytmusic/import' || pathname === '/api/ytmusic/playlist') && req.method === 'POST') {
      const body = await parseBody(req);
      const ytmUrl = (body.url || '').trim();
      const email = (body.email || '').trim().toLowerCase();

      if (!ytmUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'YouTube Music çalma listesi bağlantısı gereklidir.' }));
        return;
      }

      try {
        const ytmData = await fetchYouTubeMusicPlaylist(ytmUrl);
        const library = readLibrary();

        const songs = ytmData.tracks.map(t => ({
          id: t.id,
          title: t.title,
          channel: t.artist,
          duration: t.duration,
          thumbnail: t.thumbnail
        }));

        const newPlaylist = {
          id: 'ytm_pl_' + Date.now(),
          name: ytmData.title,
          description: `${ytmData.uploader} üzerinden aktarıldı (${songs.length} şarkı)`,
          cover: ytmData.coverUrl,
          isYtMusic: true,
          ytmId: ytmData.id,
          songs: songs
        };

        library.playlists.push(newPlaylist);
        writeLibrary(library);

        // If user is signed in with Google, also sync directly to cloud user file
        if (email) {
          const userData = readUserData(email);
          if (userData) {
            userData.library = library;
            userData.user.lastSync = Date.now();
            writeUserData(email, userData);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, playlist: newPlaylist, count: songs.length }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'YouTube Music listesi aktarılamadı' }));
        return;
      }
    }

    // --- OFFLINE DOWNLOADS ---

    // 11. Download Status API
    if (pathname === '/api/downloads' && req.method === 'GET') {
      const downloadedIds = getDownloadedTrackIds();
      const active = {};
      for (const [k, v] of activeDownloads.entries()) {
        active[k] = v;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ downloadedIds, activeDownloads: active }));
      return;
    }

    // 12. Download Single Track
    if (pathname === '/api/download/track' && req.method === 'POST') {
      const { song } = await parseBody(req);
      if (!song || !song.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Song required' }));
        return;
      }

      let targetSong = song;
      if (!song.spotifyResolved && song.spotifySearchQuery) {
        try {
          const sr = await searchYouTube(song.spotifySearchQuery);
          if (sr && sr.length > 0) {
            targetSong = {
              ...song,
              id: sr[0].id,
              duration: sr[0].duration || song.duration,
              thumbnail: song.thumbnail || sr[0].thumbnail,
              spotifyResolved: true
            };
          }
        } catch (e) {}
      }

      // Check if already downloaded
      const isDownloaded = fs.existsSync(path.join(DOWNLOADS_DIR, `${targetSong.id}.m4a`)) ||
                           fs.existsSync(path.join(DOWNLOADS_DIR, `${targetSong.id}.mp3`));
      if (isDownloaded) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, alreadyDownloaded: true, resolvedId: targetSong.id }));
        return;
      }

      // Trigger download in background
      startTrackDownload(targetSong).catch(err => console.error('Download error:', err));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status: 'downloading', resolvedId: targetSong.id }));
      return;
    }

    // 13. Download Entire Playlist or Song List
    if (pathname === '/api/download/playlist' && req.method === 'POST') {
      const body = await parseBody(req);
      const playlistId = body && body.playlistId;
      const passedSongs = body && Array.isArray(body.songs) ? body.songs : null;

      const library = readLibrary();
      const playlist = playlistId ? (library.playlists || []).find(p => p.id === playlistId) : null;
      const targetSongs = (passedSongs && passedSongs.length > 0)
        ? passedSongs
        : (playlist && Array.isArray(playlist.songs) ? playlist.songs : []);

      if (!targetSongs || targetSongs.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'İndirilecek şarkı bulunamadı' }));
        return;
      }

      // Queue all songs sequentially in background
      (async () => {
        let libraryChanged = false;
        for (let i = 0; i < targetSongs.length; i++) {
          const song = targetSongs[i];
          if (!song) continue;
          try {
            let targetSong = song;
            // If unresolved spotify song, resolve first and persist ID
            if ((!song.spotifyResolved && song.spotifySearchQuery) || (song.id && String(song.id).startsWith('sp_'))) {
              const q = song.spotifySearchQuery || `${song.title || ''} ${song.channel || ''}`.trim();
              const sr = await searchYouTube(q);
              if (sr && sr.length > 0) {
                targetSong = {
                  ...song,
                  id: sr[0].id,
                  duration: sr[0].duration || song.duration,
                  thumbnail: song.thumbnail || sr[0].thumbnail,
                  spotifyResolved: true
                };
                if (playlist && Array.isArray(playlist.songs)) {
                  const plIdx = playlist.songs.findIndex(s => s.id === song.id || s.title === song.title);
                  if (plIdx >= 0) {
                    playlist.songs[plIdx] = targetSong;
                    libraryChanged = true;
                  }
                }
              }
            }
            await startTrackDownload(targetSong);
          } catch (e) {
            console.error('Playlist download item error:', e);
          }
        }
        if (libraryChanged) {
          writeLibrary(library);
        }
      })();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: targetSongs.length }));
      return;
    }

    // 14. Delete Downloaded Track
    if (pathname.startsWith('/api/download/track/') && req.method === 'DELETE') {
      const songId = pathname.split('/')[4];
      const m4aPath = path.join(DOWNLOADS_DIR, `${songId}.m4a`);
      const mp3Path = path.join(DOWNLOADS_DIR, `${songId}.mp3`);
      if (fs.existsSync(m4aPath)) fs.unlinkSync(m4aPath);
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      activeDownloads.delete(songId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 15. Stream Downloaded Audio file with HTTP Range Support
    if (pathname.startsWith('/downloads/')) {
      const filename = path.basename(pathname);
      const filePath = path.join(DOWNLOADS_DIR, filename);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        });
        fileStream.pipe(res);
        return;
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // 16. In-App Direct Update Endpoints (Windows PC)
    if (pathname === '/api/update/progress' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(inAppUpdateState));
      return;
    }

    if ((pathname === '/api/update/in-app-apply' || pathname === '/api/app/update-windows') && req.method === 'POST') {
      if (inAppUpdateState.inProgress) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Güncelleme zaten devam ediyor.' }));
        return;
      }

      inAppUpdateState = {
        inProgress: true,
        percent: 5,
        status: 'Güncelleme kontrol ediliyor...',
        done: false,
        error: null
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Güncelleme başlatıldı' }));

      runInAppUpdate().catch(err => {
        console.error('In-app update failure:', err);
        inAppUpdateState.inProgress = false;
        inAppUpdateState.error = err.message || 'Güncelleme başarısız';
        inAppUpdateState.status = 'Hata: ' + inAppUpdateState.error;
      });
      return;
    }

    if (pathname === '/api/update/restart' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Sunucu yeniden başlatılıyor...' }));
      setTimeout(() => {
        try {
          try { server.close(); } catch (e) {}
          const child = spawn(process.argv[0], process.argv.slice(1), {
            cwd: __dirname,
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
          });
          child.unref();
          setTimeout(() => process.exit(0), 200);
        } catch (e) {
          console.error('Restart error:', e);
          process.exit(0);
        }
      }, 400);
      return;
    }

    // Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';

    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = { 'Content-Type': contentType };
      if (['.html', '.js', '.css', '.json'].includes(ext)) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexHtml = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    console.error('Server error handling request:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

let listenRetries = 0;
function startListening() {
  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalNetworkIp();
    console.log(`🎵 Müzikal Server running!`);
    console.log(`   - Bu Bilgisayar: http://localhost:${PORT}`);
    console.log(`   - Ağdaki Diğer PC ve Telefonlar: http://${ip}:${PORT}`);
    console.log(`   - Mobil APK İndirme: http://${ip}:${PORT}/Muzikal.apk`);
    if (discordRpc.enabled && discordRpc.clientId) {
      discordRpc.connect();
    }
  });
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && listenRetries < 8) {
    listenRetries++;
    console.warn(`Port ${PORT} busy, retrying in 600ms (${listenRetries}/8)...`);
    setTimeout(() => {
      try { server.close(); } catch (e) {}
      startListening();
    }, 600);
  } else {
    console.error('Server listen error:', err);
  }
});

startListening();
