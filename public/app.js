// --- MÜZİKAL CLIENT APPLICATION WITH SPOTIFY & OFFLINE DOWNLOADS ---

// --- BACKGROUND PLAYBACK PROTECTION & VISIBILITY SPOOFING ---
let userRequestedPause = false;
try {
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
} catch (e) {}

['visibilitychange', 'webkitvisibilitychange', 'blur'].forEach(evtName => {
  window.addEventListener(evtName, (e) => {
    if (e.target === window || e.target === document) {
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener(evtName, (e) => {
    e.stopImmediatePropagation();
  }, true);
});

const state = {
  currentSong: null,
  currentPlaylist: [],
  currentIndex: -1,
  queue: [],
  isPlaying: false,
  isMuted: false,
  volume: (function() { try { const v = parseFloat(localStorage.getItem('muzikal_volume')); return !isNaN(v) ? Math.max(0, Math.min(100, v)) : 80; } catch(e) { return 80; } })(),
  repeatMode: 'all', // 'off', 'all', 'one'
  isShuffled: (function() { try { const m = localStorage.getItem('muzikal_shuffle_mode'); return m === 'standard' || m === 'smart'; } catch(e) { return false; } })(),
  shuffleMode: (function() { try { return localStorage.getItem('muzikal_shuffle_mode') || 'off'; } catch(e) { return 'off'; } })(),
  smartShuffleCounter: 0,
  shuffledIndices: [],
  playedTrackIds: new Set(),
  playedArtists: [],
  smartQueue: [],
  unplayedShuffleIndices: [],
  isFetchingSmartQueue: false,
  navHistory: [],
  navHistoryPos: -1,
  isNavigatingHistory: false,
  isOfflinePlaying: false,
  downloadedIds: new Set(),
  serverDownloadedIds: new Set(),
  activeDownloads: new Map(),
  lyrics: null,
  syncedLyrics: [],
  isLyricsOpen: false,
  currentLyricIndex: -1,
  library: {
    favorites: [],
    playlists: [],
    history: []
  },
  currentView: 'home',
  currentGenre: 'trendler',
  currentPlaylistId: null,
  isVideoVisible: false,
  viewMode: localStorage.getItem('muzikal_view_mode') || 'grid',
  hideUpcomingQueue: localStorage.getItem('muzikal_hide_upcoming_queue') === 'true' || localStorage.getItem('muzikal_hide_queue') === '1',
  selectedSongForPlaylist: null,
  user: null
};

try {
  const storedUser = localStorage.getItem('muzikal_user');
  if (storedUser) state.user = JSON.parse(storedUser);
} catch (e) {}

let ytPlayer = null;
let ytReady = false;
let progressInterval = null;
let searchDebounceTimer = null;
let pollDownloadsTimer = null;
let queueSearchDebounceTimer = null;

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
  btnSidebarCreatePlaylist: document.getElementById('btn-sidebar-create-playlist'),
  btnSidebarSpotify: document.getElementById('btn-sidebar-spotify'),
  btnSidebarYtm: document.getElementById('btn-sidebar-ytm'),
  
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
  contentScroll: document.getElementById('content-scroll'),
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

  // Home Screen Custom Sections (Son Dinlenenler & Önerilen Sanatçılar)
  homeCustomSections: document.getElementById('home-custom-sections'),
  homeRecentSection: document.getElementById('home-recent-section'),
  homeRecentGrid: document.getElementById('home-recent-grid'),
  btnHomeSeeHistory: document.getElementById('btn-home-see-history'),
  homeArtistsRow: document.getElementById('home-artists-row'),

  // Queue Drawer
  queueDrawer: document.getElementById('queue-drawer'),
  btnCloseQueue: document.getElementById('btn-close-queue'),
  btnToggleQueueSpoiler: document.getElementById('btn-toggle-queue-spoiler'),
  queueSpoilerIcon: document.getElementById('queue-spoiler-icon'),
  queueSpoilerText: document.getElementById('queue-spoiler-text'),
  queueQuickSearchInput: document.getElementById('queue-quick-search-input'),
  queueQuickSearchDropdown: document.getElementById('queue-quick-search-dropdown'),
  btnClearQueueSearch: document.getElementById('btn-clear-queue-search'),
  queueNpItem: document.getElementById('queue-np-item'),
  queueManualSection: document.getElementById('queue-manual-section'),
  queueManualCount: document.getElementById('queue-manual-count'),
  queueItems: document.getElementById('queue-items'),
  btnClearQueue: document.getElementById('btn-clear-queue'),
  queueUpcomingSection: document.getElementById('queue-upcoming-section'),
  queueUpcomingTitle: document.getElementById('queue-upcoming-title'),
  queueUpcomingSource: document.getElementById('queue-upcoming-source'),
  queueUpcomingItems: document.getElementById('queue-upcoming-items'),
  queueSpoilerMask: document.getElementById('queue-spoiler-mask'),
  btnRevealQueue: document.getElementById('btn-reveal-queue'),

  // Player Bar
  playerThumb: document.getElementById('player-thumb'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  playerOfflineBadge: document.getElementById('player-offline-badge'),
  playerSmartBadge: document.getElementById('player-smart-badge'),
  smartShuffleDot: document.getElementById('smart-shuffle-dot'),
  playerFavBtn: document.getElementById('player-fav-btn'),
  playerAddPlBtn: document.getElementById('player-add-pl-btn'),
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

  // Add to Playlist Modal
  addToPlaylistModal: document.getElementById('add-to-playlist-modal'),
  btnCloseAddPlModal: document.getElementById('btn-close-add-pl-modal'),
  addPlSongThumb: document.getElementById('add-pl-song-thumb'),
  addPlSongTitle: document.getElementById('add-pl-song-title'),
  addPlSongArtist: document.getElementById('add-pl-song-artist'),
  inputAddPlNewName: document.getElementById('input-add-pl-new-name'),
  btnAddPlCreateAndAdd: document.getElementById('btn-add-pl-create-and-add'),
  addPlPlaylistsContainer: document.getElementById('add-pl-playlists-container'),

  spotifyModal: document.getElementById('spotify-modal'),
  modalSpUrl: document.getElementById('modal-sp-url'),
  btnCancelSpModal: document.getElementById('btn-cancel-sp-modal'),
  btnImportSpModal: document.getElementById('btn-import-sp-modal'),
  spBtnText: document.getElementById('sp-btn-text'),
  spSpinner: document.getElementById('sp-spinner'),

  // Discord Rich Presence Elements
  btnOpenDiscordModal: document.getElementById('btn-open-discord-modal'),
  discordModal: document.getElementById('discord-modal'),
  btnCloseDiscordModal: document.getElementById('btn-close-discord-modal'),
  btnCancelDiscordModal: document.getElementById('btn-cancel-discord-modal'),
  btnSaveDiscordConfig: document.getElementById('btn-save-discord-config'),
  discordClientIdInput: document.getElementById('discord-client-id-input'),
  discordEnableToggle: document.getElementById('discord-enable-toggle'),
  sidebarDiscordStatus: document.getElementById('sidebar-discord-status'),
  discordModalStatusPill: document.getElementById('discord-modal-status-pill'),

  toast: document.getElementById('toast-notification'),

  // Mobile References
  mobileNavBtns: document.querySelectorAll('.mobile-nav-btn'),
  btnMobileNavPlaylists: document.getElementById('btn-mobile-nav-playlists'),
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
  mfpBtnAddPl: document.getElementById('mfp-btn-add-pl'),
  mfpBtnDownload: document.getElementById('mfp-btn-download'),
  mfpDownloadLabel: document.getElementById('mfp-download-label'),
  mfpBtnQueueToggle: document.getElementById('mfp-btn-queue-toggle'),
  mfpBtnLyrics: document.getElementById('mfp-btn-lyrics'),

  // Lyrics Elements
  btnLyrics: document.getElementById('btn-lyrics'),
  btnQueueToggle: document.getElementById('btn-queue-toggle'),
  lyricsOverlay: document.getElementById('lyrics-overlay'),
  lyricsTitle: document.getElementById('lyrics-title'),
  lyricsArtist: document.getElementById('lyrics-artist'),
  lyricsBadge: document.getElementById('lyrics-badge'),
  btnCloseLyrics: document.getElementById('btn-close-lyrics'),
  lyricsBody: document.getElementById('lyrics-body'),
  lyricsLines: document.getElementById('lyrics-lines'),
  lyricsEmpty: document.getElementById('lyrics-empty'),
  lyricsLoading: document.getElementById('lyrics-loading'),
  sidebarAppVer: document.getElementById('sidebar-app-ver'),

  // Google Auth & User Elements
  btnOpenGoogleLogin: document.getElementById('btn-open-google-login'),
  userProfileCard: document.getElementById('user-profile-card'),
  userProfileAvatar: document.getElementById('user-profile-avatar'),
  userProfileName: document.getElementById('user-profile-name'),
  userProfileEmail: document.getElementById('user-profile-email'),
  btnGoogleLogout: document.getElementById('btn-google-logout'),
  btnTopbarUser: document.getElementById('btn-topbar-user'),
  topbarGoogleSvg: document.getElementById('topbar-google-svg'),
  topbarUserAvatar: document.getElementById('topbar-user-avatar'),
  topbarUserName: document.getElementById('topbar-user-name'),
  btnMobileUserTop: document.getElementById('btn-mobile-user-top'),
  googleLoginModal: document.getElementById('google-login-modal'),
  btnCloseGoogleModal: document.getElementById('btn-close-google-modal'),
  googleEmailInput: document.getElementById('google-email-input'),
  googleNameInput: document.getElementById('google-name-input'),
  btnSubmitGoogleLogin: document.getElementById('btn-submit-google-login'),

  // YouTube Music Modal Elements
  ytmusicModal: document.getElementById('ytmusic-modal'),
  modalYtmUrl: document.getElementById('modal-ytm-url'),
  btnCancelYtmModal: document.getElementById('btn-cancel-ytm-modal'),
  btnImportYtmModal: document.getElementById('btn-import-ytm-modal'),
  ytmBtnText: document.getElementById('ytm-btn-text'),
  ytmSpinner: document.getElementById('ytm-spinner'),
  btnOpenYtmModal: document.getElementById('btn-open-ytm-modal'),
  btnHeroYtm: document.getElementById('btn-hero-ytm'),

  // Google Account Hub Elements
  userAccountModal: document.getElementById('user-account-modal'),
  btnCloseAccountModal: document.getElementById('btn-close-account-modal'),
  accountHubAvatar: document.getElementById('account-hub-avatar'),
  accountHubName: document.getElementById('account-hub-name'),
  accountHubEmail: document.getElementById('account-hub-email'),
  accountStatPlaylists: document.getElementById('account-stat-playlists'),
  accountStatFavorites: document.getElementById('account-stat-favorites'),
  accountStatTime: document.getElementById('account-stat-time'),
  btnHubSyncPush: document.getElementById('btn-hub-sync-push'),
  btnHubSyncPull: document.getElementById('btn-hub-sync-pull'),
  btnExportPlaylistsJson: document.getElementById('btn-export-playlists-json'),
  btnImportPlaylistsJson: document.getElementById('btn-import-playlists-json'),
  fileImportPlaylists: document.getElementById('file-import-playlists'),
  btnSwitchAccount: document.getElementById('btn-switch-account'),
  btnHubLogout: document.getElementById('btn-hub-logout')
};

// --- YOUTUBE IFRAME API INITIALIZATION & FAILSAFE PLAYBACK ---
let pendingSongToPlay = null;
let ytApiLoaded = false;

function ensureYouTubeApiScript() {
  if (document.getElementById('yt-iframe-api-tag')) return;
  const tag = document.createElement('script');
  tag.id = 'yt-iframe-api-tag';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  ytApiLoaded = true;
  if (pendingSongToPlay) {
    const s = pendingSongToPlay;
    pendingSongToPlay = null;
    playOnlineYouTubeTrack(s);
  }
};

if (window.YT && window.YT.Player) {
  ytApiLoaded = true;
} else {
  ensureYouTubeApiScript();
}

function playOnlineYouTubeTrack(song) {
  if (!song || !song.id) return;

  if (!window.YT || !window.YT.Player) {
    pendingSongToPlay = song;
    ensureYouTubeApiScript();
    return;
  }

  // If a player is already instantiated and ready, load video into it
  if (ytPlayer && ytReady && typeof ytPlayer.loadVideoById === 'function') {
    try {
      ytPlayer.loadVideoById({ videoId: song.id, startSeconds: 0 });
      if (!state.isVideoVisible && typeof ytPlayer.setPlaybackQuality === 'function') {
        try { ytPlayer.setPlaybackQuality('small'); } catch (qErr) {}
      }
      if (!state.isMuted && typeof ytPlayer.unMute === 'function') {
        try { ytPlayer.unMute(); } catch (e) {}
      }
      ytPlayer.playVideo();
      return;
    } catch (e) {
      console.warn('loadVideoById failed, re-creating player:', e);
    }
  }

  // Reset the wrapper element to a pristine div so YT.Player can cleanly construct the iframe
  const wrapper = document.querySelector('.video-wrapper');
  if (wrapper) {
    wrapper.innerHTML = '<div id="yt-player"></div>';
  }

  ytReady = false;

  const playerVars = {
    'autoplay': 1,
    'controls': 1,
    'rel': 0,
    'modestbranding': 1,
    'playsinline': 1,
    'enablejsapi': 1
  };

  let embedOrigin = window.location.origin || 'http://localhost:3456';
  if (embedOrigin.includes('127.0.0.1')) {
    embedOrigin = embedOrigin.replace('127.0.0.1', 'localhost');
  }
  if (embedOrigin.startsWith('http')) {
    playerVars.origin = embedOrigin;
    playerVars.widget_referrer = embedOrigin;
  }

  try {
    ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: song.id,
      playerVars: playerVars,
      events: {
        'onReady': (event) => {
          ytReady = true;
          try {
            const iframe = typeof event.target.getIframe === 'function' ? event.target.getIframe() : null;
            if (iframe) {
              iframe.setAttribute('referrerpolicy', 'origin');
              iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            }
          } catch (e) {}
          if (!state.isMuted && typeof event.target.unMute === 'function') {
            try { event.target.unMute(); } catch (e) {}
          }
          try { event.target.setVolume(state.volume); } catch (e) {}
          if (!state.isVideoVisible && typeof event.target.setPlaybackQuality === 'function') {
            try { event.target.setPlaybackQuality('small'); } catch (qErr) {}
          }
          try { event.target.playVideo(); } catch (e) {}
        },
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
  } catch (err) {
    console.error('Failed to construct YT.Player:', err);
  }
}

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
      if (endpoint.startsWith('/api/lyrics') && typeof window.MuzikalNative.getLyrics === 'function') {
        const dummy = new URL('http://local' + endpoint);
        const title = dummy.searchParams.get('title') || '';
        const artist = dummy.searchParams.get('artist') || '';
        const resStr = window.MuzikalNative.getLyrics(title, artist);
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

function persistLibrary(lib, skipCloudSync = false) {
  try {
    const json = JSON.stringify(lib);
    localStorage.setItem('muzikal_library_data', json);
    if (window.MuzikalNative && typeof window.MuzikalNative.saveLibrary === 'function') {
      window.MuzikalNative.saveLibrary(json);
    }
    fetch('/api/library/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json
    }).catch(() => {});
    if (state.user && state.user.email) {
      fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: state.user.email, library: lib })
      }).catch(() => {});
      if (!skipCloudSync && typeof scheduleFirebaseCloudSync === 'function') {
        scheduleFirebaseCloudSync(lib);
      }
    }
  } catch (e) {}
}

// --- BACKGROUND PLAYBACK & NATIVE NOTIFICATION SYNC ---
let lastNativeState = { songId: null, isPlaying: null, shuffleMode: null, repeatMode: null };

function updateNativePlaybackState(song, isPlaying) {
  if (!song) return;
  const shuffleMode = state.shuffleMode || (state.isShuffled ? 'standard' : 'off');
  const repeatMode = state.repeatMode || 'all';

  if (lastNativeState.songId === song.id &&
      lastNativeState.isPlaying === isPlaying &&
      lastNativeState.shuffleMode === shuffleMode &&
      lastNativeState.repeatMode === repeatMode) {
    return;
  }
  lastNativeState = { songId: song.id, isPlaying, shuffleMode, repeatMode };

  if (window.MuzikalNative && typeof window.MuzikalNative.updatePlaybackState === 'function') {
    try {
      window.MuzikalNative.updatePlaybackState(
        isPlaying,
        song.title || 'Müzikal',
        song.channel || 'Bilinmeyen Sanatçı',
        song.thumbnail || '',
        shuffleMode,
        repeatMode
      );
    } catch (e) {
      console.warn('Native updatePlaybackState error:', e);
    }
  }

  // Web Media Session API for Lock Screen & Notification Center
  if ('mediaSession' in navigator && song) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.channel,
        album: 'Müzikal',
        artwork: [
          { src: song.thumbnail || '/logo.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (e) {}
  }
}

let resumeDebounceTimer = null;
let autoResumeAttempts = 0;
let lastAutoResumeTime = 0;
let lastExternalPauseTime = 0;

window.pauseOnly = function(reason = 'external') {
  userRequestedPause = true;
  lastExternalPauseTime = Date.now();
  if (resumeDebounceTimer) {
    clearTimeout(resumeDebounceTimer);
    resumeDebounceTimer = null;
  }
  if (state.isOfflinePlaying && localAudio && !localAudio.paused) {
    try { localAudio.pause(); } catch (e) {}
  }
  if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try { ytPlayer.pauseVideo(); } catch (e) {}
  }
  state.isPlaying = false;
  updatePlayPauseButton();
  if (elements.heroVinyl) elements.heroVinyl.classList.add('paused');
  if (elements.playingIndicator) elements.playingIndicator.classList.remove('active');
  if (state.currentSong) {
    updateNativePlaybackState(state.currentSong, false);
  }
};

window.resumeOnly = function() {
  if (!state.currentSong) return;
  userRequestedPause = false;
  if (state.isOfflinePlaying && localAudio) {
    if (localAudio.paused) {
      try { localAudio.play(); } catch (e) {}
    }
  } else if (ytReady && ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try { ytPlayer.playVideo(); } catch (e) {}
  }
};

window.pauseFromNativeInterrupt = window.pauseOnly;

try {
  Object.defineProperty(window, 'onPause', {
    get: function() {
      window.pauseOnly('native_onPause');
      return true;
    },
    configurable: true
  });
  Object.defineProperty(window, 'onPlay', {
    get: function() {
      window.resumeOnly();
      return true;
    },
    configurable: true
  });
} catch (e) {}

if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('play', () => window.resumeOnly());
    navigator.mediaSession.setActionHandler('pause', () => window.pauseOnly('mediaSession_pause'));
    navigator.mediaSession.setActionHandler('stop', () => window.pauseOnly('mediaSession_stop'));
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
  } catch (e) {}
}

// Listen for headphone / audio output device disconnections in WebView & desktop browsers
if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
  let knownOutputCount = -1;
  const updateOutputDeviceCount = async () => {
    try {
      if (typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const outputs = devs.filter(d => d.kind === 'audiooutput' || d.kind === 'audioinput');
      if (knownOutputCount > 0 && outputs.length < knownOutputCount && state.isPlaying) {
        window.pauseOnly('headphone_disconnected');
      }
      knownOutputCount = outputs.length;
    } catch (e) {}
  };
  updateOutputDeviceCount();
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (state.isPlaying) {
      window.pauseOnly('devicechange');
    }
    updateOutputDeviceCount();
  });
}

// Poll Android Native Audio Interrupt Detector (Phone Calls, Headphone Unplug, Instagram/TikTok/X Audio)
setInterval(() => {
  if (!state.isPlaying) return;
  if (window.MuzikalNative && typeof window.MuzikalNative.checkAudioInterrupt === 'function') {
    try {
      const interruptReason = window.MuzikalNative.checkAudioInterrupt();
      if (interruptReason && interruptReason.length > 0) {
        window.pauseOnly(interruptReason);
      }
    } catch (e) {}
  }
}, 300);

function onPlayerStateChange(event) {
  if (state.isOfflinePlaying) return; // Managed by localAudio

  if (event.data === YT.PlayerState.BUFFERING) {
    if (resumeDebounceTimer) {
      clearTimeout(resumeDebounceTimer);
      resumeDebounceTimer = null;
    }
    return;
  }

  if (event.data === YT.PlayerState.PLAYING) {
    if (resumeDebounceTimer) {
      clearTimeout(resumeDebounceTimer);
      resumeDebounceTimer = null;
    }
    autoResumeAttempts = 0;
    userRequestedPause = false;
    state.isPlaying = true;
    updatePlayPauseButton();
    startProgressTracker();
    elements.heroVinyl.classList.remove('paused');
    elements.playingIndicator.classList.add('active');
    updateNativePlaybackState(state.currentSong, true);
  } else if (event.data === YT.PlayerState.PAUSED) {
    // Honor pause immediately! When Android AudioFocus (Incoming/Outgoing Call, Instagram, TikTok, X)
    // or Headphone Unplug (ACTION_AUDIO_BECOMING_NOISY) pauses the player, never force-resume it.
    if (resumeDebounceTimer) {
      clearTimeout(resumeDebounceTimer);
      resumeDebounceTimer = null;
    }
    userRequestedPause = true;
    lastExternalPauseTime = Date.now();
    state.isPlaying = false;
    updatePlayPauseButton();
    elements.heroVinyl.classList.add('paused');
    elements.playingIndicator.classList.remove('active');
    updateNativePlaybackState(state.currentSong, false);
  } else if (event.data === YT.PlayerState.ENDED) {
    if (resumeDebounceTimer) {
      clearTimeout(resumeDebounceTimer);
      resumeDebounceTimer = null;
    }
    updateNativePlaybackState(state.currentSong, false);
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

  song._attemptedIds = song._attemptedIds || new Set();
  song._attemptedIds.add(song.id);
  song._fallbackCount = (song._fallbackCount || 0) + 1;

  if (song._fallbackCount > 3) {
    showToast('Bu parça telif/kısıtlama nedeniyle oynatılamadı. Sonraki parçaya geçiliyor...');
    setTimeout(() => playNext(), 1200);
    return;
  }

  showToast('Bu video kısıtlı, alternatif kaynak aranıyor...');

  try {
    // Clean up title for high-accuracy alternative search
    const rawTitle = song.title || '';
    const cleanTitle = rawTitle
      .replace(/\(.*?video.*?\)|\[.*?video.*?\]/gi, '')
      .replace(/\(.*?klip.*?\)|\[.*?klip.*?\]/gi, '')
      .replace(/\(.*?official.*?\)|\[.*?official.*?\]/gi, '')
      .replace(/\(.*?remix.*?\)|\[.*?remix.*?\]/gi, '')
      .trim();

    const q = `${cleanTitle} audio`;
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
    const candidate = data && data.results && data.results.find(r => r.id && !song._attemptedIds.has(r.id));

    if (candidate && candidate.id) {
      console.log('Found alternative audio for restricted track:', candidate);
      showToast('🎵 Alternatif kaynaktan oynatılıyor...');
      song.id = candidate.id;
      if (candidate.duration) song.duration = candidate.duration;
      playOnlineYouTubeTrack(song);
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
    updateNativePlaybackState(state.currentSong, true);
  });

  localAudio.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayPauseButton();
    elements.heroVinyl.classList.add('paused');
    elements.playingIndicator.classList.remove('active');
    updateNativePlaybackState(state.currentSong, false);
  });

  localAudio.addEventListener('ended', () => {
    updateNativePlaybackState(state.currentSong, false);
    onSongEnded();
  });

  localAudio.addEventListener('timeupdate', () => {
    if (!state.isOfflinePlaying) return;
    const current = localAudio.currentTime || 0;
    const duration = localAudio.duration || 0;

    elements.currentTime.textContent = formatTime(current);
    elements.totalDuration.textContent = formatTime(duration);

    if (duration > 0) {
      syncLyricsWithTime(current);
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
    if (state.currentSong) playOnlineYouTubeTrack(state.currentSong);
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
      try {
        const sRes = await apiFetch(`/api/search?q=${encodeURIComponent(song.spotifySearchQuery)}`);
        const sData = await sRes.json();
        if (sData && sData.results && sData.results.length > 0) {
          song.id = sData.results[0].id;
          song.thumbnail = sData.results[0].thumbnail || song.thumbnail;
          song.duration = sData.results[0].duration || song.duration;
          song.spotifyResolved = true;
        }
      } catch (e2) {
        console.error('Track resolution error:', e2);
      }
    }
  }

  const isDifferentSong = !state.currentSong || state.currentSong.id !== song.id;
  state.currentSong = song;
  if (playlist) {
    const isNewPlaylist = state.currentPlaylist !== playlist;
    state.currentPlaylist = playlist;
    state.currentIndex = index >= 0 ? index : playlist.findIndex(s => s.id === song.id);
    if (isNewPlaylist || (isDifferentSong && !song.isSmartRecommendation && !state.isNavigatingHistory)) {
      state.smartQueue = [];
    }
    if (isNewPlaylist) {
      initShufflePool(true);
    }
  }

  // Record ordered session navigation history (fixes Geri Gel / Previous button in Shuffle & Smart Shuffle!)
  if (song && song.id) {
    if (state.isNavigatingHistory) {
      state.isNavigatingHistory = false;
    } else {
      if (state.navHistoryPos < state.navHistory.length - 1) {
        state.navHistory = state.navHistory.slice(0, state.navHistoryPos + 1);
      }
      const lastEntry = state.navHistory[state.navHistory.length - 1];
      if (!lastEntry || lastEntry.song.id !== song.id) {
        state.navHistory.push({
          song: { ...song },
          index: state.currentIndex
        });
        if (state.navHistory.length > 100) {
          state.navHistory.shift();
        }
        state.navHistoryPos = state.navHistory.length - 1;
      }
    }

    state.playedTrackIds.add(song.id);
    if (state.playedTrackIds.size > 60) {
      const firstVal = state.playedTrackIds.values().next().value;
      state.playedTrackIds.delete(firstVal);
    }
    const songArtists = extractClientArtists(song);
    songArtists.forEach(a => {
      state.playedArtists.push(a);
    });
    if (state.playedArtists.length > 20) {
      state.playedArtists = state.playedArtists.slice(-20);
    }
  }

  // If Smart Shuffle is active, proactively prefetch next recommendations in background
  if (state.shuffleMode === 'smart') {
    setTimeout(() => prefetchSmartRecommendations(), 500);
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
  const hasServerFile = state.serverDownloadedIds && state.serverDownloadedIds.has(song.id);
  if (elements.mfpDownloadLabel) {
    elements.mfpDownloadLabel.textContent = isOffline ? 'Cihazda Kayıtlı' : 'Cihaza İndir';
  }

  if (hasServerFile) {
    // Play locally through HTML5 audio!
    state.isOfflinePlaying = true;
    elements.playerOfflineBadge.style.display = 'inline-block';

    // Stop YouTube
    if (ytReady && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
      try { ytPlayer.stopVideo(); } catch (e) {}
    }

    localAudio.src = `/downloads/${song.id}.m4a`;
    localAudio.volume = state.isMuted ? 0 : (state.volume / 100);
    localAudio.play().catch(e => console.warn('Autoplay prevented:', e));
  } else {
    // Play online through YouTube (still show offline badge if saved on device)
    state.isOfflinePlaying = false;
    elements.playerOfflineBadge.style.display = isOffline ? 'inline-block' : 'none';

    // Stop local audio
    localAudio.pause();

    playOnlineYouTubeTrack(song);
  }

  // Fast highlight active song in grid without full DOM scan (O(1))
  const prevPlaying = document.querySelector('.song-card.playing');
  if (prevPlaying && prevPlaying.dataset.id !== song.id) {
    prevPlaying.classList.remove('playing');
  }
  const currPlaying = document.querySelector(`.song-card[data-id="${song.id}"]`);
  if (currPlaying) {
    currPlaying.classList.add('playing');
  }

  // Record history locally
  if (!state.library.history) state.library.history = [];
  state.library.history = state.library.history.filter(s => s.id !== song.id);
  state.library.history.unshift(song);
  if (state.library.history.length > 50) state.library.history = state.library.history.slice(0, 50);

  updateNativePlaybackState(song, true);
  syncDiscordPresence();

  // Defer non-critical tasks so audio playback and player UI transition with zero frame drop
  setTimeout(() => {
    persistLibrary(state.library);
    if (state.currentView === 'home' && elements.homeRecentGrid && elements.homeRecentSection) {
      elements.homeRecentSection.style.display = 'flex';
      const recents = state.library.history.slice(0, 6);
      elements.homeRecentGrid.innerHTML = recents.map((s, idx) => `
        <div class="recent-track-card" data-idx="${idx}">
          <img src="${s.thumbnail || 'https://via.placeholder.com/60'}" class="recent-track-thumb" alt="${escapeHtml(s.title)}" loading="lazy" decoding="async">
          <div class="recent-track-info">
            <div class="recent-track-title">${escapeHtml(s.title)}</div>
            <div class="recent-track-artist">${escapeHtml(s.channel)}</div>
          </div>
          <div class="recent-track-play">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>
      `).join('');
    }

    fetch('/api/library/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song })
    }).catch(() => {});

    updateQueueDrawer();
    fetchLyricsForSong(song);
  }, 60);
}

function togglePlayPause(e) {
  // If called without an event right after an external OS/WebView pause (e.g. phone call / headphone unplug),
  // prevent MusicPlaybackService's legacy MediaSession.onPause("playPause") from toggling music back ON!
  if (!e && !state.isPlaying && (Date.now() - lastExternalPauseTime < 1500)) {
    return;
  }

  if (!state.currentSong) {
    if (state.currentPlaylist.length > 0) {
      playSong(state.currentPlaylist[0], state.currentPlaylist, 0);
    }
    return;
  }

  if (state.isOfflinePlaying) {
    if (localAudio.paused) {
      userRequestedPause = false;
      localAudio.play();
    } else {
      userRequestedPause = true;
      localAudio.pause();
    }
  } else {
    if (!ytReady || !ytPlayer) return;
    if (state.isPlaying) {
      userRequestedPause = true;
      ytPlayer.pauseVideo();
    } else {
      userRequestedPause = false;
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
  syncDiscordPresence();
}

// --- ADVANCED SHUFFLE & SMART RECOMMENDATION ENGINE (v1.4.3 AI + SIMILARITY GRAPH) ---

const SMART_GENRE_AFFINITIES = [
  {
    genre: 'tr_rap_new',
    keywords: ['lvbel', 'level', 'c5', 'uzi', 'cakal', 'reckol', 'motive', 'batuflex', 'blok3', 'ati242', 'heijan', 'mavi', 'organize', 'sefo', 'murda', 'era7capone', 'poizi', 'deha', 'wegh', 'keskin', 'jeff redd', 'misa', 'akdo', 'drill', 'trap'],
    peers: ['Uzi', 'Cakal', 'Blok3', 'Motive', 'Batuflex', 'Reckol', 'Organize', 'Ati242', 'Heijan', 'Sefo', 'Murda', 'Era7capone', 'Poizi', 'Wegh', 'Jeff Redd', 'Keskin'],
    fallbackQueries: ['türkçe rap hit şarkılar', 'türkçe trap drill popüler']
  },
  {
    genre: 'tr_rap_classic',
    keywords: ['ceza', 'sagopa', 'ezhel', 'sehinşah', 'sehinsah', 'hidra', 'allame', 'rota', 'norm ender', 'patron', 'gazapizm', 'sansar salvo', 'no.1', 'no 1', 'şanışer', 'saniser', 'contra', 'anıl piyancı', 'anil piyanci', 'aspova', 'stabil', 'defkhan'],
    peers: ['Ezhel', 'Ceza', 'Sagopa Kajmer', 'Şehinşah', 'Hidra', 'Gazapizm', 'No.1', 'Allame', 'Şanışer', 'Norm Ender', 'Anıl Piyancı', 'Aspova', 'Patron', 'Stabil'],
    fallbackQueries: ['türkçe rap efsaneleri hit', 'en iyi türkçe rap şarkılar']
  },
  {
    genre: 'tr_pop_modern',
    keywords: ['semicenk', 'reynmen', 'burak bulut', 'kurtulus kus', 'dogu swag', 'ikilem', 'mela bedel', 'mert demir', 'kofn', 'köfn', 'dedubluman', 'dedüblüman', 'simge', 'zeynep bastik', 'edis', 'merve ozbey', 'irem derici', 'derya ulug', 'aleyna tilki', 'buray', 'oguzhan koc', 'mabel matiz', 'tugba yurt', 'bilal sonses', 'ziynet sali', 'melike sahin'],
    peers: ['Semicenk', 'Mert Demir', 'Simge', 'Zeynep Bastık', 'Edis', 'Merve Özbey', 'İrem Derici', 'Derya Uluğ', 'Buray', 'Mabel Matiz', 'Tuğba Yurt', 'Reynmen', 'Melike Şahin', 'Oğuzhan Koç', 'İkilem', 'Bilal Sonses'],
    fallbackQueries: ['türkçe pop hit 2025 2026', 'en çok dinlenen türkçe pop']
  },
  {
    genre: 'tr_pop_2000s',
    keywords: ['gülşen', 'gulsen', 'tarkan', 'hadise', 'hande yener', 'demet akalin', 'mustafa sandal', 'serdar ortac', 'kenan dogulu', 'bengu', 'murat boz', 'yalin', 'gokhan ozen', 'petek dincoz', 'ajda pekkan', 'sertab erener', 'sezen aksu', 'nilufer', 'sila', 'gokhan tepe', 'emre altug', 'burcu gunes', 'isın karaca'],
    peers: ['Tarkan', 'Hande Yener', 'Hadise', 'Mustafa Sandal', 'Serdar Ortaç', 'Kenan Doğulu', 'Demet Akalın', 'Sertab Erener', 'Murat Boz', 'Bengü', 'Yalın', 'Gökhan Özen', 'Sıla', 'Ajda Pekkan', 'Sezen Aksu', 'Gülşen'],
    fallbackQueries: ['2000ler türkçe pop hit şarkılar', 'türkçe pop efsaneleri']
  },
  {
    genre: 'tr_rock_alt',
    keywords: ['duman', 'mor ve otesi', 'manga', 'teoman', 'sebnem ferah', 'dolu kadehi ters tut', 'yuzyuzeyken konusuruz', 'madrigal', 'adamlar', 'kaan bosnak', 'hayko cepkin', 'gripin', 'yuksek sadakat', 'haluk levent', 'baris manco', 'cem karaca', 'erkin koray', 'athena', 'emre aydin', 'model', 'fatma turgut', 'sekendiz', 'canozan', 'perdenin ardindakiler'],
    peers: ['Duman', 'Mor ve Ötesi', 'maNga', 'Teoman', 'Şebnem Ferah', 'Dolu Kadehi Ters Tut', 'Yüzyüzeyken Konuşuruz', 'Madrigal', 'Adamlar', 'Gripin', 'Emre Aydın', 'Model', 'Athena', 'Fatma Turgut', 'Perdenin Ardındakiler'],
    fallbackQueries: ['türkçe rock alternatif hit şarkılar', 'türkçe rock en çok dinlenenler']
  },
  {
    genre: 'tr_arabesk_slow',
    keywords: ['muslum gurses', 'ahmet kaya', 'ibrahim tatlises', 'ferdi tayfur', 'orhan gencebay', 'ebru gundes', 'yildiz tilbe', 'hakan altun', 'cengiz kurtoglu', 'kibariye', 'azer bulbul', 'bergen', 'gullu', 'funda arar', 'tan tasci', 'emir can igrek', 'koray avci'],
    peers: ['Müslüm Gürses', 'Ahmet Kaya', 'Ebru Gündeş', 'Yıldız Tilbe', 'Hakan Altun', 'Ferdi Tayfur', 'İbrahim Tatlıses', 'Funda Arar', 'Tan Taşçı', 'Bergen', 'Cengiz Kurtoğlu', 'Koray Avcı'],
    fallbackQueries: ['türkçe damar arabesk slow hit', 'duygusal türkçe şarkılar']
  },
  {
    genre: 'en_pop_rnb',
    keywords: ['the weeknd', 'dua lipa', 'taylor swift', 'billie eilish', 'ariana grande', 'bruno mars', 'ed sheeran', 'justin bieber', 'rihanna', 'lady gaga', 'lana del rey', 'harry styles', 'shawn mendes', 'charlie puth', 'camila cabello', 'selena gomez', 'katy perry', 'adele', 'sia', 'sam smith', 'olivia rodrigo', 'sabrina carpenter', 'post malone'],
    peers: ['The Weeknd', 'Dua Lipa', 'Billie Eilish', 'Bruno Mars', 'Rihanna', 'Ariana Grande', 'Lady Gaga', 'Lana Del Rey', 'Ed Sheeran', 'Post Malone', 'Sabrina Carpenter', 'Taylor Swift', 'Sia', 'Adele'],
    fallbackQueries: ['global pop hits official audio', 'top english pop songs']
  },
  {
    genre: 'en_hiphop_rap',
    keywords: ['travis scott', 'drake', 'eminem', 'kendrick lamar', 'kanye west', 'future', 'metro boomin', '21 savage', 'playboi carti', 'central cee', 'pop smoke', '50 cent', 'snoop dogg', 'tupac', '2pac', 'jay-z', 'asap rocky', 'nicki minaj', 'cardi b', 'jack harlow', 'don toliver', 'lil baby', 'gunna'],
    peers: ['Travis Scott', 'Drake', 'Kendrick Lamar', 'Metro Boomin', '21 Savage', 'Future', 'Eminem', 'Central Cee', 'Don Toliver', 'Playboi Carti', 'Pop Smoke', 'Kanye West', 'A$AP Rocky'],
    fallbackQueries: ['hip hop rap hits official audio', 'best trap rap songs']
  },
  {
    genre: 'en_electronic_phonk',
    keywords: ['phonk', 'kordhell', 'interworld', 'hensconn', 'dvrst', 'playaphonk', 'alan walker', 'marshmello', 'david guetta', 'calvin harris', 'tiesto', 'avicii', 'martin garrix', 'skrillex', 'daft punk', 'kygo', 'alok', 'imany', 'iniko'],
    peers: ['Calvin Harris', 'David Guetta', 'Avicii', 'Tiësto', 'Alan Walker', 'Martin Garrix', 'Kygo', 'Daft Punk', 'Kordhell', 'Interworld', 'DVRST'],
    fallbackQueries: ['electronic dance hits official audio', 'best edm phonk hits']
  },
  {
    genre: 'en_rock_metal',
    keywords: ['linkin park', 'metallica', 'nirvana', 'arctic monkeys', 'imagine dragons', 'coldplay', 'queen', 'ac/dc', 'guns n roses', 'red hot chili peppers', 'green day', 'evanescence', 'system of a down', 'slipknot', 'rammstein', 'radiohead', 'the neighbourhood', 'twenty one pilots', 'maneskin'],
    peers: ['Linkin Park', 'Arctic Monkeys', 'Imagine Dragons', 'Coldplay', 'Nirvana', 'Metallica', 'The Neighbourhood', 'Twenty One Pilots', 'Evanescence', 'Red Hot Chili Peppers', 'Queen', 'Måneskin'],
    fallbackQueries: ['rock alternative hits official audio', 'best rock songs']
  }
];

function stripChannelLabels(str) {
  if (!str) return '';
  let s = str
    .replace(/\b(?:netd\s*müzik|netd\s*muzik|netd|poll\s*production|dmc|doğan\s*music\s*company|dogan\s*music|sony\s*music|universal\s*music|warner\s*music|avrupa\s*müzik|avrupa\s*muzik|dokuz\s*sekiz\s*müzik|pasaj\s*müzik|kalan\s*müzik|bmg|emre\s*plak|özdemir\s*plak|ozdemir\s*plak|vevo)\b\s*(?:ve|&|,|-|\/|\+)?\s*/gi, '')
    .replace(/\s*(?:ve|&|,|-|\/|\+)\s*\b(?:netd\s*müzik|netd\s*muzik|netd|poll\s*production|dmc|sony\s*music|universal\s*music|avrupa\s*müzik|vevo)\b/gi, '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\b(?:Official\s*Artist\s*Channel|Official\s*Channel|Official|Resmi\s*Kanalı?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function normalizeArtistQuery(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\blevel\b/g, 'lvbel')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractClientArtists(song) {
  const artists = new Set();
  if (!song) return [];

  const cleanedChannel = stripChannelLabels(song.channel || '');
  if (cleanedChannel) {
    const channelParts = cleanedChannel.split(/\s*(?:&|feat\.?|ft\.?|\bx\b|\bve\b|,|\/|\+)\s*/i);
    for (const part of channelParts) {
      const p = part.trim();
      if (p.length >= 2 && !/^(records|muzik|müzik|music|vevo|entertainment|official|audio|yapim|yapım|netd|video|tv|plak|produksiyon|prodüksiyon|digital|media|topic)$/i.test(p)) {
        artists.add(p.toLowerCase());
        artists.add(normalizeArtistQuery(p));
      }
    }
  }

  if (song.title) {
    const parts = song.title.split(/\s*[-–—:]\s*/);
    if (parts.length > 1) {
      const lead = stripChannelLabels(parts[0].replace(/[\(\[].*?[\)\]]/g, '').trim());
      const subs = lead.split(/\s*(?:&|feat\.?|ft\.?|\bx\b|\bve\b|,|\/|\+)\s*/i);
      subs.forEach(s => {
        const clean = s.trim();
        if (clean.length >= 2 && !/(official|video|klip|audio|hd|4k|lyrics|sarkisi|şarkısı)/i.test(clean)) {
          artists.add(clean.toLowerCase());
          artists.add(normalizeArtistQuery(clean));
        }
      });
    }
  }
  return Array.from(artists).filter(Boolean);
}

function matchesAnyArtist(candidateTitle, candidateChannel, targetArtists) {
  if (!targetArtists || targetArtists.length === 0) return false;
  const candStr = normalizeArtistQuery(`${candidateTitle || ''} ${stripChannelLabels(candidateChannel || '')}`);
  const candWords = candStr.split(/[^a-z0-9]+/).filter(Boolean);
  for (const target of targetArtists) {
    const t = normalizeArtistQuery(stripChannelLabels(target));
    if (!t || t.length < 2) continue;
    if (t.length <= 3) {
      if (candWords.includes(t)) return true;
    } else if (candStr.includes(t)) {
      return true;
    }
  }
  return false;
}

function isSameArtistAsRecent(song) {
  if (!song) return false;
  const songArtists = extractClientArtists(song);
  const recent = [
    ...(state.playedArtists || []).slice(-8),
    ...(state.currentSong ? extractClientArtists(state.currentSong) : [])
  ];
  if (matchesAnyArtist(song.title, song.channel, recent)) return true;
  for (const a of songArtists) {
    if (matchesAnyArtist(a, a, recent)) return true;
  }
  return false;
}

function initShufflePool(forceReset = false) {
  if (!state.currentPlaylist || state.currentPlaylist.length === 0) {
    state.unplayedShuffleIndices = [];
    return;
  }
  if (forceReset || !state.unplayedShuffleIndices || state.unplayedShuffleIndices.length === 0) {
    const indices = [];
    for (let i = 0; i < state.currentPlaylist.length; i++) {
      if (i !== state.currentIndex) indices.push(i);
    }
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    state.unplayedShuffleIndices = indices;
  }
}

async function fetchMobileNativeSmartMix(currentSong, excludeArtists = [], excludeIds = []) {
  if (!currentSong) return [];

  const rawArtists = extractClientArtists(currentSong);
  const normArtists = rawArtists.map(a => normalizeArtistQuery(a)).filter(Boolean);

  // Expand alias exclusions (e.g. Lvbel C5 <-> Level C5, Gülşen <-> Gulsen)
  const allExcluded = new Set([...excludeArtists.map(a => normalizeArtistQuery(a)).filter(Boolean), ...normArtists]);
  for (const a of normArtists) {
    if (a.includes('lvbel') || a.includes('c5')) {
      allExcluded.add('lvbel c5');
      allExcluded.add('level c5');
      allExcluded.add('lvbel');
      allExcluded.add('level');
      allExcluded.add('c5');
    }
    if (a.includes('cakal')) {
      allExcluded.add('cakal');
    }
  }
  const excludeList = Array.from(allExcluded);
  const seenIds = new Set([...(excludeIds || []), currentSong.id]);
  const batchChosenArtists = [];

  // Score all genre clusters to pick the best vibe match
  const combined = normalizeArtistQuery(`${currentSong.title || ''} ${stripChannelLabels(currentSong.channel || '')}`);
  let matchedGroup = null;
  let bestScore = 0;
  for (const g of SMART_GENRE_AFFINITIES) {
    let score = 0;
    for (const kw of g.keywords) {
      const nkw = normalizeArtistQuery(kw);
      if (combined.includes(nkw)) {
        score += (nkw.length > 4 ? 3 : 2);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      matchedGroup = g;
    }
  }

  // Pick 3 distinct peer artists that are NOT excluded
  let selectedPeers = [];
  if (matchedGroup) {
    const candidatePeers = matchedGroup.peers.filter(p => !matchesAnyArtist(p, p, excludeList));
    for (let i = candidatePeers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidatePeers[i], candidatePeers[j]] = [candidatePeers[j], candidatePeers[i]];
    }
    selectedPeers = candidatePeers.slice(0, 3);
  }

  const searchQueries = [];
  selectedPeers.forEach(peer => {
    searchQueries.push(`${peer} en çok dinlenen şarkısı official audio`);
  });

  if (searchQueries.length === 0) {
    const cleanMainArtist = stripChannelLabels(currentSong.channel || '');
    const isTurkish = /[ğüşiöçĞÜŞİÖÇ]/.test(`${currentSong.title || ''} ${currentSong.channel || ''}`);
    if (isTurkish) {
      searchQueries.push('türkçe pop hit şarkılar 2025');
      searchQueries.push('2000ler türkçe pop en çok dinlenenler');
    } else if (cleanMainArtist) {
      searchQueries.push(`songs similar to ${cleanMainArtist} official audio`);
    } else {
      searchQueries.push('global hit songs official audio');
    }
  }

  const collectedTracks = [];

  for (const q of searchQueries) {
    try {
      const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
      const results = (data && data.results) ? data.results : (Array.isArray(data) ? data : []);
      for (const t of results) {
        if (!t || !t.id || seenIds.has(t.id)) continue;
        // Filter out compilations / 1 hour mixes / karaoke / shorts
        if (/\b(full\s*album|1\s*saat|1\s*hour|karaoke|instrumental|shorts|podcast|canlı\s*yayın|reaksiyon)\b/i.test(t.title || '')) continue;
        // Strictly filter out the current artist, all recently played artists, and artists already in this batch
        if (matchesAnyArtist(t.title, t.channel, [...excludeList, ...batchChosenArtists])) continue;
        if (state.playedTrackIds && state.playedTrackIds.has(t.id)) continue;

        seenIds.add(t.id);
        const candArtists = extractClientArtists(t);
        batchChosenArtists.push(...candArtists);

        collectedTracks.push({
          id: t.id,
          title: t.title || '',
          channel: stripChannelLabels(t.channel || '') || t.channel || '',
          duration: t.duration || '3:30',
          thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`,
          isSmartRecommendation: true
        });
        // Max 1 track per peer search query so every recommended track is by a different artist!
        break;
      }
    } catch (e) {
      console.warn('Native smart mix search error:', e);
    }
    if (collectedTracks.length >= 6) break;
  }

  return collectedTracks;
}

async function fetchSmartDiverseRecommendations(currentSong) {
  if (!currentSong) return [];

  const excludeIds = Array.from(new Set([
    ...(state.currentPlaylist ? state.currentPlaylist.map(s => s.id) : []),
    ...Array.from(state.playedTrackIds || []),
    ...(state.smartQueue ? state.smartQueue.map(s => s.id) : [])
  ])).filter(Boolean).slice(-40);

  const excludeArtists = Array.from(new Set([
    ...(state.playedArtists || []).slice(-8),
    ...extractClientArtists(currentSong)
  ])).filter(Boolean);

  // 1. Try server endpoint first (uses Ollama AI llama3.1:8b + YouTube Radio Mix + 12-Genre Graph)
  try {
    const url = `/api/recommendations?videoId=${encodeURIComponent(currentSong.id || '')}&artist=${encodeURIComponent(currentSong.channel || '')}&title=${encodeURIComponent(currentSong.title || '')}&excludeArtists=${encodeURIComponent(JSON.stringify(excludeArtists))}&excludeIds=${encodeURIComponent(JSON.stringify(excludeIds))}`;
    const res = await apiFetch(url);
    if (res && res.recommendations && res.recommendations.length > 0) {
      const valid = res.recommendations.filter(r =>
        !state.playedTrackIds.has(r.id) &&
        !matchesAnyArtist(r.title, r.channel, excludeArtists)
      );
      if (valid.length > 0) {
        return valid.map(r => ({ ...r, isSmartRecommendation: true }));
      }
    }
  } catch (e) {
    console.warn('Server recommendations unavailable, falling back to mobile smart mix:', e);
  }

  // 2. Mobile Native & Client-Side Smart Mix Engine (works 100% on Android APK!)
  return await fetchMobileNativeSmartMix(currentSong, excludeArtists, excludeIds);
}

async function prefetchSmartRecommendations() {
  if (!state.currentSong || state.isOfflinePlaying || state.isFetchingSmartQueue) return;
  if (state.smartQueue && state.smartQueue.length >= 3) return;

  state.isFetchingSmartQueue = true;
  try {
    const recs = await fetchSmartDiverseRecommendations(state.currentSong);
    if (recs && recs.length > 0) {
      const existingQueueIds = new Set((state.smartQueue || []).map(s => s.id));
      for (const rec of recs) {
        if (!existingQueueIds.has(rec.id) && !state.playedTrackIds.has(rec.id)) {
          state.smartQueue.push({ ...rec, isSmartRecommendation: true });
          existingQueueIds.add(rec.id);
        }
      }
    }
  } catch (err) {
    console.warn('Smart recommendations prefetch warning:', err);
  } finally {
    state.isFetchingSmartQueue = false;
  }
}

async function playNext() {
  // 0. If user pressed Previous (Geri Gel) and is stepping forward through session history
  if (state.navHistory && state.navHistoryPos >= 0 && state.navHistoryPos < state.navHistory.length - 1) {
    state.navHistoryPos++;
    const nextEntry = state.navHistory[state.navHistoryPos];
    if (nextEntry && nextEntry.song) {
      state.isNavigatingHistory = true;
      playSong(nextEntry.song, state.currentPlaylist, nextEntry.index);
      return;
    }
  }

  // 1. Explicit user queue
  if (state.queue.length > 0) {
    const nextSong = state.queue.shift();
    elements.queueBadge.textContent = state.queue.length;
    playSong(nextSong);
    return;
  }

  // 2. SMART SHUFFLE: Intelligent cross-artist discovery in the same genre
  if (state.shuffleMode === 'smart') {
    let smartCandidate = null;
    const currentExcludedArtists = [
      ...(state.playedArtists || []).slice(-6),
      ...(state.currentSong ? extractClientArtists(state.currentSong) : [])
    ];

    // A. Use pre-fetched candidate if ready in queue (and verify it doesn't match the current artist!)
    while (state.smartQueue && state.smartQueue.length > 0) {
      const cand = state.smartQueue.shift();
      if (cand && !matchesAnyArtist(cand.title, cand.channel, currentExcludedArtists)) {
        smartCandidate = cand;
        break;
      }
    }

    if (!smartCandidate && state.currentSong && !state.isOfflinePlaying) {
      // B. Fetch on the fly if queue was empty
      try {
        const recs = await fetchSmartDiverseRecommendations(state.currentSong);
        if (recs && recs.length > 0) {
          smartCandidate = recs[0];
          state.smartQueue = recs.slice(1);
        }
      } catch (e) {
        console.warn('Smart shuffle on-demand fetch fallback:', e);
      }
    }

    // Play smart recommendation by a different artist!
    if (smartCandidate) {
      showToast(`✨ Akıllı Mix: ${smartCandidate.title}`);
      playSong(smartCandidate, state.currentPlaylist, state.currentIndex);
      return;
    }

    // Fallback: if offline or no recs found, play from playlist with diversity
    if (state.currentPlaylist && state.currentPlaylist.length > 0) {
      initShufflePool();
      let pickedIdx = -1;
      for (let i = 0; i < state.unplayedShuffleIndices.length; i++) {
        const testIdx = state.unplayedShuffleIndices[i];
        const testSong = state.currentPlaylist[testIdx];
        if (!isSameArtistAsRecent(testSong)) {
          pickedIdx = state.unplayedShuffleIndices.splice(i, 1)[0];
          break;
        }
      }
      if (pickedIdx === -1 && state.unplayedShuffleIndices.length > 0) {
        pickedIdx = state.unplayedShuffleIndices.shift();
      }
      if (pickedIdx >= 0) {
        const nextSong = { ...state.currentPlaylist[pickedIdx], isSmartRecommendation: false };
        playSong(nextSong, state.currentPlaylist, pickedIdx);
        return;
      }
    }
  }

  // 3. STANDARD SHUFFLE: Non-repeating fair deck shuffle with artist diversity
  if (state.isShuffled || state.shuffleMode === 'standard') {
    if (state.currentPlaylist && state.currentPlaylist.length > 0) {
      initShufflePool();
      let pickedIdx = -1;
      // Prefer a song by a different artist than recent
      for (let i = 0; i < state.unplayedShuffleIndices.length; i++) {
        const testIdx = state.unplayedShuffleIndices[i];
        const testSong = state.currentPlaylist[testIdx];
        if (!isSameArtistAsRecent(testSong)) {
          pickedIdx = state.unplayedShuffleIndices.splice(i, 1)[0];
          break;
        }
      }
      if (pickedIdx === -1 && state.unplayedShuffleIndices.length > 0) {
        pickedIdx = state.unplayedShuffleIndices.shift();
      }
      if (pickedIdx >= 0) {
        const nextSong = { ...state.currentPlaylist[pickedIdx], isSmartRecommendation: false };
        playSong(nextSong, state.currentPlaylist, pickedIdx);
        return;
      }
    }
  }

  // 4. SEQUENTIAL
  if (!state.currentPlaylist || state.currentPlaylist.length === 0) return;
  let nextIdx = state.currentIndex + 1;
  if (nextIdx >= state.currentPlaylist.length) {
    if (state.repeatMode === 'off') return;
    nextIdx = 0;
  }

  const nextSong = { ...state.currentPlaylist[nextIdx], isSmartRecommendation: false };
  playSong(nextSong, state.currentPlaylist, nextIdx);
}

function playPrev() {
  // 1. If we have actual session navigation history (vital for Shuffle & Smart Shuffle!),
  // go back to the exact song that was played previously!
  if (state.navHistory && state.navHistoryPos > 0) {
    state.navHistoryPos--;
    const prevEntry = state.navHistory[state.navHistoryPos];
    if (prevEntry && prevEntry.song) {
      state.isNavigatingHistory = true;
      const targetIdx = (typeof prevEntry.index === 'number' && prevEntry.index >= 0)
        ? prevEntry.index
        : state.currentPlaylist.findIndex(s => s.id === prevEntry.song.id);
      playSong(prevEntry.song, state.currentPlaylist, targetIdx >= 0 ? targetIdx : state.currentIndex);
      return;
    }
  }

  // 2. If at the very start of session history and > 5 seconds into song, restart track
  if (state.isOfflinePlaying) {
    if (localAudio.currentTime > 5) {
      localAudio.currentTime = 0;
      return;
    }
  } else if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 5) {
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
    try { localStorage.setItem('muzikal_shuffle_mode', 'standard'); } catch(e) {}
    updateShuffleUI();
    showToast('🔀 Karışık Çalma Açık');
  } else if (state.shuffleMode === 'standard') {
    state.shuffleMode = 'smart';
    try { localStorage.setItem('muzikal_shuffle_mode', 'smart'); } catch(e) {}
    updateShuffleUI();
    showToast('✨ Akıllı Mix Açık (Benzer Sanatçılar & Hit Şarkılar)');
    if (state.currentSong) prefetchSmartRecommendations();
  } else {
    state.shuffleMode = 'off';
    try { localStorage.setItem('muzikal_shuffle_mode', 'off'); } catch(e) {}
    state.smartQueue = [];
    updateShuffleUI();
    showToast('Karışık Çalma Kapalı');
  }
  updateNativePlaybackState(state.currentSong, state.isPlaying);
}

function updateRepeatUI() {
  const mode = state.repeatMode || 'all';
  state.repeatMode = mode;

  const repeatSvgStandard = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"></polyline>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
    <polyline points="7 23 3 19 7 15"></polyline>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
  </svg>`;

  const repeatSvgOne = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"></polyline>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
    <polyline points="7 23 3 19 7 15"></polyline>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    <text x="12" y="15" font-size="9" font-weight="900" fill="currentColor" text-anchor="middle" stroke="none">1</text>
  </svg>`;

  const mfpRepeatSvgStandard = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"></polyline>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
    <polyline points="7 23 3 19 7 15"></polyline>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
  </svg>`;

  const mfpRepeatSvgOne = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"></polyline>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
    <polyline points="7 23 3 19 7 15"></polyline>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    <text x="12" y="15" font-size="9" font-weight="900" fill="currentColor" text-anchor="middle" stroke="none">1</text>
  </svg>`;

  if (elements.btnRepeat) {
    elements.btnRepeat.classList.toggle('active', mode !== 'off');
    elements.btnRepeat.classList.toggle('repeat-one-active', mode === 'one');
    elements.btnRepeat.innerHTML = (mode === 'one') ? repeatSvgOne : repeatSvgStandard;
    elements.btnRepeat.title = (mode === 'one') ? 'Sadece Bu Şarkıyı Tekrarla (Tekrar 1)' : (mode === 'all' ? 'Tümünü Tekrarla' : 'Tekrar Kapalı');
  }

  if (elements.mfpBtnRepeat) {
    elements.mfpBtnRepeat.classList.toggle('active', mode !== 'off');
    elements.mfpBtnRepeat.classList.toggle('repeat-one-active', mode === 'one');
    elements.mfpBtnRepeat.innerHTML = (mode === 'one') ? mfpRepeatSvgOne : mfpRepeatSvgStandard;
    elements.mfpBtnRepeat.title = (mode === 'one') ? 'Sadece Bu Şarkıyı Tekrarla (Tekrar 1)' : (mode === 'all' ? 'Tümünü Tekrarla' : 'Tekrar Kapalı');
  }
}

function cycleRepeatMode() {
  if (state.repeatMode === 'all') {
    state.repeatMode = 'one';
    updateRepeatUI();
    showToast('🔂 Sadece Bu Şarkıyı Tekrarla (Tekrar 1)');
  } else if (state.repeatMode === 'one') {
    state.repeatMode = 'off';
    updateRepeatUI();
    showToast('Tekrar Kapalı');
  } else {
    state.repeatMode = 'all';
    updateRepeatUI();
    showToast('🔁 Tümünü Tekrarla');
  }
  updateNativePlaybackState(state.currentSong, state.isPlaying);
}

// Window global bindings for native Android media controls
window.togglePlayPause = togglePlayPause;
window.playNext = playNext;
window.playPrev = playPrev;
window.toggleShuffle = cycleShuffleMode;
window.toggleRepeat = cycleRepeatMode;

function onSongEnded() {
  if (state.repeatMode === 'one' && state.currentSong) {
    if (state.isOfflinePlaying) {
      localAudio.currentTime = 0;
      localAudio.play();
    } else {
      if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
        ytPlayer.seekTo(0);
        ytPlayer.playVideo();
      } else {
        playSong(state.currentSong);
      }
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
        syncLyricsWithTime(current);
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

function getEventClientX(event) {
  if (event.touches && event.touches.length > 0) return event.touches[0].clientX;
  if (event.changedTouches && event.changedTouches.length > 0) return event.changedTouches[0].clientX;
  return event.clientX;
}

function seekToTrack(trackElem, event) {
  if (!trackElem) return;
  const rect = trackElem.getBoundingClientRect();
  if (!rect.width) return;
  const clientX = getEventClientX(event);
  if (typeof clientX !== 'number') return;
  const clickX = clientX - rect.left;
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
  state.volume = Math.round(Math.max(0, Math.min(100, pct)));
  try { localStorage.setItem('muzikal_volume', String(state.volume)); } catch (e) {}
  if (elements.volumeSliderFill) {
    elements.volumeSliderFill.style.width = `${state.volume}%`;
  }

  if (localAudio) localAudio.volume = state.volume / 100;
  if (ytReady && ytPlayer) {
    try {
      ytPlayer.setVolume(state.volume);
      if (state.volume > 0 && typeof ytPlayer.isMuted === 'function' && ytPlayer.isMuted()) {
        ytPlayer.unMute();
        state.isMuted = false;
      }
    } catch (e) {}
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

// --- QUEUE & UPCOMING TRACKS ENGINE ---

function addToQueue(song) {
  state.queue.push(song);
  elements.queueBadge.textContent = state.queue.length;
  updateQueueDrawer();
  showToast(`"${song.title}" sıraya eklendi.`);
}

function getUpcomingTracks(limit = 20) {
  let source = 'Sırada şarkı yok';
  let tracks = [];

  if (state.shuffleMode === 'smart') {
    source = '✨ Akıllı Mix & Keşif';
    const smarts = (state.smartQueue || []).map(s => ({ ...s, isSmartRecommendation: true }));
    tracks.push(...smarts);

    if (state.currentPlaylist && state.unplayedShuffleIndices) {
      for (const idx of state.unplayedShuffleIndices) {
        const s = state.currentPlaylist[idx];
        if (s && !tracks.some(t => t.id === s.id) && s.id !== (state.currentSong && state.currentSong.id)) {
          tracks.push({ ...s, isSmartRecommendation: false });
        }
      }
    }
  } else if (state.shuffleMode === 'standard' || state.isShuffled) {
    source = '🔀 Karışık Çalma';
    if (state.currentPlaylist && state.unplayedShuffleIndices) {
      for (const idx of state.unplayedShuffleIndices) {
        const s = state.currentPlaylist[idx];
        if (s && s.id !== (state.currentSong && state.currentSong.id)) {
          tracks.push({ ...s, isSmartRecommendation: false });
        }
      }
    }
  } else if (state.currentPlaylist && state.currentPlaylist.length > 0 && state.currentIndex >= 0) {
    source = '▶️ Sırayla Çalma';
    const nextSlice = state.currentPlaylist.slice(state.currentIndex + 1);
    tracks.push(...nextSlice);
    if (state.repeatMode === 'all') {
      const wrapped = state.currentPlaylist.slice(0, state.currentIndex);
      tracks.push(...wrapped);
    }
  }

  return { source, tracks: tracks.slice(0, limit) };
}

function updateQueueDrawer() {
  // 1. Currently Playing Item
  if (state.currentSong) {
    elements.queueNpItem.innerHTML = `
      <div class="queue-item" style="border-color: rgba(30, 215, 96, 0.4);">
        <img src="${state.currentSong.thumbnail || 'https://via.placeholder.com/60'}" class="queue-item-thumb">
        <div class="queue-item-info">
          <div class="queue-item-title" style="color: var(--accent);">${escapeHtml(state.currentSong.title)}</div>
          <div class="queue-item-artist">${escapeHtml(state.currentSong.channel)}</div>
        </div>
        <div class="playing-indicator" style="display: flex;">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  } else {
    elements.queueNpItem.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">Şu an şarkı çalmıyor</span>`;
  }

  // 2. Manual User Queue (Plays first)
  if (elements.queueManualCount) {
    elements.queueManualCount.textContent = state.queue.length;
  }

  if (state.queue.length === 0) {
    elements.queueItems.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);padding:8px 0;">
        Kullanıcı sırası boş. Yukarıdaki arama kutusundan hızlıca ekleyebilirsiniz.
      </div>
    `;
  } else {
    elements.queueItems.innerHTML = state.queue.map((song, i) => `
      <div class="queue-item" data-idx="${i}">
        <img src="${song.thumbnail || 'https://via.placeholder.com/60'}" class="queue-item-thumb">
        <div class="queue-item-info">
          <div class="queue-item-title">${escapeHtml(song.title)}</div>
          <div class="queue-item-artist">${escapeHtml(song.channel)}</div>
        </div>
        <button class="btn-icon-subtle btn-remove-queue" data-idx="${i}" title="Sıradan Çıkar">✕</button>
      </div>
    `).join('');

    elements.queueItems.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-queue')) return;
        const idx = parseInt(item.dataset.idx, 10);
        const song = state.queue.splice(idx, 1)[0];
        elements.queueBadge.textContent = state.queue.length;
        playSong(song);
        updateQueueDrawer();
      });
    });

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

  // 3. Upcoming Tracks (Playlist / Smart Mix)
  const upcoming = getUpcomingTracks(25);
  if (elements.queueUpcomingSource) {
    elements.queueUpcomingSource.textContent = upcoming.source;
  }

  // Check Spoiler / Surprise Mode
  if (state.hideUpcomingQueue) {
    if (elements.queueUpcomingItems) elements.queueUpcomingItems.style.display = 'none';
    if (elements.queueSpoilerMask) elements.queueSpoilerMask.style.display = 'flex';
    if (elements.queueSpoilerIcon) elements.queueSpoilerIcon.textContent = '👁️';
    if (elements.queueSpoilerText) elements.queueSpoilerText.textContent = 'Sıradakileri Göster';
    if (elements.btnToggleQueueSpoiler) elements.btnToggleQueueSpoiler.classList.add('active');
  } else {
    if (elements.queueSpoilerMask) elements.queueSpoilerMask.style.display = 'none';
    if (elements.queueUpcomingItems) elements.queueUpcomingItems.style.display = 'flex';
    if (elements.queueSpoilerIcon) elements.queueSpoilerIcon.textContent = '🙈';
    if (elements.queueSpoilerText) elements.queueSpoilerText.textContent = 'Sıradakileri Gizle';
    if (elements.btnToggleQueueSpoiler) elements.btnToggleQueueSpoiler.classList.remove('active');

    if (upcoming.tracks.length === 0) {
      elements.queueUpcomingItems.innerHTML = `
        <div style="font-size:12px;color:var(--text-muted);padding:8px 0;">
          Sırada bekleyen başka şarkı yok.
        </div>
      `;
    } else {
      elements.queueUpcomingItems.innerHTML = upcoming.tracks.map((song, i) => `
        <div class="queue-item" data-upidx="${i}" title="Hemen Çal">
          <img src="${song.thumbnail || 'https://via.placeholder.com/60'}" class="queue-item-thumb">
          <div class="queue-item-info">
            <div class="queue-item-title">${escapeHtml(song.title)}</div>
            <div class="queue-item-artist">
              ${song.isSmartRecommendation ? '<span style="color:var(--accent);font-weight:700;">✨ Akıllı Öneri • </span>' : ''}
              ${escapeHtml(song.channel)}
            </div>
          </div>
          <button class="btn-icon-subtle btn-pin-queue" data-upidx="${i}" title="Kullanıcı Sırasına Ekle (Öncelikli Yap)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      `).join('');

      elements.queueUpcomingItems.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.btn-pin-queue')) return;
          const upIdx = parseInt(item.dataset.upidx, 10);
          const song = upcoming.tracks[upIdx];
          if (song) {
            playSong(song, state.currentPlaylist, state.currentPlaylist ? state.currentPlaylist.findIndex(s => s.id === song.id) : -1);
            updateQueueDrawer();
          }
        });
      });

      elements.queueUpcomingItems.querySelectorAll('.btn-pin-queue').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const upIdx = parseInt(btn.dataset.upidx, 10);
          const song = upcoming.tracks[upIdx];
          if (song) {
            addToQueue(song);
          }
        });
      });
    }
  }
}

// --- ADD SONG TO PLAYLIST MODAL LOGIC ---

function openAddToPlaylistModal(song) {
  if (!song) return;
  state.selectedSongForPlaylist = song;
  if (elements.addPlSongThumb) elements.addPlSongThumb.src = song.thumbnail || 'https://via.placeholder.com/60';
  if (elements.addPlSongTitle) elements.addPlSongTitle.textContent = song.title || 'Şarkı';
  if (elements.addPlSongArtist) elements.addPlSongArtist.textContent = song.channel || 'Sanatçı';
  if (elements.inputAddPlNewName) elements.inputAddPlNewName.value = '';

  renderAddToPlaylistItems();
  if (elements.addToPlaylistModal) elements.addToPlaylistModal.style.display = 'flex';
}

function renderAddToPlaylistItems() {
  if (!elements.addPlPlaylistsContainer) return;
  const song = state.selectedSongForPlaylist;
  if (!song) return;

  const playlists = state.library.playlists || [];
  if (playlists.length === 0) {
    elements.addPlPlaylistsContainer.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);padding:14px;text-align:center;">
        Henüz kayıtlı çalma listeniz yok. Yukarıdan hemen yeni bir liste oluşturup şarkıyı ekleyin!
      </div>
    `;
    return;
  }

  elements.addPlPlaylistsContainer.innerHTML = playlists.map(pl => {
    const isAlreadyIn = (pl.songs || []).some(s => s.id === song.id);
    return `
      <div class="add-pl-item" data-plid="${pl.id}">
        <div class="add-pl-item-info">
          <span class="add-pl-item-name">${pl.isSpotify ? '🟢' : (pl.isYtm ? '🔴' : '📁')} ${escapeHtml(pl.name)}</span>
          <span class="add-pl-item-count">${(pl.songs || []).length} şarkı</span>
        </div>
        <button class="btn-add-pl-action ${isAlreadyIn ? 'added' : ''}" data-plid="${pl.id}">
          ${isAlreadyIn ? '✓ Eklendi' : '+ Ekle'}
        </button>
      </div>
    `;
  }).join('');

  elements.addPlPlaylistsContainer.querySelectorAll('.btn-add-pl-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const plId = btn.dataset.plid;
      const pl = state.library.playlists.find(p => p.id === plId);
      if (!pl) return;
      if (!pl.songs) pl.songs = [];

      const alreadyIn = pl.songs.some(s => s.id === song.id);
      if (alreadyIn) {
        pl.songs = pl.songs.filter(s => s.id !== song.id);
        btn.textContent = '+ Ekle';
        btn.classList.remove('added');
        showToast(`"${song.title}" "${pl.name}" listesinden kaldırıldı.`);
      } else {
        pl.songs.push(song);
        btn.textContent = '✓ Eklendi';
        btn.classList.add('added');
        showToast(`"${song.title}" "${pl.name}" listesine eklendi! ✨`);
      }

      await persistLibrary(state.library);
      renderSidebarPlaylists();
      renderAddToPlaylistItems();
    });
  });
}

// --- OFFLINE DOWNLOADS ENGINE (PC & MOBILE SUPPORT) ---

function getLocalDownloadedIds() {
  try {
    const raw = localStorage.getItem('muzikal_downloaded_ids');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveLocalDownloadedIds(idsArray) {
  try {
    localStorage.setItem('muzikal_downloaded_ids', JSON.stringify(Array.from(new Set(idsArray))));
  } catch (e) {}
}

function getLocalDownloadedMeta() {
  try {
    const raw = localStorage.getItem('muzikal_downloaded_meta');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveSongToDownloadedMeta(song) {
  if (!song || !song.id) return;
  try {
    const meta = getLocalDownloadedMeta();
    meta[song.id] = {
      id: song.id,
      title: song.title || 'Bilinmeyen Şarkı',
      channel: song.channel || 'Bilinmeyen Sanatçı',
      duration: song.duration || '',
      thumbnail: song.thumbnail || ''
    };
    localStorage.setItem('muzikal_downloaded_meta', JSON.stringify(meta));
  } catch (e) {}
}

async function resolveTrackIfNeeded(song) {
  if (!song) return song;
  if (!song.spotifyResolved && (song.spotifySearchQuery || String(song.id).startsWith('sp_'))) {
    const query = song.spotifySearchQuery || `${song.title} ${song.channel || ''}`;
    try {
      const res = await fetch(`/api/spotify/resolve?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.result && data.result.id) {
          song.id = data.result.id;
          song.thumbnail = data.result.thumbnail || song.thumbnail;
          song.duration = data.result.duration || song.duration;
          song.spotifyResolved = true;
          return song;
        }
      }
    } catch (e) {}
    try {
      const sRes = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (sRes && sRes.ok) {
        const sData = await sRes.json();
        if (sData && sData.results && sData.results.length > 0) {
          song.id = sData.results[0].id;
          song.thumbnail = sData.results[0].thumbnail || song.thumbnail;
          song.duration = sData.results[0].duration || song.duration;
          song.spotifyResolved = true;
        }
      }
    } catch (e2) {}
  }
  return song;
}

async function loadDownloads() {
  const localIds = getLocalDownloadedIds();
  try {
    const res = await fetch('/api/downloads');
    if (res.ok) {
      const data = await res.json();
      const srvIds = data.downloadedIds || [];
      state.serverDownloadedIds = new Set(srvIds);
      const combined = new Set([...srvIds, ...localIds]);
      state.downloadedIds = combined;
      saveLocalDownloadedIds(Array.from(combined));
      if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
      return;
    }
  } catch (e) {
    // Normal in standalone mobile APK mode
  }
  state.downloadedIds = new Set(localIds);
  if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
}

function markSongCardDownloadedUI(songId) {
  if (!songId) return;
  const card = document.querySelector(`.song-card[data-id="${songId}"]`);
  if (card) {
    const dlBtn = card.querySelector('.btn-dl-song');
    if (dlBtn) {
      dlBtn.classList.remove('downloading');
      dlBtn.classList.add('downloaded');
      dlBtn.title = 'Çevrimdışı İndirildi (Silmek için tıkla)';
    }
    const thumbWrap = card.querySelector('.card-thumb-wrapper');
    if (thumbWrap && !thumbWrap.querySelector('.offline-card-indicator')) {
      const badge = document.createElement('div');
      badge.className = 'offline-card-indicator';
      badge.title = 'Cihazda Kayıtlı (Çevrimdışı Dinlenebilir)';
      badge.textContent = '💾 İndirildi';
      thumbWrap.appendChild(badge);
    }
  }
  if (state.currentSong && state.currentSong.id === songId && elements.mfpDownloadLabel) {
    elements.mfpDownloadLabel.textContent = 'Cihazda Kayıtlı';
  }
}

async function triggerDownloadTrack(song, btn = null) {
  if (!song || !song.id) return;

  if (state.downloadedIds.has(song.id) && !String(song.id).startsWith('sp_')) {
    showToast(`"${song.title}" zaten cihazınızda kayıtlı.`);
    return;
  }

  if (btn) {
    btn.classList.add('downloading');
    btn.title = 'İndiriliyor...';
  }

  showToast(`"${song.title}" indiriliyor...`);

  await resolveTrackIfNeeded(song);
  saveSongToDownloadedMeta(song);

  try {
    const res = await fetch('/api/download/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song })
    });
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.resolvedId) {
        song.id = data.resolvedId;
        song.spotifyResolved = true;
        saveSongToDownloadedMeta(song);
      }
      if (data && data.success) {
        pollTrackDownload(song.id, btn, song);
        return;
      }
    }
  } catch (err) {
    // Fallback for standalone Mobile APK
  }

  // Standalone Mobile APK offline save
  setTimeout(() => {
    state.downloadedIds.add(song.id);
    saveLocalDownloadedIds(Array.from(state.downloadedIds));
    saveSongToDownloadedMeta(song);
    if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
    if (btn) {
      btn.classList.remove('downloading');
      btn.classList.add('downloaded');
      btn.title = 'Çevrimdışı İndirildi';
    }
    markSongCardDownloadedUI(song.id);
    showToast(`💾 "${song.title}" indirilenlere kaydedildi!`);
  }, 450);
}

function pollTrackDownload(songId, btn = null, songObj = null) {
  let attempts = 0;
  const pollInterval = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch('/api/downloads');
      const data = await res.json();
      const srvIds = data.downloadedIds || [];
      state.serverDownloadedIds = new Set(srvIds);
      const localIds = getLocalDownloadedIds();
      state.downloadedIds = new Set([...srvIds, ...localIds]);
      if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;

      if (state.downloadedIds.has(songId)) {
        clearInterval(pollInterval);
        saveLocalDownloadedIds(Array.from(state.downloadedIds));
        if (songObj) saveSongToDownloadedMeta(songObj);
        if (btn) {
          btn.classList.remove('downloading');
          btn.classList.add('downloaded');
          btn.title = 'Çevrimdışı İndirildi';
        }
        markSongCardDownloadedUI(songId);
        showToast('💾 Şarkı çevrimdışı dinlemek için indirildi!');
      } else if (attempts > 45) {
        clearInterval(pollInterval);
        if (btn) btn.classList.remove('downloading');
      }
    } catch (e) {
      clearInterval(pollInterval);
    }
  }, 1500);
}

let isBatchDownloadingList = false;

async function downloadAllSongsInList(songs, playlistId = null, btnElem = null) {
  if (!Array.isArray(songs) || songs.length === 0) {
    showToast('Bu listede indirilecek şarkı bulunamadı.');
    return;
  }

  if (isBatchDownloadingList) {
    showToast('Şu anda zaten toplu indirme işlemi devam ediyor.');
    return;
  }

  // Check how many songs are not yet downloaded
  const pendingSongs = songs.filter(s => s && (!state.downloadedIds.has(s.id) || String(s.id).startsWith('sp_')));
  if (pendingSongs.length === 0) {
    showToast('✅ Bu listedeki tüm şarkılar zaten indirilmiş!');
    if (btnElem) {
      btnElem.classList.add('completed');
      const span = btnElem.querySelector('span');
      if (span) span.textContent = 'Tüm Şarkılar İndirildi';
    }
    return;
  }

  isBatchDownloadingList = true;
  const totalCount = songs.length;

  const setBtnState = (text, isDone = false) => {
    if (!btnElem) return;
    const span = btnElem.querySelector('span');
    if (span) span.textContent = text;
    if (isDone) {
      btnElem.classList.remove('downloading');
      btnElem.classList.add('completed');
      btnElem.disabled = false;
    } else {
      btnElem.classList.add('downloading');
      btnElem.classList.remove('completed');
      btnElem.disabled = true;
    }
  };

  // Mark all cards as downloading visually
  pendingSongs.forEach(s => {
    if (!s || !s.id) return;
    const card = document.querySelector(`.song-card[data-id="${s.id}"]`);
    if (card) {
      const dlBtn = card.querySelector('.btn-dl-song');
      if (dlBtn && !dlBtn.classList.contains('downloaded')) {
        dlBtn.classList.add('downloading');
      }
    }
  });

  // Save metadata for all already-resolved songs immediately
  songs.forEach(s => {
    if (s && s.id && !String(s.id).startsWith('sp_')) {
      saveSongToDownloadedMeta(s);
    }
  });

  let usedServerBatch = false;
  const hasUnresolvedSpotify = songs.some(s => s && (!s.spotifyResolved && (s.spotifySearchQuery || String(s.id).startsWith('sp_'))));

  try {
    // First resolve any unresolved Spotify tracks so client & server share exact YouTube video IDs
    if (hasUnresolvedSpotify) {
      let resolvedSoFar = 0;
      for (let i = 0; i < songs.length; i++) {
        const s = songs[i];
        if (!s) continue;
        const oldId = s.id;
        setBtnState(`Hazırlanıyor (${i + 1}/${totalCount})...`, false);
        await resolveTrackIfNeeded(s);
        saveSongToDownloadedMeta(s);
        if (oldId !== s.id) {
          const card = document.querySelector(`.song-card[data-id="${oldId}"]`);
          if (card) card.dataset.id = s.id;
        }
        resolvedSoFar++;
      }
      saveLocalLibrary();
    }

    setBtnState(`İndiriliyor (0/${totalCount})...`, false);

    const res = await fetch('/api/download/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId, songs })
    });

    if (res && res.ok) {
      const data = await res.json();
      if (data && data.success) {
        usedServerBatch = true;
        showToast(`⬇️ Listedeki ${totalCount} şarkı indirilmeye başlandı...`);

        // Poll server progress until all songs are downloaded or timeout
        let pollTicks = 0;
        const maxTicks = Math.max(40, totalCount * 12);
        const batchTimer = setInterval(async () => {
          pollTicks++;
          await loadDownloads();

          let doneInList = 0;
          songs.forEach(s => {
            if (s && state.downloadedIds.has(s.id)) {
              doneInList++;
              saveSongToDownloadedMeta(s);
              markSongCardDownloadedUI(s.id);
            }
          });

          if (doneInList >= totalCount) {
            clearInterval(batchTimer);
            isBatchDownloadingList = false;
            setBtnState('Tüm Şarkılar İndirildi', true);
            showToast(`✅ Listedeki tüm şarkılar (${totalCount}/${totalCount}) başarıyla indirildi!`);
            renderSongs(state.currentPlaylist);
          } else {
            setBtnState(`İndiriliyor (${doneInList}/${totalCount})...`, false);
            if (pollTicks >= maxTicks) {
              clearInterval(batchTimer);
              isBatchDownloadingList = false;
              setBtnState(`İndirildi (${doneInList}/${totalCount})`, true);
              renderSongs(state.currentPlaylist);
            }
          }
        }, 1800);
        return;
      }
    }
  } catch (e) {
    // Server unreachable (e.g., standalone Mobile APK mode) -> proceed to client-side batch download
  }

  if (!usedServerBatch) {
    showToast(`⬇️ Listedeki ${totalCount} şarkı cihazınıza kaydediliyor...`);
    let doneCount = 0;
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      if (!s) continue;
      setBtnState(`İndiriliyor (${i + 1}/${totalCount})...`, false);
      const oldId = s.id;
      await resolveTrackIfNeeded(s);
      if (oldId !== s.id) {
        const card = document.querySelector(`.song-card[data-id="${oldId}"]`);
        if (card) card.dataset.id = s.id;
      }
      state.downloadedIds.add(s.id);
      saveSongToDownloadedMeta(s);
      markSongCardDownloadedUI(s.id);
      doneCount++;
      saveLocalDownloadedIds(Array.from(state.downloadedIds));
      if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
      await new Promise(r => setTimeout(r, 120));
    }
    saveLocalLibrary();
    isBatchDownloadingList = false;
    setBtnState('Tüm Şarkılar İndirildi', true);
    showToast(`✅ Listedeki ${doneCount} şarkı başarıyla indirildi!`);
    renderSongs(state.currentPlaylist);
  }
}

async function triggerDownloadPlaylist(playlistId) {
  const pl = state.library.playlists.find(p => p.id === playlistId);
  const songs = pl ? pl.songs : state.currentPlaylist;
  const btnElem = document.getElementById('btn-download-entire-playlist');
  await downloadAllSongsInList(songs, playlistId, btnElem);
}

async function deleteDownloadedTrack(songId) {
  try {
    await fetch(`/api/download/track/${songId}`, { method: 'DELETE' });
  } catch (e) {
    // Ignore in standalone mode
  }
  state.downloadedIds.delete(songId);
  if (state.serverDownloadedIds) state.serverDownloadedIds.delete(songId);
  saveLocalDownloadedIds(Array.from(state.downloadedIds));
  if (elements.downloadsCountBadge) elements.downloadsCountBadge.textContent = state.downloadedIds.size;
  showToast('Şarkı indirilenlerden kaldırıldı.');
  if (state.currentView === 'downloads') {
    openDownloadsView();
  } else {
    renderSongs(state.currentPlaylist);
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
          <img src="${song.thumbnail || 'https://via.placeholder.com/240x135'}" class="song-card-thumb" loading="lazy" decoding="async">
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
              <line x1="4" y1="6" x2="14" y2="6"></line>
              <line x1="4" y1="12" x2="14" y2="12"></line>
              <line x1="4" y1="18" x2="11" y2="18"></line>
              <polyline points="15 15 18 18 22 14"></polyline>
            </svg>
          </button>
          <button class="btn-icon-subtle btn-card-add-pl" title="Çalma Listesine Ekle">
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

    const addPlBtn = card.querySelector('.btn-card-add-pl');
    if (addPlBtn) {
      addPlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(song);
      });
    }

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

const RECOMMENDED_ARTISTS = [
  { name: 'Semicenk', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=260&h=260&fit=crop' },
  { name: 'Sezen Aksu', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=260&h=260&fit=crop' },
  { name: 'Duman', role: 'Grup', img: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=260&h=260&fit=crop' },
  { name: 'Lvbel C5', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=260&h=260&fit=crop' },
  { name: 'Manga', role: 'Grup', img: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=260&h=260&fit=crop' },
  { name: 'Mor ve Ötesi', role: 'Grup', img: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=260&h=260&fit=crop' },
  { name: 'Gülşen', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=260&h=260&fit=crop' },
  { name: 'Teoman', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=260&h=260&fit=crop' },
  { name: 'Tarkan', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=260&h=260&fit=crop' },
  { name: 'Simge', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?w=260&h=260&fit=crop' },
  { name: 'Melike Şahin', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=260&h=260&fit=crop' },
  { name: 'Dedublüman', role: 'Grup', img: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=260&h=260&fit=crop' },
  { name: 'Coldplay', role: 'Grup', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=260&h=260&fit=crop' },
  { name: 'The Weeknd', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=260&h=260&fit=crop' },
  { name: 'Billie Eilish', role: 'Sanatçı', img: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=260&h=260&fit=crop' }
];

function renderHomeSections() {
  if (!elements.homeCustomSections) return;
  if (state.currentView !== 'home') {
    elements.homeCustomSections.style.display = 'none';
    return;
  }

  elements.homeCustomSections.style.display = 'flex';

  // 1. Son Dinlenenler (History)
  if (elements.homeRecentSection && elements.homeRecentGrid) {
    const historySongs = state.library.history || [];
    if (historySongs.length > 0) {
      elements.homeRecentSection.style.display = 'flex';
      const recents = historySongs.slice(0, 6);
      elements.homeRecentGrid.innerHTML = recents.map((s, idx) => `
        <div class="recent-track-card" data-idx="${idx}">
          <img src="${s.thumbnail || 'https://via.placeholder.com/60'}" class="recent-track-thumb" alt="${escapeHtml(s.title)}" loading="lazy">
          <div class="recent-track-info">
            <div class="recent-track-title">${escapeHtml(s.title)}</div>
            <div class="recent-track-artist">${escapeHtml(s.channel)}</div>
          </div>
          <div class="recent-track-play">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>
      `).join('');

      elements.homeRecentGrid.querySelectorAll('.recent-track-card').forEach(card => {
        card.addEventListener('click', () => {
          const idx = parseInt(card.dataset.idx, 10);
          const s = recents[idx];
          if (s) playSong(s, recents, idx);
        });
      });
    } else {
      elements.homeRecentSection.style.display = 'none';
    }
  }

  // 2. Önerilen Sanatçılar (Spotify-style Circular Artist Cards)
  if (elements.homeArtistsRow && elements.homeArtistsRow.children.length === 0) {
    elements.homeArtistsRow.innerHTML = RECOMMENDED_ARTISTS.map(a => `
      <div class="artist-circle-card" data-artist="${escapeHtml(a.name)}">
        <div class="artist-avatar-wrap">
          <img src="${a.img}" class="artist-avatar-img" alt="${escapeHtml(a.name)}" loading="lazy">
          <div class="artist-hover-play">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>
        <div class="artist-name">${escapeHtml(a.name)}</div>
        <div class="artist-role">${a.role}</div>
      </div>
    `).join('');

    elements.homeArtistsRow.querySelectorAll('.artist-circle-card').forEach(card => {
      card.addEventListener('click', () => {
        const artist = card.dataset.artist;
        if (elements.searchInput) {
          elements.searchInput.value = artist;
          if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'block';
        }
        performSearch(artist);
      });
    });
  }
}

function updateCategoryChipsVisibility() {
  if (!elements.categoryChips) return;
  const isSearching = !!(elements.searchInput && elements.searchInput.value.trim().length > 0);
  const isExplore = (state.currentView === 'explore');

  // Chips strictly visible ONLY on Explore ("Trendler & Keşif") when not searching
  if (isExplore && !isSearching) {
    elements.categoryChips.style.display = 'flex';
  } else {
    elements.categoryChips.style.display = 'none';
  }
}

async function fetchExploreGenre(genreKey, forceRefresh = false) {
  if (state.currentView === 'home' || state.currentView === 'explore') {
    elements.sectionActions.innerHTML = `
      <button class="btn-refresh-trends" id="btn-refresh-explore-trends" title="En yeni şarkıları YouTube Music üzerinden anlık yenile">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>Trendleri Yenile</span>
      </button>
    `;
    const btnRef = document.getElementById('btn-refresh-explore-trends');
    if (btnRef) {
      btnRef.addEventListener('click', async () => {
        btnRef.classList.add('spinning');
        showToast('🔥 En yeni trendler YouTube Music üzerinden taranıyor...');
        await fetchExploreGenre(genreKey, true);
        showToast('✨ Trendler başarıyla güncellendi!');
      });
    }
  } else {
    elements.sectionActions.innerHTML = '';
  }

  elements.songsGrid.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.loadingState.style.display = 'flex';
  elements.loadingText.textContent = 'Müzikler yükleniyor...';

  if (state.currentView === 'home') {
    renderHomeSections();
  } else if (elements.homeCustomSections) {
    elements.homeCustomSections.style.display = 'none';
  }

  try {
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const data = await apiFetch(`/api/explore?genre=${encodeURIComponent(genreKey)}${refreshParam}`);
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
  if (elements.homeCustomSections) elements.homeCustomSections.style.display = 'none';
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
  const localLib = getStoredLibrary();
  try {
    const data = await apiFetch('/api/library');
    if (data && (data.favorites || data.playlists)) {
      const favMap = new Map();
      (data.favorites || []).forEach(s => { if (s && s.id) favMap.set(s.id, s); });
      (localLib.favorites || []).forEach(s => { if (s && s.id && !favMap.has(s.id)) favMap.set(s.id, s); });

      const plMap = new Map();
      (data.playlists || []).forEach(p => {
        if (!p) return;
        plMap.set(p.id || p.name, { ...p, songs: [...(p.songs || [])] });
      });
      (localLib.playlists || []).forEach(p => {
        if (!p) return;
        const key = p.id || p.name;
        if (plMap.has(key)) {
          const existing = plMap.get(key);
          const sMap = new Map();
          (existing.songs || []).forEach(s => { if (s && s.id) sMap.set(s.id, s); });
          (p.songs || []).forEach(s => { if (s && s.id) sMap.set(s.id, s); });
          existing.songs = Array.from(sMap.values());
        } else {
          plMap.set(key, { ...p, songs: [...(p.songs || [])] });
        }
      });

      const histMap = new Map();
      (localLib.history || []).forEach(s => { if (s && s.id) histMap.set(s.id, s); });
      (data.history || []).forEach(s => { if (s && s.id && !histMap.has(s.id)) histMap.set(s.id, s); });

      state.library = {
        favorites: Array.from(favMap.values()),
        playlists: Array.from(plMap.values()),
        history: Array.from(histMap.values()).slice(0, 50)
      };
      persistLibrary(state.library);
    } else {
      state.library = localLib;
    }
  } catch (e) {
    state.library = localLib;
  }

  // If signed in with Google, pull latest cloud library & merge
  if (state.user && state.user.email) {
    try {
      const cloudRes = await fetch(`/api/auth/google-sync?email=${encodeURIComponent(state.user.email)}`);
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        if (cloudData.success && cloudData.library) {
          const favMap = new Map();
          (state.library.favorites || []).forEach(s => favMap.set(s.id, s));
          (cloudData.library.favorites || []).forEach(s => favMap.set(s.id, s));
          state.library.favorites = Array.from(favMap.values());

          const plMap = new Map();
          (state.library.playlists || []).forEach(p => plMap.set(p.id || p.name, { ...p, songs: [...(p.songs || [])] }));
          (cloudData.library.playlists || []).forEach(p => {
            const key = p.id || p.name;
            if (plMap.has(key)) {
              const existing = plMap.get(key);
              const songMap = new Map();
              (existing.songs || []).forEach(s => songMap.set(s.id, s));
              (p.songs || []).forEach(s => songMap.set(s.id, s));
              existing.songs = Array.from(songMap.values());
              if (p.cover && !existing.cover) existing.cover = p.cover;
            } else {
              plMap.set(key, p);
            }
          });
          state.library.playlists = Array.from(plMap.values());

          const histMap = new Map();
          (state.library.history || []).forEach(s => histMap.set(s.id, s));
          (cloudData.library.history || []).forEach(s => {
            if (!histMap.has(s.id)) histMap.set(s.id, s);
          });
          state.library.history = Array.from(histMap.values()).slice(0, 100);

          persistLibrary(state.library);
        }
      }
    } catch (err) {}
  }

  elements.favCountBadge.textContent = (state.library.favorites || []).length;
  renderSidebarPlaylists();
}

// --- DISCORD RICH PRESENCE CLIENT ---
let discordState = {
  enabled: true,
  clientId: '',
  connected: false
};

async function loadDiscordConfig() {
  try {
    const data = await apiFetch('/api/discord/config');
    if (data) {
      discordState.enabled = data.enabled !== undefined ? data.enabled : true;
      discordState.clientId = data.clientId || '';
      discordState.connected = !!data.connected;
      updateDiscordUI();
    }
  } catch (e) {}
}

function updateDiscordUI() {
  if (elements.discordClientIdInput && !elements.discordClientIdInput.value) {
    elements.discordClientIdInput.value = discordState.clientId;
  }
  if (elements.discordEnableToggle) {
    elements.discordEnableToggle.checked = discordState.enabled;
  }

  if (elements.sidebarDiscordStatus) {
    if (discordState.connected) {
      elements.sidebarDiscordStatus.textContent = '🟢 Aktif';
      elements.sidebarDiscordStatus.classList.add('active');
    } else if (discordState.clientId && discordState.enabled) {
      elements.sidebarDiscordStatus.textContent = '🟡 Bağlanıyor';
      elements.sidebarDiscordStatus.classList.remove('active');
    } else {
      elements.sidebarDiscordStatus.textContent = 'Ayarla';
      elements.sidebarDiscordStatus.classList.remove('active');
    }
  }

  if (elements.discordModalStatusPill) {
    if (discordState.connected) {
      elements.discordModalStatusPill.textContent = "🟢 Discord'a Bağlandı";
      elements.discordModalStatusPill.classList.add('connected');
    } else if (discordState.clientId && discordState.enabled) {
      elements.discordModalStatusPill.textContent = '🟡 Bağlantı Bekleniyor...';
      elements.discordModalStatusPill.classList.remove('connected');
    } else {
      elements.discordModalStatusPill.textContent = '⚪ Bağlantı Bekleniyor';
      elements.discordModalStatusPill.classList.remove('connected');
    }
  }
}

let discordUpdateDebounce = null;
function syncDiscordPresence() {
  clearTimeout(discordUpdateDebounce);
  discordUpdateDebounce = setTimeout(async () => {
    if (!state.currentSong) {
      try {
        await apiFetch('/api/discord/activity', {
          method: 'POST',
          body: JSON.stringify({ isPlaying: false })
        });
      } catch (e) {}
      return;
    }

    let currentTime = 0;
    let duration = state.currentSong.durationSec || 0;

    if (state.isOfflinePlaying && localAudio) {
      currentTime = localAudio.currentTime || 0;
      if (!duration) duration = localAudio.duration || 0;
    } else if (ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      try {
        currentTime = ytPlayer.getCurrentTime() || 0;
        if (!duration) duration = ytPlayer.getDuration() || 0;
      } catch (e) {}
    }

    try {
      await apiFetch('/api/discord/activity', {
        method: 'POST',
        body: JSON.stringify({
          song: state.currentSong,
          isPlaying: state.isPlaying,
          currentTime,
          duration
        })
      });
    } catch (e) {}
  }, 250);
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

async function createNewPlaylist(name, description = '') {
  const cleanName = (name || '').trim();
  const cleanDesc = (description || '').trim();
  if (!cleanName) return null;

  let newPlaylist = null;
  try {
    const res = await fetch('/api/library/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, description: cleanDesc })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.playlist) {
        newPlaylist = data.playlist;
      }
    }
  } catch (e) {
    // Offline or Mobile APK standalone fallback
  }

  if (!newPlaylist) {
    newPlaylist = {
      id: 'pl_' + Date.now(),
      name: cleanName,
      description: cleanDesc,
      songs: []
    };
  }

  if (!state.library.playlists) state.library.playlists = [];
  if (!state.library.playlists.some(p => p.id === newPlaylist.id)) {
    state.library.playlists.push(newPlaylist);
  }
  persistLibrary(state.library);
  renderSidebarPlaylists();
  return newPlaylist;
}

async function deletePlaylist(plId) {
  const pl = (state.library.playlists || []).find(p => p.id === plId);
  if (!pl) return;
  if (!confirm(`"${pl.name}" çalma listesini silmek istediğinize emin misiniz?`)) return;

  state.library.playlists = (state.library.playlists || []).filter(p => p.id !== plId);
  persistLibrary(state.library);
  fetch(`/api/library/playlist/${encodeURIComponent(plId)}`, { method: 'DELETE' }).catch(() => {});

  renderSidebarPlaylists();
  showToast(`🗑️ "${pl.name}" çalma listesi silindi.`);
  if (state.currentView === 'playlist' && state.currentPlaylistId === plId) {
    navigateTo('home');
  }
}

function renderSidebarPlaylists() {
  if (!elements.sidebarPlaylists) return;
  const playlists = state.library.playlists || [];
  elements.sidebarPlaylists.innerHTML = playlists.map(pl => {
    const icon = pl.isSpotify ? '🟢' : ((pl.isYtMusic || pl.isYtm) ? '🔴' : '🎵');
    const isActive = (state.currentView === 'playlist' && state.currentPlaylistId === pl.id);
    const count = Array.isArray(pl.songs) ? pl.songs.length : 0;
    return `
      <div class="playlist-item ${isActive ? 'active' : ''}" data-id="${pl.id}">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${icon} ${escapeHtml(pl.name)}</span>
        <div class="playlist-item-right">
          <span class="badge">${count}</span>
          <button class="btn-del-playlist" data-delid="${pl.id}" title="Listeyi Sil">✕</button>
        </div>
      </div>
    `;
  }).join('');

  elements.sidebarPlaylists.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-playlist')) return;
      const plId = item.dataset.id;
      openPlaylistView(plId);
    });
  });

  elements.sidebarPlaylists.querySelectorAll('.btn-del-playlist').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePlaylist(btn.dataset.delid);
    });
  });
}

function renderListActionButtons(songs, playlistId = null, allowDelete = false, showDownloadAll = true) {
  if (!elements.sectionActions) return;
  const listSongs = Array.isArray(songs) ? songs : [];
  const allAlreadyDownloaded = listSongs.length > 0 && listSongs.every(s => s && state.downloadedIds.has(s.id) && !String(s.id).startsWith('sp_'));

  elements.sectionActions.innerHTML = `
    <button class="btn-playlist-action primary" id="btn-play-all-playlist" title="Listeyi Baştan Çal">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Tümünü Çal</span>
    </button>
    <button class="btn-playlist-action" id="btn-shuffle-play-playlist" title="Listeyi Karışık Çal">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 3 21 3 21 8"></polyline>
        <line x1="4" y1="20" x2="21" y2="3"></line>
        <polyline points="21 16 21 21 16 21"></polyline>
      </svg>
      <span>Karışık Çal</span>
    </button>
    ${showDownloadAll ? `
    <button class="btn-download-all ${allAlreadyDownloaded ? 'completed' : ''}" id="btn-download-entire-playlist" title="Listedeki Tüm Şarkıları Çevrimdışı İndir">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>${allAlreadyDownloaded ? 'Tüm Şarkılar İndirildi' : 'Tüm Şarkıları İndir'}</span>
    </button>
    ` : ''}
    ${allowDelete && playlistId ? `
    <button class="btn-playlist-action danger" id="btn-delete-current-playlist" title="Çalma Listesini Sil">
      <span>🗑️ Sil</span>
    </button>
    ` : ''}
  `;

  const btnPlayAll = document.getElementById('btn-play-all-playlist');
  if (btnPlayAll) {
    btnPlayAll.addEventListener('click', () => {
      if (listSongs.length > 0) {
        playSong(listSongs[0], listSongs, 0);
      } else {
        showToast('Bu listede henüz şarkı yok.');
      }
    });
  }

  const btnShufflePl = document.getElementById('btn-shuffle-play-playlist');
  if (btnShufflePl) {
    btnShufflePl.addEventListener('click', () => {
      if (listSongs.length > 0) {
        if (state.shuffleMode === 'off') {
          state.shuffleMode = 'standard';
          try { localStorage.setItem('muzikal_shuffle_mode', 'standard'); } catch (e) {}
          updateShuffleUI();
        }
        const randIdx = Math.floor(Math.random() * listSongs.length);
        playSong(listSongs[randIdx], listSongs, randIdx);
      } else {
        showToast('Bu listede henüz şarkı yok.');
      }
    });
  }

  const btnDlAll = document.getElementById('btn-download-entire-playlist');
  if (btnDlAll) {
    btnDlAll.addEventListener('click', () => {
      downloadAllSongsInList(listSongs, playlistId, btnDlAll);
    });
  }

  const btnDelPl = document.getElementById('btn-delete-current-playlist');
  if (btnDelPl && playlistId) {
    btnDelPl.addEventListener('click', () => {
      deletePlaylist(playlistId);
    });
  }
}

function openPlaylistView(plId) {
  const pl = (state.library.playlists || []).find(p => p.id === plId);
  if (!pl) return;
  if (!Array.isArray(pl.songs)) pl.songs = [];

  state.currentView = 'playlist';
  state.currentPlaylistId = plId;

  // Close mobile sidebar drawer when selecting a playlist
  if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
  elements.navItems.forEach(b => b.classList.remove('active'));
  renderSidebarPlaylists();

  if (elements.searchInput) elements.searchInput.value = '';
  if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';
  elements.heroBanner.style.display = 'none';
  if (elements.homeCustomSections) elements.homeCustomSections.style.display = 'none';
  updateCategoryChipsVisibility();
  elements.currentSectionTitle.textContent = pl.name;
  elements.currentSectionDesc.textContent = pl.description || `${pl.songs.length} şarkı`;

  renderListActionButtons(pl.songs, plId, true, true);

  state.currentPlaylist = pl.songs;
  renderSongs(pl.songs);
}

function openDownloadsView() {
  state.currentView = 'downloads';
  if (elements.searchInput) elements.searchInput.value = '';
  if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';
  elements.heroBanner.style.display = 'none';
  if (elements.homeCustomSections) elements.homeCustomSections.style.display = 'none';
  updateCategoryChipsVisibility();
  elements.currentSectionTitle.textContent = 'İndirilenler & Çevrimdışı Parçalar';
  elements.currentSectionDesc.textContent = `Cihazınızda kayıtlı ${state.downloadedIds.size} şarkı. İnternetsiz dinlenebilir.`;

  // Filter songs across library or construct from downloaded metadata / IDs
  const offlineSongs = [];
  const allKnownSongs = [
    ...state.library.favorites,
    ...state.library.history,
    ...(state.library.playlists.flatMap(p => p.songs || []))
  ];
  const savedMeta = getLocalDownloadedMeta();

  const seen = new Set();
  for (const id of state.downloadedIds) {
    if (seen.has(id)) continue;
    const found = allKnownSongs.find(s => s && s.id === id) || savedMeta[id];
    if (found) {
      seen.add(id);
      offlineSongs.push(found);
    } else {
      seen.add(id);
      offlineSongs.push({
        id: id,
        title: `İndirilen Parça (${id})`,
        channel: 'Çevrimdışı Ses',
        duration: '',
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      });
    }
  }

  renderListActionButtons(offlineSongs, null, false, false);
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

// --- YOUTUBE MUSIC PLAYLIST IMPORT HANDLER ---

async function handleYouTubeMusicImport() {
  const url = elements.modalYtmUrl ? elements.modalYtmUrl.value.trim() : '';
  if (!url) {
    showToast('Lütfen geçerli bir YouTube Music çalma listesi bağlantısı girin.');
    return;
  }

  if (elements.ytmBtnText) elements.ytmBtnText.textContent = 'Aktarılıyor...';
  if (elements.ytmSpinner) elements.ytmSpinner.style.display = 'inline-block';
  if (elements.btnImportYtmModal) elements.btnImportYtmModal.disabled = true;

  try {
    const res = await fetch('/api/ytmusic/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        email: state.user ? state.user.email : ''
      })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'İçe aktarma başarısız');
    }

    if (elements.ytmusicModal) elements.ytmusicModal.style.display = 'none';
    if (elements.modalYtmUrl) elements.modalYtmUrl.value = '';
    showToast(`🎉 "${data.playlist.name}" (${data.count} şarkı) başarıyla aktarıldı!`);

    await loadLibrary();
    if (data.playlist && data.playlist.id) {
      openPlaylistView(data.playlist.id);
    }
  } catch (err) {
    console.error('YouTube Music import error:', err);
    showToast(`Hata: ${err.message}`);
  } finally {
    if (elements.ytmBtnText) elements.ytmBtnText.textContent = 'Listeyi İçe Aktar';
    if (elements.ytmSpinner) elements.ytmSpinner.style.display = 'none';
    if (elements.btnImportYtmModal) elements.btnImportYtmModal.disabled = false;
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
  if (elements.contentScroll) elements.contentScroll.scrollTop = 0;

  if (view === 'home') {
    elements.heroBanner.style.display = 'flex';
    renderHomeSections();
    elements.sectionActions.innerHTML = '';
    elements.currentSectionTitle.textContent = 'Sana Özel Önerilen Parçalar';
    elements.currentSectionDesc.textContent = 'Günün en sevilen popüler hitleri';
    fetchExploreGenre('trendler');
  } else {
    if (elements.homeCustomSections) elements.homeCustomSections.style.display = 'none';
    if (view === 'explore') {
      elements.heroBanner.style.display = 'none';
      elements.sectionActions.innerHTML = '';
      elements.currentSectionTitle.textContent = '🔥 Trendler & Müzik Türleri';
      elements.currentSectionDesc.textContent = 'Kategorilere göre popüler şarkıları keşfedin';
      fetchExploreGenre(state.currentGenre);
    } else if (view === 'favorites') {
      elements.heroBanner.style.display = 'none';
      elements.currentSectionTitle.textContent = 'Beğenilen Şarkılar';
      elements.currentSectionDesc.textContent = `${state.library.favorites.length} favori parça`;
      state.currentPlaylist = state.library.favorites;
      renderListActionButtons(state.library.favorites, null, false, true);
      renderSongs(state.library.favorites);
    } else if (view === 'downloads') {
      openDownloadsView();
    } else if (view === 'history') {
      elements.heroBanner.style.display = 'none';
      elements.currentSectionTitle.textContent = 'Dinleme Geçmişi';
      elements.currentSectionDesc.textContent = 'En son dinlediğiniz şarkılar';
      state.currentPlaylist = state.library.history;
      renderListActionButtons(state.library.history, null, false, true);
      renderSongs(state.library.history);
    }
  }
}

function setupEventListeners() {
  // Home See All History Button
  if (elements.btnHomeSeeHistory) {
    elements.btnHomeSeeHistory.addEventListener('click', () => {
      navigateTo('history');
    });
  }

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
        if (btn.dataset.action === 'open-sidebar') {
          if (elements.sidebar) elements.sidebar.classList.toggle('mobile-open');
          if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.toggle('active');
          return;
        }
        if (btn.dataset.view) {
          navigateTo(btn.dataset.view);
        }
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

  // YouTube Music Modals triggers
  const openYtmModal = () => {
    if (elements.modalYtmUrl) elements.modalYtmUrl.value = '';
    if (elements.ytmusicModal) elements.ytmusicModal.style.display = 'flex';
    if (elements.modalYtmUrl) elements.modalYtmUrl.focus();
    if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
    if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
  };

  if (elements.btnOpenYtmModal) elements.btnOpenYtmModal.addEventListener('click', openYtmModal);
  if (elements.btnSidebarYtm) elements.btnSidebarYtm.addEventListener('click', openYtmModal);
  if (elements.btnHeroYtm) elements.btnHeroYtm.addEventListener('click', openYtmModal);

  // Discord Rich Presence Modal triggers
  const openDiscordModal = () => {
    loadDiscordConfig();
    if (elements.discordModal) elements.discordModal.style.display = 'flex';
    if (elements.discordClientIdInput) {
      elements.discordClientIdInput.value = discordState.clientId;
      elements.discordClientIdInput.focus();
    }
    if (elements.discordEnableToggle) {
      elements.discordEnableToggle.checked = discordState.enabled;
    }
    if (elements.sidebar) elements.sidebar.classList.remove('mobile-open');
    if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
  };

  if (elements.btnOpenDiscordModal) {
    elements.btnOpenDiscordModal.addEventListener('click', openDiscordModal);
  }

  if (elements.btnCloseDiscordModal) {
    elements.btnCloseDiscordModal.addEventListener('click', () => {
      if (elements.discordModal) elements.discordModal.style.display = 'none';
    });
  }

  if (elements.btnCancelDiscordModal) {
    elements.btnCancelDiscordModal.addEventListener('click', () => {
      if (elements.discordModal) elements.discordModal.style.display = 'none';
    });
  }

  if (elements.discordModal) {
    elements.discordModal.addEventListener('click', (e) => {
      if (e.target === elements.discordModal) {
        elements.discordModal.style.display = 'none';
      }
    });
  }

  if (elements.btnSaveDiscordConfig) {
    elements.btnSaveDiscordConfig.addEventListener('click', async () => {
      const clientId = elements.discordClientIdInput ? elements.discordClientIdInput.value.trim() : '';
      const enabled = elements.discordEnableToggle ? elements.discordEnableToggle.checked : true;

      if (enabled && !clientId) {
        showToast('Lütfen Discord Application ID girin.');
        return;
      }

      try {
        const res = await apiFetch('/api/discord/config', {
          method: 'POST',
          body: JSON.stringify({ clientId, enabled })
        });
        if (res) {
          discordState.clientId = res.clientId || clientId;
          discordState.enabled = res.enabled !== undefined ? res.enabled : enabled;
          discordState.connected = !!res.connected;
          updateDiscordUI();
          showToast('✅ Discord Rich Presence ayarları kaydedildi!');
          syncDiscordPresence();
          setTimeout(loadDiscordConfig, 1200);
        }
      } catch (err) {
        showToast('Ayarlar kaydedilirken hata oluştu.');
      }
    });
  }

  // Mobile Full-Screen Player Open / Close
  if (elements.playerTrackInfo) {
    elements.playerTrackInfo.addEventListener('click', (e) => {
      if (e.target.closest('#player-fav-btn') || e.target.closest('#player-add-pl-btn')) return;
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

  // Swipe-down gesture to collapse Mobile Full Player
  if (elements.mobileFullPlayer) {
    let mfpTouchStartY = 0;
    let mfpTouchCurrentY = 0;
    elements.mobileFullPlayer.addEventListener('touchstart', (e) => {
      if (e.target.closest('.mfp-progress-track') || e.target.closest('button')) return;
      mfpTouchStartY = e.touches[0].clientY;
      mfpTouchCurrentY = mfpTouchStartY;
    }, { passive: true });
    elements.mobileFullPlayer.addEventListener('touchmove', (e) => {
      if (!mfpTouchStartY) return;
      mfpTouchCurrentY = e.touches[0].clientY;
    }, { passive: true });
    elements.mobileFullPlayer.addEventListener('touchend', () => {
      if (mfpTouchStartY && (mfpTouchCurrentY - mfpTouchStartY) > 90) {
        elements.mobileFullPlayer.classList.remove('open');
      }
      mfpTouchStartY = 0;
      mfpTouchCurrentY = 0;
    }, { passive: true });
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
  if (elements.mfpBtnAddPl) {
    elements.mfpBtnAddPl.addEventListener('click', () => {
      if (state.currentSong) {
        openAddToPlaylistModal(state.currentSong);
      } else {
        showToast('Şu anda çalan bir şarkı yok');
      }
    });
  }
  if (elements.mfpProgressTrack) {
    elements.mfpProgressTrack.addEventListener('click', (e) => {
      seekToTrack(elements.mfpProgressTrack, e);
    });
    let isDraggingMfpProgress = false;
    elements.mfpProgressTrack.addEventListener('touchstart', (e) => {
      isDraggingMfpProgress = true;
      seekToTrack(elements.mfpProgressTrack, e);
    }, { passive: true });
    elements.mfpProgressTrack.addEventListener('touchmove', (e) => {
      if (isDraggingMfpProgress) seekToTrack(elements.mfpProgressTrack, e);
    }, { passive: true });
    elements.mfpProgressTrack.addEventListener('touchend', () => {
      isDraggingMfpProgress = false;
    }, { passive: true });
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

  if (elements.btnCancelYtmModal) {
    elements.btnCancelYtmModal.addEventListener('click', () => {
      if (elements.ytmusicModal) elements.ytmusicModal.style.display = 'none';
    });
  }

  if (elements.ytmusicModal) {
    elements.ytmusicModal.addEventListener('click', (e) => {
      if (e.target === elements.ytmusicModal) {
        elements.ytmusicModal.style.display = 'none';
      }
    });
  }

  if (elements.btnImportYtmModal) {
    elements.btnImportYtmModal.addEventListener('click', handleYouTubeMusicImport);
  }
  if (elements.modalYtmUrl) {
    elements.modalYtmUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleYouTubeMusicImport();
    });
  }

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

  elements.btnRepeat.addEventListener('click', cycleRepeatMode);

  elements.progressBarTrack.addEventListener('click', seekTo);
  let isDraggingProgress = false;
  elements.progressBarTrack.addEventListener('mousedown', (e) => {
    isDraggingProgress = true;
    seekTo(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isDraggingProgress) seekTo(e);
  });
  window.addEventListener('mouseup', () => {
    isDraggingProgress = false;
  });

  // Volume
  const updateVolFromEvent = (e) => {
    const rect = elements.volumeSliderTrack.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = getEventClientX(e);
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = (clickX / rect.width) * 100;
    setVolume(pct);
  };
  elements.volumeSliderTrack.addEventListener('click', updateVolFromEvent);
  let isDraggingVolume = false;
  elements.volumeSliderTrack.addEventListener('mousedown', (e) => {
    isDraggingVolume = true;
    updateVolFromEvent(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isDraggingVolume) updateVolFromEvent(e);
  });
  window.addEventListener('mouseup', () => {
    isDraggingVolume = false;
  });

  elements.btnVolumeIcon.addEventListener('click', toggleMute);

  // Like button on player
  elements.playerFavBtn.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong);
  });

  // Lyrics toggle
  const toggleLyrics = () => {
    state.isLyricsOpen = !state.isLyricsOpen;
    if (elements.lyricsOverlay) {
      elements.lyricsOverlay.classList.toggle('active', state.isLyricsOpen);
    }
    if (elements.btnLyrics) {
      elements.btnLyrics.classList.toggle('active-accent', state.isLyricsOpen);
    }
    if (elements.mfpBtnLyrics) {
      elements.mfpBtnLyrics.classList.toggle('active-accent', state.isLyricsOpen);
    }
    if (state.isLyricsOpen && state.currentSong) {
      renderLyricsForCurrentSong();
    }
  };

  if (elements.btnLyrics) elements.btnLyrics.addEventListener('click', toggleLyrics);
  if (elements.mfpBtnLyrics) elements.mfpBtnLyrics.addEventListener('click', toggleLyrics);
  if (elements.btnCloseLyrics) {
    elements.btnCloseLyrics.addEventListener('click', () => {
      state.isLyricsOpen = false;
      if (elements.lyricsOverlay) elements.lyricsOverlay.classList.remove('active');
      if (elements.btnLyrics) elements.btnLyrics.classList.remove('active-accent');
      if (elements.mfpBtnLyrics) elements.mfpBtnLyrics.classList.remove('active-accent');
    });
  }

  // Queue drawer toggle
  elements.btnOpenQueue.addEventListener('click', () => {
    elements.queueDrawer.classList.toggle('open');
    elements.btnOpenQueue.classList.toggle('active');
    updateQueueDrawer();
  });
  if (elements.btnQueueToggle) {
    elements.btnQueueToggle.addEventListener('click', () => {
      elements.queueDrawer.classList.toggle('open');
      updateQueueDrawer();
    });
  }
  elements.btnCloseQueue.addEventListener('click', () => {
    elements.queueDrawer.classList.remove('open');
    elements.btnOpenQueue.classList.remove('active');
  });
  elements.btnClearQueue.addEventListener('click', () => {
    state.queue = [];
    elements.queueBadge.textContent = 0;
    updateQueueDrawer();
  });

  // Queue Spoiler Toggle (Surprise Mode)
  if (elements.btnToggleQueueSpoiler) {
    elements.btnToggleQueueSpoiler.addEventListener('click', () => {
      state.hideUpcomingQueue = !state.hideUpcomingQueue;
      localStorage.setItem('muzikal_hide_upcoming_queue', state.hideUpcomingQueue ? 'true' : 'false');
      localStorage.setItem('muzikal_hide_queue', state.hideUpcomingQueue ? '1' : '0');
      updateQueueDrawer();
    });
  }
  if (elements.btnRevealQueue) {
    elements.btnRevealQueue.addEventListener('click', () => {
      state.hideUpcomingQueue = false;
      localStorage.setItem('muzikal_hide_upcoming_queue', 'false');
      localStorage.setItem('muzikal_hide_queue', '0');
      updateQueueDrawer();
    });
  }

  // Queue Quick Search & Add
  let queueSearchDebounce = null;
  if (elements.queueQuickSearchInput) {
    elements.queueQuickSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (elements.btnClearQueueSearch) {
        elements.btnClearQueueSearch.style.display = q ? 'block' : 'none';
      }
      clearTimeout(queueSearchDebounce);
      if (!q) {
        if (elements.queueQuickSearchDropdown) elements.queueQuickSearchDropdown.style.display = 'none';
        return;
      }
      queueSearchDebounce = setTimeout(async () => {
        try {
          const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
          const results = data && data.results ? data.results : (Array.isArray(data) ? data : []);
          if (results.length > 0 && elements.queueQuickSearchDropdown) {
            elements.queueQuickSearchDropdown.innerHTML = results.slice(0, 5).map(s => `
              <div class="queue-quick-search-item" data-song='${JSON.stringify(s).replace(/'/g, "&apos;")}'>
                <img src="${escapeHtml(s.thumbnail || '')}" alt="${escapeHtml(s.title)}" />
                <div class="info">
                  <div class="title">${escapeHtml(s.title)}</div>
                  <div class="artist">${escapeHtml(s.artist || s.channel || '')}</div>
                </div>
                <button class="btn-quick-add" title="Sıraya Ekle">➕</button>
              </div>
            `).join('');
            elements.queueQuickSearchDropdown.style.display = 'block';

            elements.queueQuickSearchDropdown.querySelectorAll('.queue-quick-search-item').forEach(item => {
              item.addEventListener('click', () => {
                const song = JSON.parse(item.dataset.song);
                addToQueue(song);
                elements.queueQuickSearchInput.value = '';
                if (elements.btnClearQueueSearch) elements.btnClearQueueSearch.style.display = 'none';
                elements.queueQuickSearchDropdown.style.display = 'none';
              });
            });
          } else if (elements.queueQuickSearchDropdown) {
            elements.queueQuickSearchDropdown.style.display = 'none';
          }
        } catch (err) {
          console.error('Queue quick search error:', err);
        }
      }, 350);
    });
  }

  if (elements.btnClearQueueSearch) {
    elements.btnClearQueueSearch.addEventListener('click', () => {
      if (elements.queueQuickSearchInput) elements.queueQuickSearchInput.value = '';
      elements.btnClearQueueSearch.style.display = 'none';
      if (elements.queueQuickSearchDropdown) elements.queueQuickSearchDropdown.style.display = 'none';
    });
  }

  // Close queue quick search dropdown if clicking outside
  document.addEventListener('click', (e) => {
    if (elements.queueQuickSearchDropdown && !e.target.closest('#queue-drawer')) {
      elements.queueQuickSearchDropdown.style.display = 'none';
    }
  });

  // Player Add to Playlist Button
  if (elements.playerAddPlBtn) {
    elements.playerAddPlBtn.addEventListener('click', () => {
      if (state.currentSong) {
        openAddToPlaylistModal(state.currentSong);
      } else {
        showToast('Şu anda çalan bir şarkı yok');
      }
    });
  }

  // Video mode toggle
  elements.btnToggleVideo.addEventListener('click', () => {
    state.isVideoVisible = !state.isVideoVisible;
    elements.videoContainer.classList.toggle('active', state.isVideoVisible);
    elements.btnToggleVideo.classList.toggle('active', state.isVideoVisible);
    elements.btnVideoText.textContent = state.isVideoVisible ? 'Klibi Gizle' : 'Klip Modu';
    if (ytPlayer && typeof ytPlayer.setPlaybackQuality === 'function') {
      try { ytPlayer.setPlaybackQuality(state.isVideoVisible ? 'default' : 'small'); } catch (e) {}
    }
  });
  elements.btnCloseVideo.addEventListener('click', () => {
    state.isVideoVisible = false;
    elements.videoContainer.classList.remove('active');
    elements.btnToggleVideo.classList.remove('active');
    elements.btnVideoText.textContent = 'Klip Modu';
    if (ytPlayer && typeof ytPlayer.setPlaybackQuality === 'function') {
      try { ytPlayer.setPlaybackQuality('small'); } catch (e) {}
    }
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
    const pl = await createNewPlaylist(name, elements.modalPlDesc.value.trim());
    if (pl) {
      elements.playlistModal.style.display = 'none';
      showToast(`"${name}" çalma listesi oluşturuldu.`);
    }
  });

  // Sidebar Create Playlist Button ("+ Yeni Çalma Listesi")
  if (elements.btnSidebarCreatePlaylist) {
    elements.btnSidebarCreatePlaylist.addEventListener('click', () => {
      elements.modalPlName.value = '';
      elements.modalPlDesc.value = '';
      elements.playlistModal.style.display = 'flex';
      elements.modalPlName.focus();
    });
  }

  // Add to Playlist Modal Events
  if (elements.btnCloseAddPlModal) {
    elements.btnCloseAddPlModal.addEventListener('click', () => {
      if (elements.addToPlaylistModal) elements.addToPlaylistModal.style.display = 'none';
      state.selectedSongForPlaylist = null;
    });
  }

  if (elements.addToPlaylistModal) {
    elements.addToPlaylistModal.addEventListener('click', (e) => {
      if (e.target === elements.addToPlaylistModal) {
        elements.addToPlaylistModal.style.display = 'none';
        state.selectedSongForPlaylist = null;
      }
    });
  }

  if (elements.btnAddPlCreateAndAdd) {
    elements.btnAddPlCreateAndAdd.addEventListener('click', async () => {
      const name = elements.inputAddPlNewName ? elements.inputAddPlNewName.value.trim() : '';
      if (!name) {
        showToast('Lütfen bir çalma listesi adı girin');
        return;
      }
      const newPl = await createNewPlaylist(name, '');
      if (newPl) {
        if (elements.inputAddPlNewName) elements.inputAddPlNewName.value = '';
        if (state.selectedSongForPlaylist) {
          const pl = state.library.playlists.find(p => p.id === newPl.id);
          if (pl) {
            if (!pl.songs) pl.songs = [];
            pl.songs.push(state.selectedSongForPlaylist);
            await persistLibrary(state.library);
            renderSidebarPlaylists();
          }
          renderAddToPlaylistItems();
          showToast(`"${newPl.name}" oluşturuldu ve şarkı eklendi! ✨`);
        } else {
          showToast(`"${newPl.name}" oluşturuldu!`);
        }
      }
    });
  }

  if (elements.inputAddPlNewName) {
    elements.inputAddPlNewName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (elements.btnAddPlCreateAndAdd) elements.btnAddPlCreateAndAdd.click();
      }
    });
  }

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

  const btnStartInAppUpdate = document.getElementById('btn-start-inapp-update');
  if (btnStartInAppUpdate) {
    btnStartInAppUpdate.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetUrl = btnStartInAppUpdate.getAttribute('data-url') || 'https://github.com/KaranlikPasa/M-zikal/releases/latest';
      const isAndroid = (window.MuzikalNative && typeof window.MuzikalNative.isNative === 'function') ||
                        navigator.userAgent.toLowerCase().includes('android');

      const progressContainer = document.getElementById('update-progress-container');
      const progressFill = document.getElementById('update-progress-fill');
      const progressPercent = document.getElementById('update-progress-percent');
      const progressStatus = document.getElementById('update-progress-status');
      const btnDismiss = document.getElementById('btn-dismiss-update');

      if (progressContainer) progressContainer.style.display = 'block';
      if (progressFill) progressFill.style.width = '3%';
      if (progressPercent) progressPercent.textContent = '3%';
      if (progressStatus) progressStatus.textContent = 'Güncelleme başlatılıyor...';

      btnStartInAppUpdate.disabled = true;
      if (btnDismiss) btnDismiss.style.display = 'none';
      btnStartInAppUpdate.innerHTML = '<div class="spinner-sm" style="display:inline-block; margin-right:6px;"></div><span>Güncelleniyor...</span>';

      // 1. Android Native In-App Update
      if (window.MuzikalNative && typeof window.MuzikalNative.startDirectUpdate === 'function') {
        window.onUpdateDownloadProgress = function(percent, statusText) {
          if (progressFill) progressFill.style.width = percent + '%';
          if (progressPercent) progressPercent.textContent = percent + '%';
          if (progressStatus) progressStatus.textContent = statusText || (`İndiriliyor: %${percent}`);
          if (percent >= 100) {
            if (progressStatus) progressStatus.textContent = 'APK indirildi! Paket yükleyici açılıyor...';
          }
        };

        window.onUpdateDownloadError = function(errMsg) {
          if (progressStatus) progressStatus.textContent = 'Hata: ' + errMsg;
          showToast('Güncelleme hatası: ' + errMsg);
          btnStartInAppUpdate.disabled = false;
          btnStartInAppUpdate.innerHTML = '<span>Tekrar Dene</span>';
          if (btnDismiss) btnDismiss.style.display = 'inline-block';
        };

        window.MuzikalNative.startDirectUpdate(targetUrl);
        return;
      }

      // 2. Android Browser (Fallback to direct APK download link)
      if (isAndroid) {
        showToast('APK doğrudan indiriliyor...');
        window.location.href = targetUrl;
        setTimeout(() => {
          btnStartInAppUpdate.disabled = false;
          btnStartInAppUpdate.innerHTML = '<span>Doğrudan Uygulamada Güncelle</span>';
          if (btnDismiss) btnDismiss.style.display = 'inline-block';
        }, 3000);
        return;
      }

      // 3. PC (Windows) In-App Hot Update
      try {
        const resp = await fetch('/api/update/in-app-apply', { method: 'POST' });
        const data = await resp.json();
        if (!data.success && data.message) {
          showToast(data.message);
        }
      } catch (err) {
        console.warn('In-app apply request error:', err);
      }

      // Poll progress every 300ms
      const pollInterval = setInterval(async () => {
        try {
          const pRes = await fetch('/api/update/progress');
          if (!pRes.ok) return;
          const progress = await pRes.json();

          if (progressFill) progressFill.style.width = (progress.percent || 0) + '%';
          if (progressPercent) progressPercent.textContent = (progress.percent || 0) + '%';
          if (progressStatus) progressStatus.textContent = progress.status || 'Güncelleniyor...';

          if (progress.error) {
            clearInterval(pollInterval);
            showToast('Güncelleme hatası: ' + progress.error);
            btnStartInAppUpdate.disabled = false;
            btnStartInAppUpdate.innerHTML = '<span>Tekrar Dene</span>';
            if (btnDismiss) btnDismiss.style.display = 'inline-block';
            return;
          }

          if (progress.done) {
            clearInterval(pollInterval);
            if (progressFill) progressFill.style.width = '100%';
            if (progressPercent) progressPercent.textContent = '100%';
            if (progressStatus) progressStatus.textContent = 'Güncelleme başarıyla tamamlandı! Yeniden başlatılıyor...';
            showToast('🎉 Güncelleme tamamlandı! Sayfa yenileniyor...');

            setTimeout(async () => {
              try {
                await fetch('/api/update/restart', { method: 'POST' });
              } catch (e) {}
              setTimeout(() => {
                window.location.href = window.location.origin + window.location.pathname + '?t=' + Date.now();
              }, 1200);
            }, 1500);
          }
        } catch (e) {
          // Ignore network blips during restart
        }
      }, 300);
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

// --- SPOTIFY-STYLE LYRICS LOGIC ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function parseLrc(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\](.*)/;

  for (const line of lines) {
    const match = timeRegex.exec(line.trim());
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) {
        result.push({ time: (min * 60) + sec, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

async function fetchLyricsForSong(song) {
  if (!song) return;
  state.lyrics = null;
  state.syncedLyrics = [];
  state.currentLyricIndex = -1;

  if (state.isLyricsOpen) {
    showLyricsLoading();
  }

  try {
    const cleanTitle = song.title || '';
    const cleanArtist = song.channel || '';
    const res = await apiFetch(`/api/lyrics?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`);

    if (res && res.success) {
      state.lyrics = res;
      if (res.syncedLyrics) {
        state.syncedLyrics = parseLrc(res.syncedLyrics);
      }
    } else {
      state.lyrics = null;
      state.syncedLyrics = [];
    }
  } catch (err) {
    state.lyrics = null;
    state.syncedLyrics = [];
  }

  if (state.isLyricsOpen) {
    renderLyricsForCurrentSong();
  }
}

function showLyricsLoading() {
  if (!elements.lyricsOverlay) return;
  elements.lyricsTitle.textContent = state.currentSong ? state.currentSong.title : 'Şarkı Sözleri';
  elements.lyricsArtist.textContent = state.currentSong ? state.currentSong.channel : '';
  elements.lyricsLines.innerHTML = '';
  elements.lyricsEmpty.style.display = 'none';
  elements.lyricsLoading.style.display = 'flex';
}

function renderLyricsForCurrentSong() {
  if (!elements.lyricsOverlay || !state.currentSong) return;

  elements.lyricsTitle.textContent = state.currentSong.title;
  elements.lyricsArtist.textContent = state.currentSong.channel;
  elements.lyricsLoading.style.display = 'none';

  if (!state.lyrics) {
    elements.lyricsBadge.textContent = 'Şarkı Sözü';
    elements.lyricsLines.innerHTML = '';
    elements.lyricsEmpty.style.display = 'flex';
    return;
  }

  elements.lyricsEmpty.style.display = 'none';

  if (state.syncedLyrics && state.syncedLyrics.length > 0) {
    elements.lyricsBadge.textContent = 'Canlı Senkronize';
    elements.lyricsLines.innerHTML = state.syncedLyrics.map((l, i) => `
      <div class="lyric-line" data-index="${i}" data-time="${l.time}">
        ${escapeHtml(l.text)}
      </div>
    `).join('');

    elements.lyricsLines.querySelectorAll('.lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.dataset.time);
        if (!isNaN(time)) {
          if (state.isOfflinePlaying) {
            localAudio.currentTime = time;
          } else if (ytReady && ytPlayer && ytPlayer.seekTo) {
            ytPlayer.seekTo(time, true);
          }
          syncLyricsWithTime(time, true);
        }
      });
    });

    const currentTime = state.isOfflinePlaying
      ? (localAudio.currentTime || 0)
      : ((ytReady && ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0);
    syncLyricsWithTime(currentTime, true);
  } else if (state.lyrics.plainLyrics) {
    elements.lyricsBadge.textContent = 'Şarkı Sözleri';
    const lines = state.lyrics.plainLyrics.split('\n');
    elements.lyricsLines.innerHTML = lines.map(line => {
      const trimmed = line.trim();
      return trimmed ? `<div class="lyric-line past">${escapeHtml(trimmed)}</div>` : '<br/>';
    }).join('');
  } else {
    elements.lyricsEmpty.style.display = 'flex';
  }
}

function syncLyricsWithTime(currentTime, forceScroll = false) {
  if (!state.isLyricsOpen || !state.syncedLyrics || state.syncedLyrics.length === 0) return;

  let activeIdx = -1;
  for (let i = 0; i < state.syncedLyrics.length; i++) {
    if (state.syncedLyrics[i].time <= currentTime + 0.25) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx !== state.currentLyricIndex || forceScroll) {
    state.currentLyricIndex = activeIdx;
    const allLines = elements.lyricsLines.querySelectorAll('.lyric-line');

    allLines.forEach((lineEl, i) => {
      if (i === activeIdx) {
        lineEl.classList.add('active');
        lineEl.classList.remove('past');
        if (state.isLyricsOpen) {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (i < activeIdx) {
        lineEl.classList.remove('active');
        lineEl.classList.add('past');
      } else {
        lineEl.classList.remove('active', 'past');
      }
    });
  }
}

// --- AUTOMATIC & ON-DEMAND UPDATE CHECKER ---
let CURRENT_APP_VERSION = '1.4.4';
let lastAutoCheckTime = 0;

async function checkForAppUpdates(isManual = false) {
  // Sync current version dynamically with backend if available
  try {
    const vRes = await fetch('/api/version');
    if (vRes.ok) {
      const vData = await vRes.json();
      if (vData && vData.version && compareSemver(vData.version, CURRENT_APP_VERSION) >= 0) {
        CURRENT_APP_VERSION = vData.version;
      }
      const sidebarVer = document.getElementById('sidebar-app-ver');
      if (sidebarVer) sidebarVer.textContent = 'v' + CURRENT_APP_VERSION;
    }
  } catch (e) {}

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
      const isAndroid = (window.MuzikalNative && typeof window.MuzikalNative.isNative === 'function') ||
                        navigator.userAgent.toLowerCase().includes('android');

      let downloadUrl = release.html_url || 'https://github.com/KaranlikPasa/M-zikal/releases/latest';
      if (isAndroid) {
        const apkAsset = release.assets && release.assets.find(a => a.name.endsWith('.apk'));
        if (apkAsset) downloadUrl = apkAsset.browser_download_url;
      } else {
        const zipAsset = release.assets && (
          release.assets.find(a => a.name.toLowerCase().endsWith('-windows-x64.zip')) ||
          release.assets.find(a => a.name.toLowerCase().endsWith('.zip')) ||
          release.assets.find(a => a.name.toLowerCase().endsWith('setup.exe') || a.name.endsWith('.exe'))
        );
        if (zipAsset) downloadUrl = zipAsset.browser_download_url;
      }

      const titleElem = document.getElementById('update-title');
      const verElem = document.getElementById('update-version-text');
      const notesElem = document.getElementById('update-notes-box');
      const startInAppBtn = document.getElementById('btn-start-inapp-update');
      const manualLink = document.getElementById('btn-manual-download-link');
      const progressContainer = document.getElementById('update-progress-container');
      const btnDismiss = document.getElementById('btn-dismiss-update');
      const modal = document.getElementById('update-modal');

      if (titleElem) titleElem.textContent = release.name || 'Yeni Güncelleme Mevcut!';
      if (verElem) verElem.textContent = `Mevcut: v${CURRENT_APP_VERSION} ➔ Yeni: v${remoteTag}`;
      if (notesElem && release.body) notesElem.textContent = release.body;
      if (startInAppBtn) {
        startInAppBtn.setAttribute('data-url', downloadUrl);
        startInAppBtn.disabled = false;
        startInAppBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
          <span>Doğrudan Uygulamada Güncelle</span>
        `;
      }
      if (manualLink) {
        manualLink.href = release.html_url || 'https://github.com/KaranlikPasa/M-zikal/releases/latest';
      }
      if (progressContainer) progressContainer.style.display = 'none';
      if (btnDismiss) btnDismiss.style.display = 'inline-block';
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

// --- FIREBASE CLOUD ACCOUNT & PROFILE MANAGEMENT (muzikal-a1064) ---
const FIREBASE_DB_URL = 'https://muzikal-a1064-default-rtdb.firebaseio.com';
let currentAuthMode = 'login'; // 'login' | 'register'
let firebaseSyncTimer = null;

function toFirebaseUserKey(identifier) {
  if (!identifier) return '';
  return identifier
    .trim()
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_-]/g, '_');
}

// Pure-JS SHA-256 so hashing works identically on Android WebView, localhost, and LAN HTTP
function sha256Hex(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words = [];
  const utf8 = unescape(encodeURIComponent(ascii));
  const asciiBitLength = utf8.length * 8;
  let hash = sha256Hex.h = sha256Hex.h || [];
  const k = sha256Hex.k = sha256Hex.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  let str = utf8 + '\x80';
  while ((str.length % 64) - 56) str += '\x00';
  for (let i = 0; i < str.length; i++) {
    const j = str.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

function hashAccountPassword(password, userKey) {
  return sha256Hex(`muzikal_cloud_v1:${userKey}:${password}`);
}

async function firebaseGetUser(userKey) {
  if (!userKey) return null;
  const res = await fetch(`${FIREBASE_DB_URL}/users/${encodeURIComponent(userKey)}.json`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`);
  return await res.json();
}

async function firebasePutUser(userKey, record) {
  if (!userKey) return null;
  const res = await fetch(`${FIREBASE_DB_URL}/users/${encodeURIComponent(userKey)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`);
  return await res.json();
}

async function firebaseSaveLibrary(userKey, library) {
  if (!userKey) return;
  const cleanLib = {
    favorites: (library && library.favorites) || [],
    playlists: (library && library.playlists) || [],
    history: ((library && library.history) || []).slice(0, 50)
  };
  await fetch(`${FIREBASE_DB_URL}/users/${encodeURIComponent(userKey)}/library.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanLib)
  });
  const now = Date.now();
  await fetch(`${FIREBASE_DB_URL}/users/${encodeURIComponent(userKey)}/user/lastSync.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(now)
  });
  if (state.user) {
    state.user.lastSync = now;
    localStorage.setItem('muzikal_user', JSON.stringify(state.user));
  }
}

function scheduleFirebaseCloudSync(lib) {
  if (!state.user || (!state.user.userKey && !state.user.email)) return;
  if (firebaseSyncTimer) clearTimeout(firebaseSyncTimer);
  firebaseSyncTimer = setTimeout(() => {
    const userKey = state.user.userKey || toFirebaseUserKey(state.user.email);
    firebaseSaveLibrary(userKey, lib || state.library).catch(e => {
      console.warn('Auto Firebase sync warning:', e);
    });
  }, 600);
}

function mergeLibraries(baseLib, incomingLib) {
  const b = baseLib || { favorites: [], playlists: [], history: [] };
  const inc = incomingLib || { favorites: [], playlists: [], history: [] };

  const favMap = new Map();
  (inc.favorites || []).forEach(s => { if (s && s.id) favMap.set(s.id, s); });
  (b.favorites || []).forEach(s => { if (s && s.id) favMap.set(s.id, s); });

  const plMap = new Map();
  (inc.playlists || []).forEach(p => {
    if (!p) return;
    const key = p.id || p.name;
    plMap.set(key, { ...p, songs: [...(p.songs || [])] });
  });
  (b.playlists || []).forEach(p => {
    if (!p) return;
    const key = p.id || p.name;
    if (plMap.has(key)) {
      const existing = plMap.get(key);
      const songMap = new Map();
      (existing.songs || []).forEach(s => { if (s && s.id) songMap.set(s.id, s); });
      (p.songs || []).forEach(s => { if (s && s.id) songMap.set(s.id, s); });
      existing.songs = Array.from(songMap.values());
      if (p.cover && !existing.cover) existing.cover = p.cover;
    } else {
      plMap.set(key, { ...p, songs: [...(p.songs || [])] });
    }
  });

  const histMap = new Map();
  (b.history || []).forEach(s => { if (s && s.id) histMap.set(s.id, s); });
  (inc.history || []).forEach(s => { if (s && s.id && !histMap.has(s.id)) histMap.set(s.id, s); });

  return {
    favorites: Array.from(favMap.values()),
    playlists: Array.from(plMap.values()),
    history: Array.from(histMap.values()).slice(0, 50)
  };
}

function setAuthMode(mode) {
  currentAuthMode = mode === 'register' ? 'register' : 'login';
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const nameGroup = document.getElementById('auth-name-group');
  const btnText = document.getElementById('google-login-btn-text');
  const errBox = document.getElementById('auth-error-box');
  if (errBox) errBox.style.display = 'none';

  if (currentAuthMode === 'register') {
    if (tabRegister) {
      tabRegister.style.background = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
      tabRegister.style.color = '#fff';
    }
    if (tabLogin) {
      tabLogin.style.background = 'transparent';
      tabLogin.style.color = 'var(--text-muted)';
    }
    if (nameGroup) nameGroup.style.display = 'block';
    if (btnText) btnText.textContent = 'Hesap Oluştur & Listelerimi Buluta Kaydet';
  } else {
    if (tabLogin) {
      tabLogin.style.background = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
      tabLogin.style.color = '#fff';
    }
    if (tabRegister) {
      tabRegister.style.background = 'transparent';
      tabRegister.style.color = 'var(--text-muted)';
    }
    if (nameGroup) nameGroup.style.display = 'none';
    if (btnText) btnText.textContent = 'Giriş Yap & Listelerimi Getir';
  }
}

function showAuthError(msg) {
  const errBox = document.getElementById('auth-error-box');
  if (errBox) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  } else {
    showToast(msg);
  }
}

function renderUserAccount() {
  if (state.user && state.user.email) {
    if (elements.btnOpenGoogleLogin) elements.btnOpenGoogleLogin.style.display = 'none';
    if (elements.userProfileCard) elements.userProfileCard.style.display = 'flex';
    if (elements.userProfileAvatar) elements.userProfileAvatar.src = state.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name || 'Kullanici')}&background=8b5cf6&color=fff&bold=true`;
    if (elements.userProfileName) elements.userProfileName.textContent = state.user.name || 'Kullanıcı';
    if (elements.userProfileEmail) elements.userProfileEmail.textContent = state.user.email;

    if (elements.btnTopbarUser) {
      if (elements.topbarGoogleSvg) elements.topbarGoogleSvg.style.display = 'none';
      if (elements.topbarUserAvatar) {
        elements.topbarUserAvatar.src = state.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name || 'Kullanici')}&background=8b5cf6&color=fff&bold=true`;
        elements.topbarUserAvatar.style.display = 'block';
      }
      if (elements.topbarUserName) {
        elements.topbarUserName.textContent = (state.user.name || state.user.email.split('@')[0]);
      }
    }
  } else {
    if (elements.btnOpenGoogleLogin) elements.btnOpenGoogleLogin.style.display = 'flex';
    if (elements.userProfileCard) elements.userProfileCard.style.display = 'none';

    if (elements.btnTopbarUser) {
      if (elements.topbarGoogleSvg) elements.topbarGoogleSvg.style.display = 'block';
      if (elements.topbarUserAvatar) elements.topbarUserAvatar.style.display = 'none';
      if (elements.topbarUserName) elements.topbarUserName.textContent = 'Giriş Yap / Kayıt Ol';
    }
  }
}

async function loginWithGoogle(rawIdentifier, rawName = '', rawPassword = '') {
  const identifier = (rawIdentifier || '').trim();
  const passwordInputEl = document.getElementById('auth-password-input');
  const password = (rawPassword || (passwordInputEl ? passwordInputEl.value : '') || '').trim();

  if (!identifier || identifier.length < 2) {
    showAuthError('⚠️ Lütfen bir kullanıcı adı veya e-posta adresi girin.');
    return;
  }
  if (!password || password.length < 4) {
    showAuthError('⚠️ Güvenliğiniz için lütfen en az 4 karakterli bir şifre girin.');
    return;
  }

  const userKey = toFirebaseUserKey(identifier);
  if (!userKey) {
    showAuthError('⚠️ Geçersiz kullanıcı adı veya e-posta.');
    return;
  }

  const passwordHash = hashAccountPassword(password, userKey);
  const displayName = (rawName || identifier.split('@')[0]).trim();
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=8b5cf6&color=fff&bold=true`;

  const submitBtn = elements.btnSubmitGoogleLogin;
  const errBox = document.getElementById('auth-error-box');
  if (errBox) errBox.style.display = 'none';

  let originalText = '';
  if (submitBtn) {
    const textSpan = submitBtn.querySelector('span');
    if (textSpan) {
      originalText = textSpan.textContent;
      textSpan.textContent = currentAuthMode === 'register' ? 'Hesap oluşturuluyor...' : 'Buluta bağlanılıyor...';
    }
    submitBtn.disabled = true;
  }

  try {
    const existingRecord = await firebaseGetUser(userKey);

    if (currentAuthMode === 'register') {
      // REGISTER FLOW
      if (existingRecord && existingRecord.passwordHash) {
        if (existingRecord.passwordHash !== passwordHash) {
          showAuthError('❌ Bu kullanıcı adı/e-posta zaten alınmış! Size aitse "Giriş Yap" sekmesinden şifrenizle giriş yapın.');
          return;
        }
        // If same password, treat as login + merge
      }

      const mergedLib = existingRecord && existingRecord.library
        ? mergeLibraries(state.library, existingRecord.library)
        : {
            favorites: (state.library && state.library.favorites) || [],
            playlists: (state.library && state.library.playlists) || [],
            history: ((state.library && state.library.history) || []).slice(0, 50)
          };

      const userObj = {
        userKey,
        email: identifier.toLowerCase(),
        name: displayName,
        avatar,
        createdAt: (existingRecord && existingRecord.user && existingRecord.user.createdAt) || Date.now(),
        lastSync: Date.now()
      };

      await firebasePutUser(userKey, {
        user: userObj,
        passwordHash,
        library: mergedLib
      });

      state.user = userObj;
      state.library = mergedLib;
      localStorage.setItem('muzikal_user', JSON.stringify(userObj));
      persistLibrary(state.library, true);

      // Also sync to local PC server if running
      fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userObj.email, name: userObj.name, avatar: userObj.avatar, library: state.library })
      }).catch(() => {});

      renderUserAccount();
      if (elements.googleLoginModal) elements.googleLoginModal.style.display = 'none';
      if (passwordInputEl) passwordInputEl.value = '';
      renderSidebarPlaylists();
      if (elements.favCountBadge) elements.favCountBadge.textContent = state.library.favorites.length;
      if (state.currentView === 'home' && typeof renderHomeSections === 'function') renderHomeSections();
      showToast(`🎉 Hesabınız oluşturuldu ve ${(mergedLib.playlists || []).length} listeniz buluta kaydedildi!`);
    } else {
      // LOGIN FLOW
      if (!existingRecord || !existingRecord.user) {
        showAuthError('ℹ️ Bu kullanıcı adı/e-posta ile kayıtlı hesap bulunamadı. Üstteki "✨ Kayıt Ol" sekmesinden hemen oluşturabilirsiniz!');
        return;
      }

      if (existingRecord.passwordHash && existingRecord.passwordHash !== passwordHash) {
        showAuthError('❌ Girdiğiniz şifre hatalı! Lütfen kontrol edip tekrar deneyin.');
        return;
      }

      const mergedLib = mergeLibraries(state.library, existingRecord.library || {});
      const userObj = {
        ...existingRecord.user,
        userKey,
        email: existingRecord.user.email || identifier.toLowerCase(),
        lastSync: Date.now()
      };

      // Save merged library & passwordHash (if upgrading legacy account) back to Firebase
      await firebasePutUser(userKey, {
        user: userObj,
        passwordHash,
        library: mergedLib
      });

      state.user = userObj;
      state.library = mergedLib;
      localStorage.setItem('muzikal_user', JSON.stringify(userObj));
      persistLibrary(state.library, true);

      fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userObj.email, name: userObj.name, avatar: userObj.avatar, library: state.library })
      }).catch(() => {});

      renderUserAccount();
      if (elements.googleLoginModal) elements.googleLoginModal.style.display = 'none';
      if (passwordInputEl) passwordInputEl.value = '';
      renderSidebarPlaylists();
      if (elements.favCountBadge) elements.favCountBadge.textContent = state.library.favorites.length;
      if (state.currentView === 'home' && typeof renderHomeSections === 'function') renderHomeSections();

      const plCount = (mergedLib.playlists || []).length;
      const favCount = (mergedLib.favorites || []).length;
      showToast(`☁️ Hoş geldin ${userObj.name}! (${plCount} liste, ${favCount} favori eşitlendi)`);
    }
  } catch (err) {
    console.error('Firebase Auth Error:', err);
    showAuthError('⚠️ Bulut sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol edin.');
  } finally {
    if (submitBtn) {
      const textSpan = submitBtn.querySelector('span');
      if (textSpan && originalText) textSpan.textContent = originalText;
      submitBtn.disabled = false;
    }
  }
}

function openUserAccountHub() {
  if (!state.user || !state.user.email) {
    if (elements.googleLoginModal) {
      setAuthMode('login');
      elements.googleLoginModal.style.display = 'flex';
      if (elements.googleEmailInput) elements.googleEmailInput.focus();
    }
    return;
  }

  if (elements.accountHubAvatar) {
    elements.accountHubAvatar.src = state.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name || 'Kullanici')}&background=8b5cf6&color=fff&bold=true`;
  }
  if (elements.accountHubName) {
    elements.accountHubName.textContent = state.user.name || 'Kullanıcı';
  }
  if (elements.accountHubEmail) {
    elements.accountHubEmail.textContent = state.user.email;
  }
  updateAccountHubStats();

  if (elements.userAccountModal) {
    elements.userAccountModal.style.display = 'flex';
  }
}

function updateAccountHubStats() {
  const plCount = (state.library && state.library.playlists) ? state.library.playlists.length : 0;
  const favCount = (state.library && state.library.favorites) ? state.library.favorites.length : 0;
  if (elements.accountStatPlaylists) elements.accountStatPlaylists.textContent = plCount;
  if (elements.accountStatFavorites) elements.accountStatFavorites.textContent = favCount;
  if (elements.accountStatTime) {
    if (state.user && state.user.lastSync) {
      const d = new Date(state.user.lastSync);
      elements.accountStatTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      elements.accountStatTime.textContent = 'Az önce';
    }
  }
}

async function syncPushToCloud() {
  if (!state.user || !state.user.email) {
    showToast('Bulut eşitlemesi için önce hesabınıza giriş yapın.');
    return;
  }
  const btn = elements.btnHubSyncPush;
  if (btn) btn.disabled = true;

  try {
    const userKey = state.user.userKey || toFirebaseUserKey(state.user.email);
    await firebaseSaveLibrary(userKey, state.library);
    updateAccountHubStats();
    showToast('☁️ Tüm çalma listeleriniz ve favorileriniz Firebase Bulut hesabınıza kaydedildi!');
  } catch (err) {
    console.error('Push error:', err);
    showToast('Aktarma sırasında bağlantı hatası oluştu.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function syncPullFromCloud(silent = false) {
  if (!state.user || !state.user.email) {
    if (!silent) showToast('Buluttan liste çekmek için önce giriş yapın.');
    return;
  }
  const btn = elements.btnHubSyncPull;
  if (btn && !silent) btn.disabled = true;

  try {
    const userKey = state.user.userKey || toFirebaseUserKey(state.user.email);
    const cloudRecord = await firebaseGetUser(userKey);
    if (cloudRecord && cloudRecord.library) {
      state.library = mergeLibraries(state.library, cloudRecord.library);
      state.user.lastSync = Date.now();
      localStorage.setItem('muzikal_user', JSON.stringify(state.user));

      persistLibrary(state.library, true);
      renderSidebarPlaylists();
      if (elements.favCountBadge) elements.favCountBadge.textContent = state.library.favorites.length;
      updateAccountHubStats();
      if (state.currentView === 'home' && typeof renderHomeSections === 'function') {
        renderHomeSections();
      }
      if (!silent) {
        const plLen = (state.library.playlists || []).length;
        const favLen = (state.library.favorites || []).length;
        showToast(`☁️ Buluttaki ${plLen} liste ve ${favLen} favori bu cihaza eşitlendi!`);
      }
    } else if (!silent) {
      showToast('Bulutta henüz kayıtlı liste bulunamadı.');
    }
  } catch (err) {
    console.error('Pull error:', err);
    if (!silent) showToast('Buluttan veri çekilirken hata oluştu.');
  } finally {
    if (btn && !silent) btn.disabled = false;
  }
}

function exportPlaylistsToJson() {
  try {
    const backupData = {
      app: 'Müzikal',
      version: CURRENT_APP_VERSION,
      exportDate: new Date().toISOString(),
      user: state.user ? state.user.email : null,
      playlists: state.library.playlists || [],
      favorites: state.library.favorites || []
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muzikal_yedek_calma_listeleri_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📁 Çalma listeleri ve favoriler JSON dosyasına yedeklendi!');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Yedek dosyası oluşturulamadı.');
  }
}

function importPlaylistsFromJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const incomingPlaylists = parsed.playlists || [];
      const incomingFavorites = parsed.favorites || [];

      if (!incomingPlaylists.length && !incomingFavorites.length) {
        showToast('Yedek dosyasında geçerli bir çalma listesi veya favori bulunamadı.');
        return;
      }

      // Merge favorites
      const favMap = new Map();
      (state.library.favorites || []).forEach(s => favMap.set(s.id, s));
      incomingFavorites.forEach(s => favMap.set(s.id, s));
      state.library.favorites = Array.from(favMap.values());

      // Merge playlists
      const plMap = new Map();
      (state.library.playlists || []).forEach(p => plMap.set(p.id || p.name, { ...p, songs: [...(p.songs || [])] }));
      incomingPlaylists.forEach(p => {
        const key = p.id || p.name;
        if (plMap.has(key)) {
          const existing = plMap.get(key);
          const songMap = new Map();
          (existing.songs || []).forEach(s => songMap.set(s.id, s));
          (p.songs || []).forEach(s => songMap.set(s.id, s));
          existing.songs = Array.from(songMap.values());
        } else {
          plMap.set(key, p);
        }
      });
      state.library.playlists = Array.from(plMap.values());

      persistLibrary(state.library);
      renderSidebarPlaylists();
      if (elements.favCountBadge) elements.favCountBadge.textContent = state.library.favorites.length;
      updateAccountHubStats();
      if (state.currentView === 'home' && typeof renderHomeSections === 'function') {
        renderHomeSections();
      }
      showToast(`✅ Yedekten ${incomingPlaylists.length} çalma listesi başarıyla yüklendi!`);
    } catch (err) {
      console.error('Import parse error:', err);
      showToast('Yedek dosyası okunamadı veya biçimi hatalı.');
    }
  };
  reader.readAsText(file);
}

function logoutGoogle() {
  if (!confirm('Hesabınızdan çıkış yapmak istediğinize emin misiniz?\n\n(Misafir moduna geçilecek, şarkılarınız bulut hesabınızda güvende kalacaktır)')) {
    return;
  }

  state.user = null;
  localStorage.removeItem('muzikal_user');
  if (elements.userAccountModal) elements.userAccountModal.style.display = 'none';
  renderUserAccount();
  showToast('Hesaptan çıkış yapıldı. Misafir moduna geçildi.');
}

function initGoogleAuth() {
  renderUserAccount();

  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const btnTogglePwd = document.getElementById('btn-toggle-password');
  const pwdInput = document.getElementById('auth-password-input');

  if (tabLogin) {
    tabLogin.addEventListener('click', () => setAuthMode('login'));
  }
  if (tabRegister) {
    tabRegister.addEventListener('click', () => setAuthMode('register'));
  }
  if (btnTogglePwd && pwdInput) {
    btnTogglePwd.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      btnTogglePwd.textContent = isPwd ? '🙈' : '👁️';
    });
  }

  if (elements.btnOpenGoogleLogin) {
    elements.btnOpenGoogleLogin.addEventListener('click', () => {
      if (elements.googleLoginModal) {
        setAuthMode('login');
        elements.googleLoginModal.style.display = 'flex';
        if (elements.googleEmailInput) elements.googleEmailInput.focus();
      }
    });
  }

  // Clicking user avatar or profile card opens Account Hub (or login if guest)
  if (elements.btnTopbarUser) {
    elements.btnTopbarUser.addEventListener('click', () => {
      if (state.user && state.user.email) {
        openUserAccountHub();
      } else {
        if (elements.googleLoginModal) {
          setAuthMode('login');
          elements.googleLoginModal.style.display = 'flex';
          if (elements.googleEmailInput) elements.googleEmailInput.focus();
        }
      }
    });
  }

  if (elements.btnMobileUserTop) {
    elements.btnMobileUserTop.addEventListener('click', () => {
      if (state.user && state.user.email) {
        openUserAccountHub();
      } else {
        if (elements.googleLoginModal) {
          setAuthMode('login');
          elements.googleLoginModal.style.display = 'flex';
          if (elements.googleEmailInput) elements.googleEmailInput.focus();
        }
      }
    });
  }

  if (elements.userProfileCard) {
    elements.userProfileCard.addEventListener('click', (e) => {
      if (e.target && e.target.closest('#btn-google-logout')) return;
      openUserAccountHub();
    });
  }

  if (elements.btnCloseGoogleModal) {
    elements.btnCloseGoogleModal.addEventListener('click', () => {
      if (elements.googleLoginModal) elements.googleLoginModal.style.display = 'none';
    });
  }

  if (elements.googleLoginModal) {
    elements.googleLoginModal.addEventListener('click', (e) => {
      if (e.target === elements.googleLoginModal) {
        elements.googleLoginModal.style.display = 'none';
      }
    });
  }

  if (elements.btnGoogleLogout) {
    elements.btnGoogleLogout.addEventListener('click', (e) => {
      e.stopPropagation();
      logoutGoogle();
    });
  }

  if (elements.btnSubmitGoogleLogin) {
    elements.btnSubmitGoogleLogin.addEventListener('click', () => {
      const email = elements.googleEmailInput ? elements.googleEmailInput.value : '';
      const name = elements.googleNameInput ? elements.googleNameInput.value : '';
      const pwd = pwdInput ? pwdInput.value : '';
      loginWithGoogle(email, name, pwd);
    });
  }

  if (elements.googleEmailInput) {
    elements.googleEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (pwdInput && !pwdInput.value) {
          pwdInput.focus();
          return;
        }
        const email = elements.googleEmailInput.value;
        const name = elements.googleNameInput ? elements.googleNameInput.value : '';
        const pwd = pwdInput ? pwdInput.value : '';
        loginWithGoogle(email, name, pwd);
      }
    });
  }

  if (pwdInput) {
    pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const email = elements.googleEmailInput ? elements.googleEmailInput.value : '';
        const name = elements.googleNameInput ? elements.googleNameInput.value : '';
        loginWithGoogle(email, name, pwdInput.value);
      }
    });
  }

  // Account Hub Modal Handlers
  if (elements.btnCloseAccountModal) {
    elements.btnCloseAccountModal.addEventListener('click', () => {
      if (elements.userAccountModal) elements.userAccountModal.style.display = 'none';
    });
  }

  if (elements.userAccountModal) {
    elements.userAccountModal.addEventListener('click', (e) => {
      if (e.target === elements.userAccountModal) {
        elements.userAccountModal.style.display = 'none';
      }
    });
  }

  if (elements.btnHubSyncPush) {
    elements.btnHubSyncPush.addEventListener('click', syncPushToCloud);
  }

  if (elements.btnHubSyncPull) {
    elements.btnHubSyncPull.addEventListener('click', () => syncPullFromCloud(false));
  }

  if (elements.btnExportPlaylistsJson) {
    elements.btnExportPlaylistsJson.addEventListener('click', exportPlaylistsToJson);
  }

  if (elements.btnImportPlaylistsJson && elements.fileImportPlaylists) {
    elements.btnImportPlaylistsJson.addEventListener('click', () => {
      elements.fileImportPlaylists.click();
    });
    elements.fileImportPlaylists.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        importPlaylistsFromJson(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  if (elements.btnSwitchAccount) {
    elements.btnSwitchAccount.addEventListener('click', () => {
      if (elements.userAccountModal) elements.userAccountModal.style.display = 'none';
      if (elements.googleLoginModal) {
        setAuthMode('login');
        elements.googleLoginModal.style.display = 'flex';
        if (elements.googleEmailInput) {
          elements.googleEmailInput.value = '';
          elements.googleEmailInput.focus();
        }
        if (elements.googleNameInput) elements.googleNameInput.value = '';
        if (pwdInput) pwdInput.value = '';
      }
    });
  }

  if (elements.btnHubLogout) {
    elements.btnHubLogout.addEventListener('click', () => {
      logoutGoogle();
    });
  }
}

// --- BOOTSTRAP APP ---
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const vRes = await fetch('/api/version');
    if (vRes.ok) {
      const vData = await vRes.json();
      if (vData && vData.version && compareSemver(vData.version, CURRENT_APP_VERSION) >= 0) {
        CURRENT_APP_VERSION = vData.version;
      }
    }
  } catch (e) {}

  const sidebarVer = document.getElementById('sidebar-app-ver');
  if (sidebarVer) sidebarVer.textContent = 'v' + CURRENT_APP_VERSION;

  setupEventListeners();
  initGoogleAuth();
  setVolume(state.volume);
  updateRepeatUI();
  updateShuffleUI();
  setViewMode(state.viewMode);
  updateCategoryChipsVisibility();
  await loadDownloads();
  await loadLibrary();
  if (state.user && state.user.email) {
    syncPullFromCloud(true).catch(() => {});
  }
  await fetchExploreGenre('trendler');
  await loadDiscordConfig();
  setInterval(() => {
    if (discordState.enabled && discordState.clientId) {
      loadDiscordConfig();
    }
  }, 15000);
  setTimeout(() => checkForAppUpdates(false), 1500); // Check updates automatically on startup
});
