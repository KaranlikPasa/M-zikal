const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns');
const { spawn } = require('child_process');

// Force IPv4 first to avoid connection timeouts on Windows
dns.setDefaultResultOrder('ipv4first');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;
const APP_VERSION = '1.3.7';
const APP_VERSION_CODE = 19;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'library.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const BIN_DIR = path.join(__dirname, 'bin');
const YT_DLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const APK_FILE = path.join(__dirname, 'Muzikal.apk');

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

// Ensure required directories exist on Drive D
const USERS_DIR = path.join(__dirname, 'data', 'users');
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
const CACHE_TTL = 15 * 60 * 1000;

// Download status tracker
const activeDownloads = new Map(); // songId -> { status: 'downloading'|'done'|'error', progress: 0, title: '' }

// Preset explore categories (pure music hit queries without marathon mix clutter)
const EXPLORE_GENRES = {
  'trendler': 'türkiye top müzik hit şarkılar official audio klip',
  'turkce-pop': 'türkçe pop hit şarkılar audio klip',
  'turkce-rap': 'türkçe rap hip hop şarkılar audio klip',
  'rock': 'türkçe rock ve klasik rock hit şarkılar',
  'akustik': 'türkçe akustik canlı performans şarkılar',
  'lofi': 'lofi hip hop radio beats to relax study to',
  'global': 'top billboard global hit songs official video'
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

// --- SMART RECOMMENDATIONS & ARTIST DIVERSITY ENGINE ---
function extractArtistNames(title, channel) {
  const set = new Set();
  const cLower = (channel || '').toLowerCase().trim();
  // Filter out record labels and generic channel markers
  if (cLower && !/(records|müzik|muzik|music|vevo|entertainment|official|audio|yapım|yapim|netd|video|tv)/i.test(cLower)) {
    set.add(cLower);
  }
  if (title) {
    // Look for separators like " - " or " : "
    const parts = title.split(/\s*[-–—:]\s*/);
    if (parts.length > 1) {
      const lead = parts[0].replace(/[\(\[].*?[\)\]]/g, '').trim().toLowerCase();
      // Split collaborations by &, feat, ft, x, virgül
      const subs = lead.split(/\s*(?:&|feat\.?|ft\.?|\bx\b|,|\/)\s*/i);
      subs.forEach(s => {
        const c = s.trim();
        if (c.length > 1 && !/(official|video|klip|audio|hd|4k)/i.test(c)) set.add(c);
      });
    }
  }
  return Array.from(set);
}

function matchesAnyArtist(candidateTitle, candidateChannel, targetArtists) {
  if (!targetArtists || targetArtists.length === 0) return false;
  const candArtists = extractArtistNames(candidateTitle, candidateChannel);
  const candStr = `${candidateTitle || ''} ${candidateChannel || ''}`.toLowerCase();
  for (const target of targetArtists) {
    const t = (target || '').toLowerCase().trim();
    if (!t || t.length < 2) continue;
    if (candStr.includes(t)) return true;
    for (const c of candArtists) {
      if (c === t || c.includes(t) || t.includes(c)) return true;
    }
  }
  return false;
}

async function getRelatedRecommendations(videoId, currentArtist, currentTitle, excludeArtists = [], excludeIds = []) {
  const currentArtists = extractArtistNames(currentTitle, currentArtist);
  const allExcludedArtists = [
    ...new Set([
      ...currentArtists,
      (currentArtist || '').toLowerCase().trim(),
      ...(excludeArtists || []).map(a => (a || '').toLowerCase().trim()).filter(Boolean)
    ])
  ];
  const seenIds = new Set((excludeIds || []).filter(Boolean));
  if (videoId) seenIds.add(videoId);

  let candidates = [];

  // 1. YouTube InnerTube Watch-Next / Radio API (YouTube's genre & style algorithm)
  if (videoId) {
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
          videoId: videoId
        })
      });

      if (res.ok) {
        const data = await res.json();
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

          if (!id || !title || seenIds.has(id)) continue;
          if (!isGenuineMusicVideo(title, channel, duration, '')) continue;
          // Filter out the same artist and recently played artists!
          if (matchesAnyArtist(title, channel, allExcludedArtists)) continue;

          seenIds.add(id);
          candidates.push({ id, title: title.trim(), channel: channel.trim(), duration, thumbnail: thumb });
        }
      }
    } catch (e) {
      console.warn('InnerTube next recommendations error:', e.message);
    }
  }

  // 2. High-quality genre/vibe fallback search if candidates are insufficient
  if (candidates.length < 6) {
    try {
      const combined = `${currentTitle || ''} ${currentArtist || ''}`.toLowerCase();
      let genreQuery = 'türkiye top popüler hit müzik şarkılar';
      if (/rap|trap|hiphop|hip hop|drill|flow|r&b|rb/i.test(combined)) {
        genreQuery = 'türkçe rap hip hop hit şarkılar official audio';
      } else if (/rock|metal|anadolu rock/i.test(combined)) {
        genreQuery = 'türkçe rock hit şarkılar';
      } else if (/akustik|slow|hüzün|cover|romantik/i.test(combined)) {
        genreQuery = 'türkçe akustik slow popüler şarkılar';
      } else if (currentArtists[0]) {
        genreQuery = `${currentArtists[0]} benzeri şarkılar hit`;
      }

      const searchHits = await searchYouTube(genreQuery);
      for (const t of searchHits) {
        if (!t || !t.id || seenIds.has(t.id)) continue;
        if (matchesAnyArtist(t.title, t.channel, allExcludedArtists)) continue;
        seenIds.add(t.id);
        candidates.push(t);
        if (candidates.length >= 15) break;
      }
    } catch (e) {
      console.warn('Fallback recommendations error:', e.message);
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Muzikal-Updater/1.3.7',
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
    inAppUpdateState.percent = 5;

    const ghRes = await fetch('https://api.github.com/repos/KaranlikPasa/M-zikal/releases/latest', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Muzikal-Updater/1.3.7' }
    });
    if (!ghRes.ok) {
      throw new Error(`GitHub API hatası: HTTP ${ghRes.status}`);
    }
    const release = await ghRes.json();
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

    // Extract using PowerShell Expand-Archive
    await new Promise((resolve, reject) => {
      fs.mkdirSync(extractDir, { recursive: true });
      const ps = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
      ]);
      ps.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Arşiv açılamadı, çıkış kodu: ${code}`));
      });
      ps.on('error', reject);
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

    // 2. Explore / Genres API
    if (pathname === '/api/explore' && req.method === 'GET') {
      const genre = parsedUrl.searchParams.get('genre') || 'trendler';
      const query = EXPLORE_GENRES[genre] || EXPLORE_GENRES['trendler'];
      const results = await searchYouTube(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ genre, results }));
      return;
    }

    // 2.1 Lyrics API (Spotify-style synchronized & plain lyrics via LRCLIB)
    if (pathname === '/api/lyrics' && req.method === 'GET') {
      const rawTitle = (parsedUrl.searchParams.get('title') || '').trim();
      const rawArtist = (parsedUrl.searchParams.get('artist') || '').trim();

      // Clean up common video/clutter suffixes
      let cleanTitle = rawTitle
        .replace(/\s*[\[\(](official|video|klip|audio|lyric|remix|feat|ft\.|prod|hd|4k|hq|remastered|video klip)[^\)\]]*[\)\]]/gi, '')
        .replace(/[-–—]\s*(official|video|klip|audio|lyric).*/gi, '')
        .trim();

      let searchArtist = rawArtist;
      if (cleanTitle.includes(' - ')) {
        const parts = cleanTitle.split(' - ');
        if (!searchArtist || searchArtist === 'Bilinmeyen Sanatçı' || searchArtist.toLowerCase().includes('topic')) {
          searchArtist = parts[0].trim();
        }
        cleanTitle = parts.slice(1).join(' - ').trim();
      }

      const q = `${searchArtist} ${cleanTitle}`.trim();
      if (!q) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Başlık belirtilmedi' }));
        return;
      }

      try {
        const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
        const fetchRes = await fetch(lrclibUrl, {
          headers: { 'User-Agent': 'Muzikal/1.3.0 (https://github.com/KaranlikPasa/M-zikal)' }
        });
        const items = await fetchRes.json();
        if (Array.isArray(items) && items.length > 0) {
          const item = items[0];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            trackName: item.trackName,
            artistName: item.artistName,
            albumName: item.albumName,
            duration: item.duration,
            plainLyrics: item.plainLyrics || null,
            syncedLyrics: item.syncedLyrics || null
          }));
          return;
        }
      } catch (e) {
        console.warn('Lyrics fetch error:', e.message);
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

        // Merge playlists
        const plMap = new Map();
        (existingUser.library.playlists || []).forEach(p => plMap.set(p.name, p));
        (incomingLibrary.playlists || []).forEach(p => {
          if (!plMap.has(p.name)) plMap.set(p.name, p);
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
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
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

    // 3. Library API (Get favorites & playlists)
    if (pathname === '/api/library' && req.method === 'GET') {
      const library = readLibrary();
      const downloaded = getDownloadedTrackIds();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...library, downloadedIds: downloaded }));
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

      // Check if already downloaded
      const isDownloaded = fs.existsSync(path.join(DOWNLOADS_DIR, `${song.id}.m4a`)) ||
                           fs.existsSync(path.join(DOWNLOADS_DIR, `${song.id}.mp3`));
      if (isDownloaded) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, alreadyDownloaded: true }));
        return;
      }

      // Trigger download in background
      startTrackDownload(song).catch(err => console.error('Download error:', err));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status: 'downloading' }));
      return;
    }

    // 13. Download Entire Playlist
    if (pathname === '/api/download/playlist' && req.method === 'POST') {
      const { playlistId } = await parseBody(req);
      const library = readLibrary();
      const playlist = library.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Playlist not found' }));
        return;
      }

      // Queue all songs sequentially
      (async () => {
        for (const song of playlist.songs) {
          try {
            let targetSong = song;
            // If unresolved spotify song, resolve first
            if (!song.spotifyResolved && song.spotifySearchQuery) {
              const res = await searchYouTube(song.spotifySearchQuery);
              if (res && res.length > 0) {
                targetSong = { ...song, id: res[0].id };
              }
            }
            await startTrackDownload(targetSong);
          } catch (e) {
            console.error('Playlist download item error:', e);
          }
        }
      })();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: playlist.songs.length }));
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
          const child = spawn(process.argv[0], process.argv.slice(1), {
            cwd: __dirname,
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          process.exit(0);
        } catch (e) {
          console.error('Restart error:', e);
          process.exit(0);
        }
      }, 1000);
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

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalNetworkIp();
  console.log(`🎵 Müzikal Server running!`);
  console.log(`   - Bu Bilgisayar: http://localhost:${PORT}`);
  console.log(`   - Ağdaki Diğer PC ve Telefonlar: http://${ip}:${PORT}`);
  console.log(`   - Mobil APK İndirme: http://${ip}:${PORT}/Muzikal.apk`);
});
