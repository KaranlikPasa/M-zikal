const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns');
const { spawn } = require('child_process');

// Force IPv4 first to avoid connection timeouts on Windows
dns.setDefaultResultOrder('ipv4first');

const PORT = 3456;
const APP_VERSION = '1.2.9';
const APP_VERSION_CODE = 11;
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
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

// In-memory cache for search queries (15 minutes TTL)
const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

// Download status tracker
const activeDownloads = new Map(); // songId -> { status: 'downloading'|'done'|'error', progress: 0, title: '' }

// Preset explore categories
const EXPLORE_GENRES = {
  'trendler': 'en çok dinlenen popüler şarkılar 2024 2025',
  'turkce-pop': 'en iyi türkçe pop şarkılar',
  'turkce-rap': 'en popüler türkçe rap şarkılar',
  'rock': 'türkçe rock ve yabancı klasik rock efsaneleri',
  'akustik': 'türkçe akustik sakin şarkılar',
  'lofi': 'lofi hip hop radio beats to relax study to',
  'global': 'top billboard global hits 2024 2025'
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

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://127.0.0.1:3456');
  const pathname = parsedUrl.pathname;

  // CORS headers for local usage
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

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

    // 2. Explore / Genres API
    if (pathname === '/api/explore' && req.method === 'GET') {
      const genre = parsedUrl.searchParams.get('genre') || 'trendler';
      const query = EXPLORE_GENRES[genre] || EXPLORE_GENRES['trendler'];
      const results = await searchYouTube(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ genre, results }));
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

    // 16. Windows In-App Silent Auto-Update
    if (pathname === '/api/app/update-windows' && req.method === 'POST') {
      try {
        const ghRes = await fetch('https://api.github.com/repos/KaranlikPasa/M-zikal/releases/latest', {
          headers: { 'User-Agent': 'Muzikal-Updater' }
        });
        const release = await ghRes.json();
        const setupAsset = release.assets && release.assets.find(a => a.name.endsWith('Setup.exe') || a.name.endsWith('.exe'));
        if (!setupAsset) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Kurulum dosyası bulunamadı.' }));
          return;
        }

        const tempDir = process.env.TEMP || os.tmpdir();
        const installerPath = path.join(tempDir, 'Muzikal-Setup.exe');

        const fileRes = await fetch(setupAsset.browser_download_url, {
          headers: { 'User-Agent': 'Muzikal-Updater' }
        });
        const arrayBuf = await fileRes.arrayBuffer();
        fs.writeFileSync(installerPath, Buffer.from(arrayBuf));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Güncelleme indirildi, kuruluyor...' }));

        setTimeout(() => {
          const cp = spawn(installerPath, ['/SILENT', '/UPDATE'], {
            detached: true,
            stdio: 'ignore'
          });
          cp.unref();
          process.exit(0);
        }, 1200);
        return;
      } catch (err) {
        console.error('Windows update error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
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
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexHtml = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
