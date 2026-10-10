// --- MÜZİKAL CLIENT APPLICATION WITH SPOTIFY & OFFLINE DOWNLOADS ---

const state = {
  currentSong: null,
  currentPlaylist: [],
  currentIndex: -1,
  queue: [],
  isPlaying: false,
  isMuted: false,
  volume: 80,
  repeatMode: 'all', // 'off', 'all', 'one'
  isShuffled: false,
  shuffleMode: 'off', // 'off', 'standard', 'smart'
  smartShuffleCounter: 0,
  shuffledIndices: [],
  isOfflinePlaying: false,
  downloadedIds: new Set(),
  activeDownloads: new Map(),
  library: {
    favorites: [],
    playlists: [],
    history: []
  },
  currentView: 'home',
  currentGenre: 'trendler',
  currentPlaylistId: null,
  isVideoVisible: false,
  viewMode: localStorage.getItem('muzikal_view_mode') || 'grid'
};

let ytPlayer = null;
let ytReady = false;
let progressInterval = null;
let searchDebounceTimer = null;
let pollDownloadsTimer = null;

// Local HTML5 Audio player for offline playback
const localAudio = document.getElementById('local-audio-player');

// --- DOM ELEMENTS ---
const elements = {
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  sidebarPlaylists: document.getElementById('sidebar-playlist-items'),
  favCountBadge: document.getElementById('fav-count-badge'),
  downloadsCountBadge: document.getElementById('downloads-count-badge'),
  btnNewPlaylist: document.getElementById('btn-new-playlist'),
  btnSidebarSpotify: document.getElementById('btn-sidebar-spotify'),
  
  // Sidebar NP
  sidebarNp: document.getElementById('sidebar-now-playing'),
  sidebarNpThumb: document.getElementById('sidebar-np-thumb'),
  sidebarNpTitle: document.getElementById('sidebar-np-title'),
  sidebarNpArtist: document.getElementById('sidebar-np-artist'),

  // Search & Filters
  searchInput: document.getElementById('search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  categoryChips: document.getElementById('category-chips'),
  
  // Topbar Actions
  btnOpenSpotifyModal: document.getElementById('btn-open-spotify-modal'),
  btnOpenQueue: document.getElementById('btn-open-queue'),
  queueBadge: document.getElementById('queue-badge'),
  btnToggleVideo: document.getElementById('btn-toggle-video-view'),
  btnVideoText: document.getElementById('btn-video-text'),
  videoContainer: document.getElementById('video-container'),
  videoNowTitle: document.getElementById('video-now-title'),
  btnCloseVideo: document.getElementById('btn-close-video'),

  // Content Views
  heroBanner: document.getElementById('hero-banner'),
  heroVinyl: document.getElementById('hero-vinyl'),
  btnHeroPlay: document.getElementById('btn-hero-play'),
  btnHeroSpotify: document.getElementById('btn-hero-spotify'),
  currentSectionTitle: document.getElementById('current-section-title'),
  currentSectionDesc: document.getElementById('current-section-desc'),
  sectionActions: document.getElementById('section-actions'),
  btnViewGrid: document.getElementById('btn-view-grid'),
  btnViewList: document.getElementById('btn-view-list'),
  songsGrid: document.getElementById('songs-grid'),
  loadingState: document.getElementById('loading-state'),
  loadingText: document.getElementById('loading-text'),
  emptyState: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyDesc: document.getElementById('empty-desc'),

  // Queue Drawer
  queueDrawer: document.getElementById('queue-drawer'),
  btnCloseQueue: document.getElementById('btn-close-queue'),
  queueNpItem: document.getElementById('queue-np-item'),
  queueItems: document.getElementById('queue-items'),
  btnClearQueue: document.getElementById('btn-clear-queue'),

  // Player Bar
  playerThumb: document.getElementById('player-thumb'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  playerOfflineBadge: document.getElementById('player-offline-badge'),
  playerSmartBadge: document.getElementById('player-smart-badge'),
  smartShuffleDot: document.getElementById('smart-shuffle-dot'),
  playerFavBtn: document.getElementById('player-fav-btn'),
  playingIndicator: document.getElementById('playing-indicator'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playPauseIcon: document.getElementById('play-pause-icon'),
  btnNext: document.getElementById('btn-next'),
  btnRepeat: document.getElementById('btn-repeat'),
  currentTime: document.getElementById('current-time'),
  totalDuration: document.getElementById('total-duration'),
  progressBarTrack: document.getElementById('progress-bar-track'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressBarHandle: document.getElementById('progress-bar-handle'),
  btnVolumeIcon: document.getElementById('btn-volume-icon'),
  volumeSvg: document.getElementById('volume-svg'),
  volumeSliderTrack: document.getElementById('volume-slider-track'),
  volumeSliderFill: document.getElementById('volume-slider-fill'),

  // Modals & Toast
  playlistModal: document.getElementById('playlist-modal'),
  modalPlName: document.getElementById('modal-pl-name'),
  modalPlDesc: document.getElementById('modal-pl-desc'),
  btnCancelModal: document.getElementById('btn-cancel-modal'),
  btnSaveModal: document.getElementById('btn-save-modal'),

  spotifyModal: document.getElementById('spotify-modal'),
  modalSpUrl: document.getElementById('modal-sp-url'),
  btnCancelSpModal: document.getElementById('btn-cancel-sp-modal'),
  btnImportSpModal: document.getElementById('btn-import-sp-modal'),
  spBtnText: document.getElementById('sp-btn-text'),
  spSpinner: document.getElementById('sp-spinner'),

  toast: document.getElementById('toast-notification'),

  // Mobile References
  mobileNavBtns: document.querySelectorAll('.mobile-nav-btn'),
  btnMobileMenu: document.getElementById('btn-mobile-menu'),
  btnMobileSpotifyTop: document.getElementById('btn-mobile-spotify-top'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  sidebar: document.querySelector('.sidebar'),
  miniProgressLine: document.getElementById('mini-progress-line'),
  playerTrackInfo: document.querySelector('.player-track-info'),

  // Mobile Full-Screen Player
  mobileFullPlayer: document.getElementById('mobile-full-player'),
  mfpBtnCollapse: document.getElementById('mfp-btn-collapse'),
  mfpArtwork: document.getElementById('mfp-artwork'),
  mfpTitle: document.getElementById('mfp-title'),
  mfpArtist: document.getElementById('mfp-artist'),
  mfpSmartBadge: document.getElementById('mfp-smart-badge'),
  mfpFavBtn: document.getElementById('mfp-fav-btn'),
  mfpFavIcon: document.getElementById('mfp-fav-icon'),
  mfpProgressTrack: document.getElementById('mfp-progress-track'),
  mfpProgressFill: document.getElementById('mfp-progress-fill'),
  mfpProgressHandle: document.getElementById('mfp-progress-handle'),
  mfpCurrentTime: document.getElementById('mfp-current-time'),
  mfpTotalDuration: document.getElementById('mfp-total-duration'),
  mfpBtnShuffle: document.getElementById('mfp-btn-shuffle'),
  mfpSmartShuffleDot: document.getElementById('mfp-smart-shuffle-dot'),
  mfpBtnPrev: document.getElementById('mfp-btn-prev'),
  mfpBtnPlayPause: document.getElementById('mfp-btn-play-pause'),
  mfpPlayPauseIcon: document.getElementById('mfp-play-pause-icon'),
  mfpBtnNext: document.getElementById('mfp-btn-next'),
  mfpBtnRepeat: document.getElementById('mfp-btn-repeat'),
  mfpBtnDownload: document.getElementById('mfp-btn-download'),
  mfpDownloadLabel: document.getElementById('mfp-download-label'),
  mfpBtnQueueToggle: document.getElementById('mfp-btn-queue-toggle')
};

// --- YOUTUBE IFRAME API INITIALIZATION ---
window.onYouTubeIframeAPIReady = function() {
  const origin = (window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'https://www.youtube.com';

  ytPlayer = new YT.Player('yt-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      'autoplay': 1,
      'controls': 1,
      'rel': 0,
      'modestbranding': 1,
      'playsinline': 1,
      'enablejsapi': 1,
      'origin': origin,
      'widget_referrer': 'https://www.youtube.com'
    },
    events: {
      'onReady': () => {
        ytReady = true;
        ytPlayer.setVolume(state.volume);
      },
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
    }
  });
};

const BUNDLED_EXPLORE_SONGS = [
  { id: 'IcXsGn_iFUA', title: 'Türkçe Pop Müzik 2025 Mix - En Çok Dinlenenler', channel: 'Müzikal Hits', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/IcXsGn_iFUA/hqdefault.jpg' },
  { id: '1G4isv_Fylg', title: 'Coldplay - Paradise (Official Video)', channel: 'Coldplay', duration: '4:20', thumbnail: 'https://i.ytimg.com/vi/1G4isv_Fylg/hqdefault.jpg' },
  { id: 'kXYiU_JCYtU', title: 'Numb - Linkin Park', channel: 'Linkin Park', duration: '3:07', thumbnail: 'https://i.ytimg.com/vi/kXYiU_JCYtU/hqdefault.jpg' },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody - Queen', channel: 'Queen Official', duration: '5:55', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
  { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channel: 'Luis Fonsi', duration: '4:42', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg' },
  { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', channel: 'Ed Sheeran', duration: '4:24', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' },
  { id: '4NRXx6U8ABQ', title: 'The Weeknd - Blinding Lights', channel: 'The Weeknd', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
  { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk ft. Bruno Mars', channel: 'Mark Ronson', duration: '4:30', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg' },
  { id: 'hT_nvWreIhg', title: 'OneRepublic - Counting Stars', channel: 'OneRepublic', duration: '4:44', thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg' },
  { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', channel: 'Maroon 5', duration: '5:01', thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg' },
  { id: 'RgKAFK5djSk', title: 'Wiz Khalifa - See You Again ft. Charlie Puth', channel: 'Wiz Khalifa', duration: '3:58', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg' },
  { id: 'CevxZvSJLk8', title: 'Katy Perry - Roar', channel: 'Katy Perry', duration: '4:30', thumbnail: 'https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg' },
  { id: 'YQHsXMglC9A', title: 'Adele - Hello', channel: 'Adele', duration: '6:07', thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg' },
  { id: 'L_XJ_s5IsQc', title: 'Eminem - Lose Yourself', channel: 'Eminem', duration: '5:26', thumbnail: 'https://i.ytimg.com/vi/L_XJ_s5IsQc/hqdefault.jpg' },
  { id: 'nfWlot6h_JM', title: 'Taylor Swift - Shake It Off', channel: 'Taylor Swift', duration: '4:02', thumbnail: 'https://i.ytimg.com/vi/nfWlot6h_JM/hqdefault.jpg' }
];

// --- UNIFIED API ENGINE (NATIVE ANDROID BRIDGE + HTTP FALLBACK) ---
async function apiFetch(endpoint, options = {}) {
  // 1. Android Native Bridge
  if (window.MuzikalNative && typeof window.MuzikalNative.isNative === 'function') {
    try {
      if (endpoint.startsWith('/api/explore')) {
        const dummy = new URL('http://local' + endpoint);
        const genre = dummy.searchParams.get('genre') || 'trendler';
        const resStr = window.MuzikalNative.explore(genre);
        if (resStr) {
          const parsed = JSON.parse(resStr);
          if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) return parsed;
        }
      }
      if (endpoint.startsWith('/api/search')) {
        const dummy = new URL('http://local' + endpoint);
        const q = dummy.searchParams.get('q') || '';
        const resStr = window.MuzikalNative.search(q);
        if (resStr) {
          const parsed = JSON.parse(resStr);
          if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) return parsed;
        }
      }
      if (endpoint.startsWith('/api/library') && (!options.method || options.method === 'GET')) {
        const resStr = window.MuzikalNative.getLibrary();
        if (resStr) return JSON.parse(resStr);
      }
    } catch (err) {
      console.warn('Native bridge error, falling back to fetch:', err);
    }
  }

  // 2. Standard Fetch (works via shouldInterceptRequest or server.js)
  try {
    const res = await fetch(endpoint, options);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Relative fetch on file:/// may throw
  }

  // 3. Guaranteed Fallback for explore
  if (endpoint.startsWith('/api/explore')) {
    return { results: BUNDLED_EXPLORE_SONGS };
  }

  return { results: [] };
}

function getStoredLibrary() {
  try {
    const raw = localStorage.getItem('muzikal_library_data');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { favorites: [], playlists: [], history: [] };
}

function persistLibrary(lib) {
  try {
    const json = JSON.stringify(lib);
    localStorage.setItem('muzikal_library_data', json);
    if (window.MuzikalNative && typeof window.MuzikalNative.saveLibrary === 'function') {
      window.MuzikalNative.saveLibrary(json);
    }
  } catch (e) {}
}

function onPlayerStateChange(event) {
  if (state.isOfflinePlaying) return; // Managed by localAudio

  if (event.data === YT.PlayerState.PLAYING) {
    state.isPlaying = true;
    updatePlayPauseButton();
    startProgressTracker();
    elements.heroVinyl.classList.remove('paused');
    elements.playingIndicator.classList.add('active');
  } else if (event.data === YT.PlayerState.PAUSED) {
    state.isPlaying = false;
    updatePlayPauseButton();
    elements.heroVinyl.classList.add('paused');
    elements.playingIndicator.classList.remove('active');
  } else if (event.data === YT.PlayerState.ENDED) {
    onSongEnded();
  }
}

async function onPlayerError(event) {
  if (state.isOfflinePlaying) return;
  console.warn('YouTube playback error:', event.data, state.currentSong);

  const song = state.currentSong;
  if (!song) {
    playNext();
    return;
  }

  // If this song already attempted fallback, proceed to next song
  if (song._fallbackAttempted) {
    showToast('Bu parça oynatılamadı. Sonraki parçaya geçiliyor...');
    setTimeout(() => playNext(), 1200);
    return;
  }

  // Mark fallback attempt
  song._fallbackAttempted = true;
  showToast('Bu video kısıtlı, alternatif kaynak aranıyor...');

  try {
    const q = `${song.title} ${song.channel || ''} audio`;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const candidate = data.results && data.results.find(r => r.id && r.id !== song.id);

    if (candidate && candidate.id) {
      console.log('Found alternative audio for restricted track:', candidate);
      showToast('🎵 Alternatif kaynaktan oynatılıyor...');
      song.id = candidate.id;
      if (candidate.duration) song.duration = candidate.duration;
      if (ytReady && ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById({ videoId: candidate.id, startSeconds: 0 });
        ytPlayer.playVideo();
      }
      return;
    }
  } catch (err) {
    console.error('Fallback search error:', err);
  }

  showToast('Alternatif bulunamadı. Sonraki şarkıya geçiliyor...');
  setTimeout(() => playNext(), 1500);
}

// --- LOCAL HTML5 AUDIO SETUP (OFFLINE MODE) ---
if (localAudio) {
  localAudio.addEventListener('play', () => {
    state.isPlaying = true;
    updatePlayPauseButton();
    elements.heroVinyl.classList.remove('paused');
    elements.playingIndicator.classList.add('active');
  });

  localAudio.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayPauseButton();
    elements.heroVinyl.classList.add('paused');
    elements.playingIndicator.classList.remove('active');
  });

  localAudio.addEventListener('ended', () => {
    onSongEnded();
  });

  localAudio.addEventListener('timeupdate', () => {
    if (!state.isOfflinePlaying) return;
    const current = localAudio.currentTime || 0;
    const duration = localAudio.duration || 0;

    elements.currentTime.textContent = formatTime(current);
    elements.totalDuration.textContent = formatTime(duration);

    if (duration > 0) {
      const pct = (current / duration) * 100;
      elements.progressBarFill.style.width = `${pct}%`;
      elements.progressBarHandle.style.left = `${pct}%`;
      if (elements.miniProgressLine) elements.miniProgressLine.style.width = `${pct}%`;
      if (elements.mfpProgressFill) elements.mfpProgressFill.style.width = `${pct}%`;
      if (elements.mfpProgressHandle) elements.mfpProgressHandle.style.left = `${pct}%`;
      if (elements.mfpCurrentTime) elements.mfpCurrentTime.textContent = formatTime(current);
      if (elements.mfpTotalDuration) elements.mfpTotalDuration.textContent = formatTime(duration);
    }
  });

  localAudio.addEventListener('error', (e) => {
    if (!state.isOfflinePlaying) return;
    console.error('Local audio error:', e);
    showToast('Yerel ses dosyası oynatılamadı. Çevrim içi deneniyor...');
    state.isOfflinePlaying = false;
    if (state.currentSong) playOnlineSong(state.currentSong);
  });
}

// --- DUAL-ENGINE PLAY ENGINE ---

async function playSong(song, playlist = null, index = -1) {
  if (!song) return;

  // 1. If this is an unresolved Spotify track, resolve it first
  if (!song.spotifyResolved && song.spotifySearchQuery) {
    showToast(`"${song.title}" hazırlanıyor...`);
    try {
      const res = await fetch(`/api/spotify/resolve?q=${encodeURIComponent(song.spotifySearchQuery)}`);
      const data = await res.json();
      if (data.result) {
        song.id = data.result.id;
        song.thumbnail = data.result.thumbnail || song.thumbnail;
        song.duration = data.result.duration || song.duration;
        song.spotifyResolved = true;
      }
    } catch (e) {
      console.error('Track resolution error:', e);
    }
  }

  state.currentSong = song;
  if (playlist) {
    state.currentPlaylist = playlist;
    state.currentIndex = index >= 0 ? index : playlist.findIndex(s => s.id === song.id);
  }

  // Update UI Metadata
  elements.playerThumb.src = song.thumbnail || 'https://via.placeholder.com/60';
  elements.playerTitle.textContent = song.title || 'Bilinmeyen Şarkı';
  elements.playerArtist.textContent = song.channel || 'Bilinmeyen Sanatçı';
  document.title = `🎵 ${song.title} - Müzikal`;

  elements.sidebarNpThumb.src = song.thumbnail || '';
  elements.sidebarNpTitle.textContent = song.title;
  elements.sidebarNpArtist.textContent = song.channel;
  elements.sidebarNp.style.display = 'flex';

  elements.videoNowTitle.textContent = `${song.title} - ${song.channel}`;

  // Mobile Full-Screen Player updates
  if (elements.mfpArtwork) elements.mfpArtwork.src = song.thumbnail || 'https://via.placeholder.com/320';
  if (elements.mfpTitle) elements.mfpTitle.textContent = song.title || 'Bilinmeyen Şarkı';
  if (elements.mfpArtist) elements.mfpArtist.textContent = song.channel || 'Bilinmeyen Sanatçı';

  // Activate player bar on mobile
  const playerBar = document.querySelector('.player-bar');
  if (playerBar) playerBar.classList.add('active');

  syncLikeState();

  // Smart Recommendation Badge
  const isSmartRec = !!song.isSmartRecommendation;
  if (elements.playerSmartBadge) {
    elements.playerSmartBadge.style.display = isSmartRec ? 'inline-flex' : 'none';
  }
  if (elements.mfpSmartBadge) {
    elements.mfpSmartBadge.style.display = isSmartRec ? 'inline-flex' : 'none';
  }

  // Check if song is downloaded offline
  const isOffline = state.downloadedIds.has(song.id);
  if (elements.mfpDownloadLabel) {
    elements.mfpDownloadLabel.textContent = isOffline ? 'Cihazda Kayıtlı' : 'Cihaza İndir';
  }

  if (isOffline) {
    // Play locally through HTML5 audio!
    state.isOfflinePlaying = true;
    elements.playerOfflineBadge.style.display = 'inline-block';

    // Stop YouTube
    if (ytReady && ytPlayer && ytPlayer.stopVideo) {
      ytPlayer.stopVideo();
    }

    localAudio.src = `/downloads/${song.id}.m4a`;
    localAudio.volume = state.isMuted ? 0 : (state.volume / 100);
    localAudio.play().catch(e => console.warn('Autoplay prevented:', e));
  } else {
    // Play online through YouTube
    state.isOfflinePlaying = false;
    elements.playerOfflineBadge.style.display = 'none';

    // Stop local audio
    localAudio.pause();

    if (ytReady && ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById({ videoId: song.id, startSeconds: 0 });
      ytPlayer.playVideo();
    }
  }

  // Highlight active song in grid
  document.querySelectorAll('.song-card').forEach(card => {
    if (card.dataset.id === song.id) {
      card.classList.add('playing');
    } else {
      card.classList.remove('playing');
    }
  });

  // Record history to backend
  fetch('/api/library/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song })
  }).catch(() => {});

  updateQueueDrawer();
}

function togglePlayPause() {
  if (!state.currentSong) {
    if (state.currentPlaylist.length > 0) {
      playSong(state.currentPlaylist[0], state.currentPlaylist, 0);
    }
    return;
  }

  if (state.isOfflinePlaying) {
    if (localAudio.paused) {
      localAudio.play();
    } else {
      localAudio.pause();
    }
  } else {
    if (!ytReady || !ytPlayer) return;
    if (state.isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }
}

function updatePlayPauseButton() {
  if (state.isPlaying) {
    elements.playPauseIcon.innerHTML = `
      <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
      <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
    `;
    if (elements.mfpPlayPauseIcon) {
      elements.mfpPlayPauseIcon.innerHTML = `
        <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
        <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
      `;
    }
  } else {
    elements.playPauseIcon.innerHTML = `
      <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>
    `;
    if (elements.mfpPlayPauseIcon) {
      elements.mfpPlayPauseIcon.innerHTML = `
        <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>
      `;
    }
  }
}

async function playNext() {
  if (state.queue.length > 0) {
    const nextSong = state.queue.shift();
    elements.queueBadge.textContent = state.queue.length;
    playSong(nextSong);
    return;
  }

  if (state.currentPlaylist.length === 0) return;

  // SMART SHUFFLE: every ~3 tracks, fetch and play a related recommendation
  if (state.shuffleMode === 'smart') {
    state.smartShuffleCounter = (state.smartShuffleCounter || 0) + 1;
    if (state.smartShuffleCounter % 3 === 0 && state.currentSong && !state.isOfflinePlaying) {
      try {
        const queryTerm = (state.currentSong.channel || state.currentSong.title || '').replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ').trim();
        const searchData = await apiFetch(`/api/search?q=${encodeURIComponent(queryTerm + ' popüler şarkıları')}`);
        const recs = searchData.results || (Array.isArray(searchData) ? searchData : []);
        const existingIds = new Set(state.currentPlaylist.map(s => s.id));
        if (state.currentSong) existingIds.add(state.currentSong.id);
        const candidates = recs.filter(s => s && s.id && !existingIds.has(s.id));
        if (candidates.length > 0) {
          const picked = { ...candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))], isSmartRecommendation: true };
          showToast(`✨ Akıllı Öneri: ${picked.title}`);
          playSong(picked, state.currentPlaylist, state.currentIndex);
          return;
        }
      } catch (err) {
        console.warn('Smart shuffle recommendation fallback:', err);
      }
    }

    const nextIdx = Math.floor(Math.random() * state.currentPlaylist.length);
    const nextSong = { ...state.currentPlaylist[nextIdx], isSmartRecommendation: false };
    playSong(nextSong, state.currentPlaylist, nextIdx);
    return;
  }

  // STANDARD SHUFFLE
  if (state.isShuffled || state.shuffleMode === 'standard') {
    const nextIdx = Math.floor(Math.random() * state.currentPlaylist.length);
    const nextSong = { ...state.currentPlaylist[nextIdx], isSmartRecommendation: false };
    playSong(nextSong, state.currentPlaylist, nextIdx);
    return;
  }

  // SEQUENTIAL
  let nextIdx = state.currentIndex + 1;
  if (nextIdx >= state.currentPlaylist.length) {
    if (state.repeatMode === 'off') return;
    nextIdx = 0;
  }

  const nextSong = { ...state.currentPlaylist[nextIdx], isSmartRecommendation: false };
  playSong(nextSong, state.currentPlaylist, nextIdx);
}

function playPrev() {
  if (state.isOfflinePlaying) {
    if (localAudio.currentTime > 3) {
      localAudio.currentTime = 0;
      return;
    }
  } else if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) {
    ytPlayer.seekTo(0);
    return;
  }

  if (state.currentPlaylist.length === 0) return;

  let prevIdx = state.currentIndex - 1;
  if (prevIdx < 0) prevIdx = state.currentPlaylist.length - 1;
  const prevSong = { ...state.currentPlaylist[prevIdx], isSmartRecommendation: false };
  playSong(prevSong, state.currentPlaylist, prevIdx);
}

function updateShuffleUI() {
  const mode = state.shuffleMode || (state.isShuffled ? 'standard' : 'off');
  state.shuffleMode = mode;
  state.isShuffled = (mode !== 'off');

  // Desktop shuffle button
  if (elements.btnShuffle) {
    elements.btnShuffle.classList.toggle('active', mode === 'standard' || mode === 'smart');
    elements.btnShuffle.classList.toggle('smart-active', mode === 'smart');
    if (elements.smartShuffleDot) {
      elements.smartShuffleDot.style.display = mode === 'smart' ? 'block' : 'none';
    }
    if (mode === 'smart') {
      elements.btnShuffle.title = 'Akıllı Karışık Çalma Açık (✨)';
    } else if (mode === 'standard') {
      elements.btnShuffle.title = 'Karışık Çalma Açık (🔀)';
    } else {
      elements.btnShuffle.title = 'Karışık Çal';
    }
  }

  // Mobile full-screen shuffle button
  if (elements.mfpBtnShuffle) {
    elements.mfpBtnShuffle.classList.toggle('active', mode === 'standard' || mode === 'smart');
    elements.mfpBtnShuffle.classList.toggle('smart-active', mode === 'smart');
    if (elements.mfpSmartShuffleDot) {
      elements.mfpSmartShuffleDot.style.display = mode === 'smart' ? 'block' : 'none';
    }
    if (mode === 'smart') {
      elements.mfpBtnShuffle.title = 'Akıllı Karışık Çalma Açık (✨)';
    } else if (mode === 'standard') {
      elements.mfpBtnShuffle.title = 'Karışık Çalma Açık (🔀)';
    } else {
      elements.mfpBtnShuffle.title = 'Karışık Çal';
    }
  }
}

function cycleShuffleMode() {
  if (state.shuffleMode === 'off' || !state.shuffleMode) {
    state.shuffleMode = 'standard';
    updateShuffleUI();
    showToast('🔀 Karışık Çalma Açık');
  } else if (state.shuffleMode === 'standard') {
    state.shuffleMode = 'smart';
    updateShuffleUI();
    showToast('✨ Akıllı Karışık Çalma Açık (Öneriler Dahil)');
  } else {
    state.shuffleMode = 'off';
    updateShuffleUI();
    showToast('Karışık Çalma Kapalı');
  }
}

function onSongEnded() {
  if (state.repeatMode === 'one' && state.currentSong) {
    if (state.isOfflinePlaying) {
      localAudio.currentTime = 0;
      localAudio.play();
    } else {
      ytPlayer.seekTo(0);
      ytPlayer.playVideo();
    }
  } else {
    playNext();
  }
}

// --- PROGRESS & SEEKING ---

function startProgressTracker() {
  if (progressInterval) clearInterval(progressInterval);

  progressInterval = setInterval(() => {
    if (state.isOfflinePlaying) return; // Handled by localAudio timeupdate
    if (!ytReady || !ytPlayer || !state.isPlaying) return;

    try {
      const current = ytPlayer.getCurrentTime() || 0;
      const duration = ytPlayer.getDuration() || 0;

      elements.currentTime.textContent = formatTime(current);
      elements.totalDuration.textContent = formatTime(duration);

      if (duration > 0) {
        const pct = (current / duration) * 100;
        elements.progressBarFill.style.width = `${pct}%`;
        elements.progressBarHandle.style.left = `${pct}%`;
        if (elements.miniProgressLine) elements.miniProgressLine.style.width = `${pct}%`;
        if (elements.mfpProgressFill) elements.mfpProgressFill.style.width = `${pct}%`;
        if (elements.mfpProgressHandle) elements.mfpProgressHandle.style.left = `${pct}%`;
        if (elements.mfpCurrentTime) elements.mfpCurrentTime.textContent = formatTime(current);
        if (elements.mfpTotalDuration) elements.mfpTotalDuration.textContent = formatTime(duration);
      }
    } catch (e) {}
  }, 500);
}

function seekToTrack(trackElem, event) {
  const rect = trackElem.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));

  if (state.isOfflinePlaying) {
    const duration = localAudio.duration || 0;
    if (duration > 0) {
      localAudio.currentTime = duration * pct;
    }
  } else {
    if (!ytReady || !ytPlayer) return;
    const duration = ytPlayer.getDuration() || 0;
    if (duration > 0) {
      ytPlayer.seekTo(duration * pct, true);
    }
  }

  elements.progressBarFill.style.width = `${pct * 100}%`;
  elements.progressBarHandle.style.left = `${pct * 100}%`;
  if (elements.miniProgressLine) elements.miniProgressLine.style.width = `${pct * 100}%`;
  if (elements.mfpProgressFill) elements.mfpProgressFill.style.width = `${pct * 100}%`;
  if (elements.mfpProgressHandle) elements.mfpProgressHandle.style.left = `${pct * 100}%`;
}

function seekTo(event) {
  seekToTrack(elements.progressBarTrack, event);
}

function setVolume(pct) {
  state.volume = Math.max(0, Math.min(100, pct));
  elements.volumeSliderFill.style.width = `${state.volume}%`;

  localAudio.volume = state.volume / 100;
  if (ytReady && ytPlayer) {
    ytPlayer.setVolume(state.volume);
    if (state.volume > 0 && ytPlayer.isMuted()) {
      ytPlayer.unMute();
      state.isMuted = false;
    }
  }
  updateVolumeIcon();
}

function toggleMute() {
  if (state.isMuted) {
    state.isMuted = false;
    localAudio.muted = false;
    if (ytReady && ytPlayer) ytPlayer.unMute();
    elements.volumeSliderFill.style.width = `${state.volume}%`;
  } else {
    state.isMuted = true;
    localAudio.muted = true;
    if (ytReady && ytPlayer) ytPlayer.mute();
    elements.volumeSliderFill.style.width = '0%';
  }
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (state.isMuted || state.volume === 0) {
    elements.volumeSvg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  } else if (state.volume < 50) {
    elements.volumeSvg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  } else {
    elements.volumeSvg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  }
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- QUEUE MANAGEMENT ---

function addToQueue(song) {
  state.queue.push(song);
  elements.queueBadge.textContent = state.queue.length;
  updateQueueDrawer();
  showToast(`"${song.title}" sıraya eklendi.`);
}

function updateQueueDrawer() {
  if (state.currentSong) {
    elements.queueNpItem.innerHTML = `
      <div class="queue-item">
        <img src="${state.currentSong.thumbnail}" class="queue-item-thumb">
        <div class="queue-item-info">
          <div class="queue-item-title">${state.currentSong.title}</div>
          <div class="queue-item-artist">${state.currentSong.channel}</div>
        </div>
      </div>
    `;
  } else {
    elements.queueNpItem.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">Şu an şarkı çalmıyor</span>`;
  }

  if (state.queue.length === 0) {
    elements.queueItems.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:10px 0;">Sırada şarkı yok. Bir şarkıyı sıraya ekleyebilirsiniz.</div>`;
    return;
  }

  elements.queueItems.innerHTML = state.queue.map((song, i) => `
    <div class="queue-item" data-idx="${i}">
      <img src="${song.thumbnail}" class="queue-item-thumb">
      <div class="queue-item-info">
        <div class="queue-item-title">${song.title}</div>
        <div class="queue-item-artist">${song.channel}</div>
      </div>
      <button class="btn-icon-subtle btn-remove-queue" data-idx="${i}" title="Sıradan Çıkar">✕</button>
    </div>
  `).join('');

  elements.queueItems.querySelectorAll('.btn-remove-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      state.queue.splice(idx, 1);
      elements.queueBadge.textContent = state.queue.length;
      updateQueueDrawer();
    });
  });
}

// --- OFFLINE DOWNLOADS ENGINE ---

async function loadDownloads() {
  try {
    const res = await fetch('/api/downloads');
    if (res.ok) {
      const data = await res.json();
      state.downloadedIds = new Set(data.downloadedIds || []);
      if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
      return;
    }
  } catch (e) {
    // Normal in standalone offline mode
  }
  state.downloadedIds = new Set();
  if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = 0;
}

async function triggerDownloadTrack(song, btn = null) {
  if (!song || !song.id) return;

  if (state.downloadedIds.has(song.id)) {
    showToast(`"${song.title}" zaten cihazınızda kayıtlı.`);
    return;
  }

  if (btn) {
    btn.classList.add('downloading');
    btn.title = 'İndiriliyor...';
  }

  showToast(`"${song.title}" indiriliyor...`);

  try {
    const res = await fetch('/api/download/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song })
    });
    const data = await res.json();

    if (data.success) {
      pollTrackDownload(song.id, btn);
    }
  } catch (err) {
    console.error('Download error:', err);
    if (btn) btn.classList.remove('downloading');
    showToast('İndirme başlatılamadı.');
  }
}

function pollTrackDownload(songId, btn = null) {
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/downloads');
      const data = await res.json();
      state.downloadedIds = new Set(data.downloadedIds || []);
      elements.downloadsCountBadge.textContent = state.downloadedIds.size;

      if (state.downloadedIds.has(songId)) {
        clearInterval(pollInterval);
        if (btn) {
          btn.classList.remove('downloading');
          btn.classList.add('downloaded');
          btn.title = 'Çevrimdışı İndirildi';
        }
        showToast('💾 Şarkı çevrimdışı dinlemek için indirildi!');
        renderSongs(state.currentPlaylist);
      }
    } catch (e) {
      clearInterval(pollInterval);
    }
  }, 1500);
}

async function triggerDownloadPlaylist(playlistId) {
  showToast('Tüm liste çevrimdışı dinlemek için indiriliyor...');
  try {
    const res = await fetch('/api/download/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`💾 ${data.count} şarkı arka planda indirilmeye başlandı.`);
      // Start periodic refresh
      if (!pollDownloadsTimer) {
        pollDownloadsTimer = setInterval(loadDownloads, 3000);
      }
    }
  } catch (e) {
    console.error(e);
    showToast('İndirme işlemi başlatılamadı.');
  }
}

async function deleteDownloadedTrack(songId) {
  try {
    const res = await fetch(`/api/download/track/${songId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      state.downloadedIds.delete(songId);
      elements.downloadsCountBadge.textContent = state.downloadedIds.size;
      showToast('Şarkı silindi.');
      if (state.currentView === 'downloads') {
        openDownloadsView();
      } else {
        renderSongs(state.currentPlaylist);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

// --- RENDERING SONGS IN GRID / LIST ---

function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('muzikal_view_mode', mode);
  if (mode === 'list') {
    elements.songsGrid.classList.add('list-view');
    if (elements.btnViewList) elements.btnViewList.classList.add('active');
    if (elements.btnViewGrid) elements.btnViewGrid.classList.remove('active');
  } else {
    elements.songsGrid.classList.remove('list-view');
    if (elements.btnViewGrid) elements.btnViewGrid.classList.add('active');
    if (elements.btnViewList) elements.btnViewList.classList.remove('active');
  }
}

function renderSongs(songs, isSearching = false) {
  elements.loadingState.style.display = 'none';

  if (!songs || songs.length === 0) {
    elements.songsGrid.innerHTML = '';
    elements.emptyState.style.display = 'flex';
    elements.emptyTitle.textContent = isSearching ? 'Sonuç Bulunamadı' : 'Şarkı Bulunamadı';
    elements.emptyDesc.textContent = isSearching 
      ? 'Aramanıza uygun sonuç bulunamadı. Lütfen farklı kelimeler deneyin.'
      : 'Bu bölümde gösterilecek şarkı bulunamadı.';
    return;
  }

  elements.emptyState.style.display = 'none';

  elements.songsGrid.innerHTML = songs.map((song, idx) => {
    const isFav = state.library.favorites.some(f => f.id === song.id);
    const isPlaying = state.currentSong && state.currentSong.id === song.id;
    const isDownloaded = state.downloadedIds.has(song.id);

    return `
      <div class="song-card ${isPlaying ? 'playing' : ''}" data-id="${song.id}" data-index="${idx}">
        <div class="song-card-thumb-wrap">
          <img src="${song.thumbnail || 'https://via.placeholder.com/240x135'}" class="song-card-thumb" loading="lazy">
          ${song.duration ? `<span class="song-card-duration">${song.duration}</span>` : ''}
          <div class="song-card-hover-play" title="Çal">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <polygon points="6 4 18 12 6 20 6 4"></polygon>
            </svg>
          </div>
        </div>
        <div class="song-card-info">
          <div class="song-card-title" title="${song.title}">${song.title}</div>
          <div class="song-card-channel">${song.channel}</div>
        </div>
        <div class="song-card-right">
          ${song.duration ? `<span class="song-card-time">${song.duration}</span>` : ''}
          <div class="song-card-actions">
          <button class="btn-icon-subtle btn-add-q" title="Sıraya Ekle">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="btn-icon-subtle btn-card-download ${isDownloaded ? 'downloaded' : ''}" title="${isDownloaded ? 'Çevrimdışı İndirildi' : 'Çevrimdışı İndir'}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              ${isDownloaded 
                ? '<polyline points="20 6 9 17 4 12"></polyline>' 
                : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'}
            </svg>
          </button>
          <button class="btn-icon-subtle btn-card-fav ${isFav ? 'fav-icon-color' : ''}" title="${isFav ? 'Beğenilerden Çıkar' : 'Beğen'}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  elements.songsGrid.querySelectorAll('.song-card').forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const song = songs[idx];

    card.addEventListener('click', () => {
      playSong(song, songs, idx);
    });

    const addQBtn = card.querySelector('.btn-add-q');
    addQBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToQueue(song);
    });

    const dlBtn = card.querySelector('.btn-card-download');
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerDownloadTrack(song, dlBtn);
    });

    const favBtn = card.querySelector('.btn-card-fav');
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFavorite(song);
      renderSongs(songs, isSearching);
    });
  });
}

// --- DATA FETCHING & UI VISIBILITY ---

function updateCategoryChipsVisibility() {
  if (!elements.categoryChips) return;
  const isSearching = !!(elements.searchInput && elements.searchInput.value.trim().length > 0);
  const isHomeOrExplore = (state.currentView === 'home' || state.currentView === 'explore');

  if (isHomeOrExplore && !isSearching) {
    elements.categoryChips.style.display = 'flex';
  } else {
    elements.categoryChips.style.display = 'none';
  }
}

async function fetchExploreGenre(genreKey) {
  elements.sectionActions.innerHTML = '';
  elements.songsGrid.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.loadingState.style.display = 'flex';
  elements.loadingText.textContent = 'Müzikler yükleniyor...';

  try {
    const data = await apiFetch(`/api/explore?genre=${encodeURIComponent(genreKey)}`);
    let songs = data && (data.results || (Array.isArray(data) ? data : []));
    if (!songs || songs.length === 0) {
      songs = BUNDLED_EXPLORE_SONGS;
    }
    state.currentPlaylist = songs;
    renderSongs(state.currentPlaylist);
  } catch (err) {
    console.warn('Explore fetch fallback to bundled:', err);
    state.currentPlaylist = BUNDLED_EXPLORE_SONGS;
    renderSongs(state.currentPlaylist);
  }
}

async function performSearch(query) {
  if (!query || query.trim() === '') {
    updateCategoryChipsVisibility();
    fetchExploreGenre(state.currentGenre);
    return;
  }

  elements.heroBanner.style.display = 'none';
  updateCategoryChipsVisibility();
  elements.sectionActions.innerHTML = '';
  elements.currentSectionTitle.textContent = `"${query}" İçin Arama Sonuçları`;
  elements.currentSectionDesc.textContent = 'Milyonlarca şarkı ve video arasından bulundu';
  elements.songsGrid.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.loadingState.style.display = 'flex';
  elements.loadingText.textContent = 'Arama yapılıyor...';

  try {
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    state.currentPlaylist = data.results || (Array.isArray(data) ? data : []);
    if (state.currentPlaylist.length === 0) {
      elements.loadingState.style.display = 'none';
      elements.emptyState.style.display = 'flex';
    } else {
      renderSongs(state.currentPlaylist, true);
    }
  } catch (err) {
    console.error('Search failed:', err);
    elements.loadingState.style.display = 'none';
    elements.emptyState.style.display = 'flex';
  }
}

async function loadLibrary() {
  try {
    const data = await apiFetch('/api/library');
    if (data && (data.favorites || data.playlists)) {
      state.library = data;
      persistLibrary(state.library);
    } else {
      state.library = getStoredLibrary();
    }
  } catch (e) {
    state.library = getStoredLibrary();
  }
  elements.favCountBadge.textContent = (state.library.favorites || []).length;
  renderSidebarPlaylists();
}

async function toggleFavorite(song) {
  try {
    const res = await fetch('/api/library/toggle-favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song })
    });
    const data = await res.json();
    if (data.success) {
      state.library.favorites = data.favorites;
      persistLibrary(state.library);
      elements.favCountBadge.textContent = state.library.favorites.length;
      syncLikeState();
      showToast(data.isFavorite ? '❤️ Beğenilen Şarkılara eklendi' : 'Beğenilen Şarkılardan kaldırıldı');
      return;
    }
  } catch (e) {
    // Offline local fallback
  }

  const idx = state.library.favorites.findIndex(s => s.id === song.id);
  let isFav = false;
  if (idx >= 0) {
    state.library.favorites.splice(idx, 1);
    isFav = false;
  } else {
    state.library.favorites.unshift(song);
    isFav = true;
  }
  persistLibrary(state.library);
  elements.favCountBadge.textContent = state.library.favorites.length;
  syncLikeState();
  showToast(isFav ? '❤️ Beğenilen Şarkılara eklendi' : 'Beğenilen Şarkılardan kaldırıldı');
}

function syncLikeState() {
  if (!state.currentSong) return;
  const isFav = state.library.favorites.some(s => s.id === state.currentSong.id);
  if (isFav) {
    elements.playerFavBtn.classList.add('active');
    if (elements.mfpFavBtn) {
      elements.mfpFavBtn.classList.add('active');
      if (elements.mfpFavIcon) {
        elements.mfpFavIcon.setAttribute('fill', '#ec4899');
        elements.mfpFavIcon.setAttribute('stroke', '#ec4899');
      }
    }
  } else {
    elements.playerFavBtn.classList.remove('active');
    if (elements.mfpFavBtn) {
      elements.mfpFavBtn.classList.remove('active');
      if (elements.mfpFavIcon) {
        elements.mfpFavIcon.setAttribute('fill', 'none');
        elements.mfpFavIcon.setAttribute('stroke', 'currentColor');
      }
    }
  }
}

function renderSidebarPlaylists() {
  elements.sidebarPlaylists.innerHTML = state.library.playlists.map(pl => `
    <div class="playlist-item" data-id="${pl.id}">
      <span>${pl.isSpotify ? '🟢' : '🎵'} ${pl.name}</span>
      <span class="badge">${pl.songs.length}</span>
    </div>
  `).join('');

  elements.sidebarPlaylists.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const plId = item.dataset.id;
      openPlaylistView(plId);
    });
  });
}

function openPlaylistView(plId) {
  const pl = state.library.playlists.find(p => p.id === plId);
  if (!pl) return;

  state.currentView = 'playlist';
  state.currentPlaylistId = plId;
  if (elements.searchInput) elements.searchInput.value = '';
  if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';
  elements.heroBanner.style.display = 'none';
  updateCategoryChipsVisibility();
  elements.currentSectionTitle.textContent = pl.name;
  elements.currentSectionDesc.textContent = pl.description || `${pl.songs.length} şarkı`;

  // Render "Tümünü İndir (Çevrimdışı)" button in playlist header
  elements.sectionActions.innerHTML = `
    <button class="btn-download-all" id="btn-download-entire-playlist">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Tümünü Çevrimdışı İndir</span>
    </button>
  `;

  document.getElementById('btn-download-entire-playlist').addEventListener('click', () => {
    triggerDownloadPlaylist(plId);
  });

  state.currentPlaylist = pl.songs;
  renderSongs(pl.songs);
}

function openDownloadsView() {
  state.currentView = 'downloads';
  if (elements.searchInput) elements.searchInput.value = '';
  if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';
  elements.heroBanner.style.display = 'none';
  updateCategoryChipsVisibility();
  elements.sectionActions.innerHTML = '';
  elements.currentSectionTitle.textContent = 'İndirilenler & Çevrimdışı Parçalar';
  elements.currentSectionDesc.textContent = `Cihazınızda kayıtlı ${state.downloadedIds.size} şarkı. İnternetsiz dinlenebilir.`;

  // Filter songs across library or construct from downloaded IDs
  const offlineSongs = [];
  const allKnownSongs = [
    ...state.library.favorites,
    ...state.library.history,
    ...(state.library.playlists.flatMap(p => p.songs))
  ];

  const seen = new Set();
  for (const id of state.downloadedIds) {
    const found = allKnownSongs.find(s => s.id === id);
    if (found && !seen.has(id)) {
      seen.add(id);
      offlineSongs.push(found);
    } else if (!seen.has(id)) {
      seen.add(id);
      offlineSongs.push({
        id: id,
        title: `İndirilen Parça (${id})`,
        channel: 'Çevrimdışı Ses',
        duration: '',
        thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240'
      });
    }
  }

  state.currentPlaylist = offlineSongs;
  renderSongs(offlineSongs);
}

// --- SPOTIFY PLAYLIST IMPORT HANDLER ---

async function handleSpotifyImport() {
  const url = elements.modalSpUrl.value.trim();
  if (!url) {
    showToast('Lütfen geçerli bir Spotify bağlantısı girin.');
    return;
  }

  elements.spBtnText.textContent = 'Aktarılıyor...';
  elements.spSpinner.style.display = 'inline-block';
  elements.btnImportSpModal.disabled = true;

  try {
    const res = await fetch('/api/spotify/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'İçe aktarma başarısız');
    }

    elements.spotifyModal.style.display = 'none';
    elements.modalSpUrl.value = '';
    showToast(`🟢 "${data.playlist.name}" başarıyla aktarıldı!`);

    await loadLibrary();
    openPlaylistView(data.playlist.id);
  } catch (err) {
    console.error('Spotify import error:', err);
    showToast(`Hata: ${err.message}`);
  } finally {
    elements.spBtnText.textContent = 'Listeyi İçe Aktar';
    elements.spSpinner.style.display = 'none';
    elements.btnImportSpModal.disabled = false;
  }
}

// --- EVENT LISTENERS & SETUP ---

function navigateTo(view) {
  state.currentView = view;
  elements.navItems.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (elements.mobileNavBtns) {
    elements.mobileNavBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }

  // Close mobile sidebar if open
  if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');

  // Reset search input and clear button when navigating
  if (elements.searchInput) elements.searchInput.value = '';
  if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';

  updateCategoryChipsVisibility();

  if (view === 'home') {
    elements.heroBanner.style.display = 'flex';
    elements.sectionActions.innerHTML = '';
    elements.currentSectionTitle.textContent = 'En Popüler Şarkılar';
    elements.currentSectionDesc.textContent = 'Günün en çok dinlenen hit parçaları';
    fetchExploreGenre('trendler');
  } else if (view === 'explore') {
    elements.heroBanner.style.display = 'none';
    elements.sectionActions.innerHTML = '';
    elements.currentSectionTitle.textContent = 'Müzik Türleri & Trendler';
    elements.currentSectionDesc.textContent = 'Kategorilere göre popüler şarkıları keşfedin';
    fetchExploreGenre(state.currentGenre);
  } else if (view === 'favorites') {
    elements.heroBanner.style.display = 'none';
    elements.sectionActions.innerHTML = '';
    elements.currentSectionTitle.textContent = 'Beğenilen Şarkılar';
    elements.currentSectionDesc.textContent = `${state.library.favorites.length} favori parça`;
    state.currentPlaylist = state.library.favorites;
    renderSongs(state.library.favorites);
  } else if (view === 'downloads') {
    openDownloadsView();
  } else if (view === 'history') {
    elements.heroBanner.style.display = 'none';
    elements.sectionActions.innerHTML = '';
    elements.currentSectionTitle.textContent = 'Dinleme Geçmişi';
    elements.currentSectionDesc.textContent = 'En son dinlediğiniz şarkılar';
    state.currentPlaylist = state.library.history;
    renderSongs(state.library.history);
  }
}

function setupEventListeners() {
  // Desktop Sidebar Navigation
  elements.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.view);
    });
  });

  // Mobile Bottom Navigation
  if (elements.mobileNavBtns) {
    elements.mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.view);
      });
    });
  }

  // Mobile Drawer Toggle & Backdrop
  if (elements.btnMobileMenu) {
    elements.btnMobileMenu.addEventListener('click', () => {
      elements.sidebar.classList.toggle('mobile-open');
      elements.sidebarBackdrop.classList.toggle('active');
    });
  }

  if (elements.sidebarBackdrop) {
    elements.sidebarBackdrop.addEventListener('click', () => {
      elements.sidebar.classList.remove('mobile-open');
      elements.sidebarBackdrop.classList.remove('active');
    });
  }

  // Spotify Modals triggers
  const openSpModal = () => {
    elements.modalSpUrl.value = '';
    elements.spotifyModal.style.display = 'flex';
    elements.modalSpUrl.focus();
    if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
    if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
  };

  elements.btnOpenSpotifyModal.addEventListener('click', openSpModal);
  elements.btnSidebarSpotify.addEventListener('click', openSpModal);
  elements.btnHeroSpotify.addEventListener('click', openSpModal);
  if (elements.btnMobileSpotifyTop) {
    elements.btnMobileSpotifyTop.addEventListener('click', openSpModal);
  }

  // Mobile Full-Screen Player Open / Close
  if (elements.playerTrackInfo) {
    elements.playerTrackInfo.addEventListener('click', () => {
      if (window.innerWidth <= 768 && state.currentSong) {
        elements.mobileFullPlayer.classList.add('open');
      }
    });
  }

  if (elements.sidebarNp) {
    elements.sidebarNp.addEventListener('click', () => {
      if (window.innerWidth <= 768 && state.currentSong) {
        if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
        if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
        elements.mobileFullPlayer.classList.add('open');
      }
    });
  }

  if (elements.mfpBtnCollapse) {
    elements.mfpBtnCollapse.addEventListener('click', () => {
      elements.mobileFullPlayer.classList.remove('open');
    });
  }

  // Mobile Full-Screen Controls
  if (elements.mfpBtnPlayPause) {
    elements.mfpBtnPlayPause.addEventListener('click', togglePlayPause);
  }
  if (elements.mfpBtnNext) {
    elements.mfpBtnNext.addEventListener('click', playNext);
  }
  if (elements.mfpBtnPrev) {
    elements.mfpBtnPrev.addEventListener('click', playPrev);
  }
  if (elements.mfpBtnShuffle) {
    elements.mfpBtnShuffle.addEventListener('click', () => {
      elements.btnShuffle.click();
    });
  }
  if (elements.mfpBtnRepeat) {
    elements.mfpBtnRepeat.addEventListener('click', () => {
      elements.btnRepeat.click();
    });
  }
  if (elements.mfpFavBtn) {
    elements.mfpFavBtn.addEventListener('click', () => {
      if (state.currentSong) toggleFavorite(state.currentSong);
    });
  }
  if (elements.mfpProgressTrack) {
    elements.mfpProgressTrack.addEventListener('click', (e) => {
      seekToTrack(elements.mfpProgressTrack, e);
    });
  }
  if (elements.mfpBtnDownload) {
    elements.mfpBtnDownload.addEventListener('click', () => {
      if (state.currentSong) triggerDownloadTrack(state.currentSong);
    });
  }
  if (elements.mfpBtnQueueToggle) {
    elements.mfpBtnQueueToggle.addEventListener('click', () => {
      elements.mobileFullPlayer.classList.remove('open');
      elements.queueDrawer.classList.toggle('open');
      updateQueueDrawer();
    });
  }

  elements.btnCancelSpModal.addEventListener('click', () => {
    elements.spotifyModal.style.display = 'none';
  });

  elements.btnImportSpModal.addEventListener('click', handleSpotifyImport);
  elements.modalSpUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSpotifyImport();
  });

  // Search input debounced
  elements.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    elements.btnClearSearch.style.display = val ? 'block' : 'none';
    updateCategoryChipsVisibility();

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      performSearch(val);
    }, 450);
  });

  elements.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      performSearch(elements.searchInput.value);
    }
  });

  elements.btnClearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.btnClearSearch.style.display = 'none';
    if (state.currentView === 'home') {
      elements.heroBanner.style.display = 'flex';
    }
    updateCategoryChipsVisibility();
    fetchExploreGenre(state.currentGenre);
  });

  // Category Chips
  elements.categoryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      elements.categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.currentGenre = chip.dataset.genre;
      elements.currentSectionTitle.textContent = chip.textContent;
      elements.currentSectionDesc.textContent = 'Öne çıkan popüler parçalar';
      fetchExploreGenre(state.currentGenre);
    });
  });

  // Controls
  elements.btnPlayPause.addEventListener('click', togglePlayPause);
  elements.btnNext.addEventListener('click', playNext);
  elements.btnPrev.addEventListener('click', playPrev);

  elements.btnShuffle.addEventListener('click', cycleShuffleMode);

  elements.btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      elements.btnRepeat.classList.add('active');
      elements.btnRepeat.title = 'Tek Şarkı Tekrarı';
      showToast('🔂 Tek Şarkı Tekrarı');
    } else if (state.repeatMode === 'one') {
      state.repeatMode = 'off';
      elements.btnRepeat.classList.remove('active');
      elements.btnRepeat.title = 'Tekrar Kapalı';
      showToast('Tekrar Kapalı');
    } else {
      state.repeatMode = 'all';
      elements.btnRepeat.classList.add('active');
      elements.btnRepeat.title = 'Tümünü Tekrarla';
      showToast('🔁 Tümünü Tekrarla');
    }
  });

  elements.progressBarTrack.addEventListener('click', seekTo);

  // Volume
  elements.volumeSliderTrack.addEventListener('click', (e) => {
    const rect = elements.volumeSliderTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = (clickX / rect.width) * 100;
    setVolume(pct);
  });

  elements.btnVolumeIcon.addEventListener('click', toggleMute);

  // Like button on player
  elements.playerFavBtn.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong);
  });

  // Queue drawer toggle
  elements.btnOpenQueue.addEventListener('click', () => {
    elements.queueDrawer.classList.toggle('open');
    elements.btnOpenQueue.classList.toggle('active');
    updateQueueDrawer();
  });
  elements.btnCloseQueue.addEventListener('click', () => {
    elements.queueDrawer.classList.remove('open');
    elements.btnOpenQueue.classList.remove('active');
  });
  elements.btnClearQueue.addEventListener('click', () => {
    state.queue = [];
    elements.queueBadge.textContent = 0;
    updateQueueDrawer();
  });

  // Video mode toggle
  elements.btnToggleVideo.addEventListener('click', () => {
    state.isVideoVisible = !state.isVideoVisible;
    elements.videoContainer.classList.toggle('active', state.isVideoVisible);
    elements.btnToggleVideo.classList.toggle('active', state.isVideoVisible);
    elements.btnVideoText.textContent = state.isVideoVisible ? 'Klibi Gizle' : 'Klip Modu';
  });
  elements.btnCloseVideo.addEventListener('click', () => {
    state.isVideoVisible = false;
    elements.videoContainer.classList.remove('active');
    elements.btnToggleVideo.classList.remove('active');
    elements.btnVideoText.textContent = 'Klip Modu';
  });

  // Hero play
  elements.btnHeroPlay.addEventListener('click', () => {
    if (state.currentPlaylist.length > 0) {
      playSong(state.currentPlaylist[0], state.currentPlaylist, 0);
    }
  });

  // New Playlist Modal
  elements.btnNewPlaylist.addEventListener('click', () => {
    elements.modalPlName.value = '';
    elements.modalPlDesc.value = '';
    elements.playlistModal.style.display = 'flex';
    elements.modalPlName.focus();
  });
  elements.btnCancelModal.addEventListener('click', () => {
    elements.playlistModal.style.display = 'none';
  });
  elements.btnSaveModal.addEventListener('click', async () => {
    const name = elements.modalPlName.value.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/library/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: elements.modalPlDesc.value.trim() })
      });
      const data = await res.json();
      if (data.success) {
        state.library.playlists.push(data.playlist);
        renderSidebarPlaylists();
        elements.playlistModal.style.display = 'none';
        showToast(`"${name}" çalma listesi oluşturuldu.`);
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowRight') {
      if (state.isOfflinePlaying) {
        localAudio.currentTime += 5;
      } else if (ytPlayer && ytPlayer.getCurrentTime) {
        ytPlayer.seekTo(ytPlayer.getCurrentTime() + 5, true);
      }
    } else if (e.code === 'ArrowLeft') {
      if (state.isOfflinePlaying) {
        localAudio.currentTime = Math.max(0, localAudio.currentTime - 5);
      } else if (ytPlayer && ytPlayer.getCurrentTime) {
        ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 5), true);
      }
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      setVolume(state.volume + 5);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      setVolume(state.volume - 5);
    } else if (e.key === 'm' || e.key === 'M') {
      toggleMute();
    } else if (e.key === 'l' || e.key === 'L') {
      if (state.currentSong) toggleFavorite(state.currentSong);
    }
  });

  // View Mode Toggles (Grid / List)
  if (elements.btnViewGrid) {
    elements.btnViewGrid.addEventListener('click', () => setViewMode('grid'));
  }
  if (elements.btnViewList) {
    elements.btnViewList.addEventListener('click', () => setViewMode('list'));
  }

  // Sidebar "Güncellemeleri Kontrol Et" button
  const btnCheckUpdates = document.getElementById('btn-check-updates');
  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener('click', () => {
      checkForAppUpdates(true);
    });
  }

  // Update Modal Handlers
  const btnDismissUpdate = document.getElementById('btn-dismiss-update');
  if (btnDismissUpdate) {
    btnDismissUpdate.addEventListener('click', () => {
      const modal = document.getElementById('update-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  const btnDlUpdate = document.getElementById('btn-download-update');
  if (btnDlUpdate) {
    btnDlUpdate.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = btnDlUpdate.getAttribute('data-url') || btnDlUpdate.href || 'https://github.com/KaranlikPasa/M-zikal/releases/latest';
      const modal = document.getElementById('update-modal');
      if (modal) modal.style.display = 'none';
      showToast('İndirme sayfası açılıyor...');
      window.location.href = targetUrl;
    });
  }
}

function showToast(msg) {
  elements.toast.textContent = msg;
  elements.toast.classList.add('show');
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2600);
}

// --- AUTOMATIC & ON-DEMAND UPDATE CHECKER ---
const CURRENT_APP_VERSION = '1.2.8';
let lastAutoCheckTime = 0;

async function checkForAppUpdates(isManual = false) {
  const btnCheckUpdates = document.getElementById('btn-check-updates');
  if (isManual) {
    if (btnCheckUpdates) btnCheckUpdates.classList.add('checking');
    showToast('Güncellemeler denetleniyor...');
  }

  try {
    const res = await fetch('https://api.github.com/repos/KaranlikPasa/M-zikal/releases/latest');
    if (!res.ok) {
      if (isManual) showToast('Güncelleme sunucusuna bağlanılamadı.');
      return;
    }
    const release = await res.json();
    const remoteTag = release.tag_name ? release.tag_name.replace('v', '').trim() : '';
    if (!remoteTag) {
      if (isManual) showToast('Sürüm bilgisi alınamadı.');
      return;
    }

    lastAutoCheckTime = Date.now();

    if (compareSemver(remoteTag, CURRENT_APP_VERSION) > 0) {
      const apkAsset = release.assets && release.assets.find(a => a.name.endsWith('.apk'));
      const downloadUrl = apkAsset ? apkAsset.browser_download_url : (release.html_url || 'https://github.com/KaranlikPasa/M-zikal/releases/latest');

      const titleElem = document.getElementById('update-title');
      const verElem = document.getElementById('update-version-text');
      const notesElem = document.getElementById('update-notes-box');
      const dlBtn = document.getElementById('btn-download-update');
      const modal = document.getElementById('update-modal');

      if (titleElem) titleElem.textContent = release.name || 'Yeni Güncelleme Mevcut!';
      if (verElem) verElem.textContent = `Mevcut: v${CURRENT_APP_VERSION} ➔ Yeni: v${remoteTag}`;
      if (notesElem && release.body) notesElem.textContent = release.body;
      if (dlBtn) {
        dlBtn.href = downloadUrl;
        dlBtn.setAttribute('data-url', downloadUrl);
      }
      if (modal) modal.style.display = 'flex';
      if (isManual) showToast(`🚀 Yeni sürüm (v${remoteTag}) bulundu!`);
    } else {
      if (isManual) {
        showToast(`Harika! Zaten en güncel sürümü (v${CURRENT_APP_VERSION}) kullanıyorsunuz. 🎉`);
      }
    }
  } catch (e) {
    if (isManual) showToast('İnternet bağlantınızı kontrol edin.');
  } finally {
    if (btnCheckUpdates) btnCheckUpdates.classList.remove('checking');
  }
}

function compareSemver(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// Automatic check on every app entry / visit
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastAutoCheckTime > 60000) {
    checkForAppUpdates(false);
  }
});

window.addEventListener('focus', () => {
  if (Date.now() - lastAutoCheckTime > 60000) {
    checkForAppUpdates(false);
  }
});

// --- BOOTSTRAP APP ---
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setViewMode(state.viewMode);
  updateCategoryChipsVisibility();
  await loadDownloads();
  await loadLibrary();
  await fetchExploreGenre('trendler');
  setTimeout(() => checkForAppUpdates(false), 1500); // Check updates automatically on startup
});
