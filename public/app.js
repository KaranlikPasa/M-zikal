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
  isVideoVisible: false
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
  mfpFavBtn: document.getElementById('mfp-fav-btn'),
  mfpFavIcon: document.getElementById('mfp-fav-icon'),
  mfpProgressTrack: document.getElementById('mfp-progress-track'),
  mfpProgressFill: document.getElementById('mfp-progress-fill'),
  mfpProgressHandle: document.getElementById('mfp-progress-handle'),
  mfpCurrentTime: document.getElementById('mfp-current-time'),
  mfpTotalDuration: document.getElementById('mfp-total-duration'),
  mfpBtnShuffle: document.getElementById('mfp-btn-shuffle'),
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
      'origin': window.location.origin
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

function onPlayerError(event) {
  if (state.isOfflinePlaying) return;
  console.warn('YouTube playback error:', event.data);
  showToast('Bu video kısıtlı. Sonraki parçaya geçiliyor...');
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

  syncLikeState();

  // Check if song is downloaded offline on Drive D
  const isOffline = state.downloadedIds.has(song.id);

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

function playNext() {
  if (state.queue.length > 0) {
    const nextSong = state.queue.shift();
    elements.queueBadge.textContent = state.queue.length;
    playSong(nextSong);
    return;
  }

  if (state.currentPlaylist.length === 0) return;

  if (state.isShuffled) {
    const nextIdx = Math.floor(Math.random() * state.currentPlaylist.length);
    playSong(state.currentPlaylist[nextIdx], state.currentPlaylist, nextIdx);
    return;
  }

  let nextIdx = state.currentIndex + 1;
  if (nextIdx >= state.currentPlaylist.length) {
    if (state.repeatMode === 'off') return;
    nextIdx = 0;
  }

  playSong(state.currentPlaylist[nextIdx], state.currentPlaylist, nextIdx);
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
  playSong(state.currentPlaylist[prevIdx], state.currentPlaylist, prevIdx);
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
    const data = await res.json();
    state.downloadedIds = new Set(data.downloadedIds || []);
    elements.downloadsCountBadge.textContent = state.downloadedIds.size;
  } catch (e) {
    console.error('Error fetching downloads:', e);
  }
}

async function triggerDownloadTrack(song, btn = null) {
  if (!song || !song.id) return;

  if (state.downloadedIds.has(song.id)) {
    showToast(`"${song.title}" zaten D:\\müzikal\\downloads içinde mevcut.`);
    return;
  }

  if (btn) {
    btn.classList.add('downloading');
    btn.title = 'İndiriliyor...';
  }

  showToast(`"${song.title}" D diskine indiriliyor...`);

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
        showToast('💾 Şarkı D:\\müzikal\\downloads klasörüne indirildi!');
        renderSongs(state.currentPlaylist);
      }
    } catch (e) {
      clearInterval(pollInterval);
    }
  }, 1500);
}

async function triggerDownloadPlaylist(playlistId) {
  showToast('Tüm liste D:\\müzikal\\downloads klasörüne indiriliyor...');
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
      showToast('Şarkı D diskinden silindi.');
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

// --- RENDERING SONGS IN GRID ---

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
        <div class="song-card-title" title="${song.title}">${song.title}</div>
        <div class="song-card-channel">${song.channel}</div>
        <div class="song-card-actions">
          <button class="btn-icon-subtle btn-add-q" title="Sıraya Ekle">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="btn-icon-subtle btn-card-download ${isDownloaded ? 'downloaded' : ''}" title="${isDownloaded ? 'D Diskinde İndirildi' : 'Çevrimdışı İndir (D Diski)'}">
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

// --- DATA FETCHING ---

async function fetchExploreGenre(genreKey) {
  elements.sectionActions.innerHTML = '';
  elements.songsGrid.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.loadingState.style.display = 'flex';
  elements.loadingText.textContent = 'Müzikler yükleniyor...';

  try {
    const res = await fetch(`/api/explore?genre=${encodeURIComponent(genreKey)}`);
    const data = await res.json();
    state.currentPlaylist = data.results || [];
    renderSongs(state.currentPlaylist);
  } catch (err) {
    console.error('Explore fetch failed:', err);
    elements.loadingState.style.display = 'none';
    elements.emptyState.style.display = 'flex';
  }
}

async function performSearch(query) {
  if (!query || query.trim() === '') {
    fetchExploreGenre(state.currentGenre);
    return;
  }

  elements.heroBanner.style.display = 'none';
  elements.sectionActions.innerHTML = '';
  elements.currentSectionTitle.textContent = `"${query}" İçin Arama Sonuçları`;
  elements.currentSectionDesc.textContent = 'Milyonlarca şarkı ve video arasından bulundu';
  elements.songsGrid.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.loadingState.style.display = 'flex';
  elements.loadingText.textContent = 'Arama yapılıyor...';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    state.currentPlaylist = data.results || [];
    renderSongs(state.currentPlaylist, true);
  } catch (err) {
    console.error('Search failed:', err);
    elements.loadingState.style.display = 'none';
    elements.emptyState.style.display = 'flex';
  }
}

async function loadLibrary() {
  try {
    const res = await fetch('/api/library');
    const data = await res.json();
    state.library = data;
    elements.favCountBadge.textContent = state.library.favorites.length;
    renderSidebarPlaylists();
  } catch (e) {
    console.error('Failed to load library:', e);
  }
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
      elements.favCountBadge.textContent = state.library.favorites.length;
      syncLikeState();
      showToast(data.isFavorite ? '❤️ Beğenilen Şarkılara eklendi' : 'Beğenilen Şarkılardan kaldırıldı');
    }
  } catch (e) {
    console.error('Toggle favorite failed:', e);
  }
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

  state.currentPlaylistId = plId;
  elements.heroBanner.style.display = 'none';
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
      <span>Tümünü D Diskine İndir</span>
    </button>
  `;

  document.getElementById('btn-download-entire-playlist').addEventListener('click', () => {
    triggerDownloadPlaylist(plId);
  });

  state.currentPlaylist = pl.songs;
  renderSongs(pl.songs);
}

function openDownloadsView() {
  elements.heroBanner.style.display = 'none';
  elements.sectionActions.innerHTML = '';
  elements.currentSectionTitle.textContent = 'İndirilenler & Çevrimdışı Parçalar';
  elements.currentSectionDesc.textContent = `D:\\müzikal\\downloads içinde kayıtlı ${state.downloadedIds.size} şarkı. İnternetsiz dinlenebilir.`;

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
    elements.heroBanner.style.display = 'flex';
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

  elements.btnShuffle.addEventListener('click', () => {
    state.isShuffled = !state.isShuffled;
    elements.btnShuffle.classList.toggle('active', state.isShuffled);
    showToast(state.isShuffled ? '🔀 Karışık Çalma Açık' : 'Karışık Çalma Kapalı');
  });

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
}

function showToast(msg) {
  elements.toast.textContent = msg;
  elements.toast.classList.add('show');
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2600);
}

// --- BOOTSTRAP APP ---
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadDownloads();
  await loadLibrary();
  await fetchExploreGenre('trendler');
});
