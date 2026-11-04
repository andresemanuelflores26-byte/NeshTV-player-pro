import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export type PlayerEngineType = 'hls' | 'mpegts' | 'native' | 'proxy-hls' | 'proxy-ts' | 'exoplayer';
export type PlayerStatusType = 'connecting' | 'playing' | 'buffering' | 'error';

export interface StreamQualityLevel {
  index: number;
  height: number;
  width?: number;
  bitrate: number;
  name: string;
}

export interface PlaybackSession {
  destroy: () => void;
  reconnect: () => void;
  retryWithProxy: () => void;
  retryWithEngine: (engine: PlayerEngineType) => void;
  getLevels: () => StreamQualityLevel[];
  getCurrentLevel: () => number;
  setLevel: (levelIndex: number) => void;
}

export interface PlaybackConfig {
  url: string;
  video: HTMLVideoElement;
  bufferSize?: number;
  forceProxy?: boolean;
  onStatusChange?: (status: PlayerStatusType, detail?: string) => void;
  onEngineChange?: (engine: PlayerEngineType) => void;
  onLevelsLoaded?: (levels: StreamQualityLevel[]) => void;
  onLevelChange?: (levelIndex: number, levelName: string) => void;
}

// Dummy event emitter prevents "Cannot read properties of null (reading 'emit')"
// when mpegts.js queued microtasks (Promise.resolve().then) fire after player destroy
const dummyEmitter: any = {
  emit: () => false,
  on: () => dummyEmitter,
  off: () => dummyEmitter,
  addListener: () => dummyEmitter,
  removeListener: () => dummyEmitter,
  removeAllListeners: () => dummyEmitter,
  listeners: () => [],
  hasListeners: () => false,
};

function safelyDisarmTransmuxer(transmuxer: any) {
  if (!transmuxer) return;
  try {
    const tmProto = Object.getPrototypeOf(transmuxer);
    if (tmProto && !tmProto.__safePatched) {
      tmProto.__safePatched = true;

      // Disarm tmProto.destroy: never leave this._emitter null because
      // mpegts microtasks (_onMediaSegment, _onLoadingComplete) will throw
      const origTmDestroy = tmProto.destroy;
      tmProto.destroy = function () {
        try {
          if (this._controller && typeof this._controller.destroy === 'function') {
            this._controller.destroy();
            this._controller = null;
          }
          if (this._emitter && typeof this._emitter.removeAllListeners === 'function') {
            this._emitter.removeAllListeners();
          }
        } catch {}
        this._emitter = dummyEmitter;
      };

      // Wrap async callbacks that use Promise.resolve().then to emit
      const wrapAsyncCallback = (fnName: string, eventName: string) => {
        const orig = tmProto[fnName];
        if (typeof orig === 'function') {
          tmProto[fnName] = function (...args: any[]) {
            const self = this;
            Promise.resolve().then(() => {
              try {
                if (self._emitter && typeof self._emitter.emit === 'function') {
                  self._emitter.emit(eventName, ...args);
                }
              } catch {}
            });
          };
        }
      };

      wrapAsyncCallback('_onMediaSegment', 'media_segment');
      wrapAsyncCallback('_onLoadingComplete', 'loading_complete');
      wrapAsyncCallback('_onRecoveredEarlyEof', 'recovered_early_eof');
      wrapAsyncCallback('_onMediaInfo', 'media_info');
    }
  } catch {}

  try {
    if (!transmuxer._emitter || transmuxer._emitter === null) {
      transmuxer._emitter = dummyEmitter;
    }
    if (transmuxer._controller && (!transmuxer._controller._emitter || transmuxer._controller._emitter === null)) {
      transmuxer._controller._emitter = dummyEmitter;
    }
  } catch {}
}

function patchMpegtsPlayer(player: any) {
  if (!player) return;

  try {
    const playerProto = Object.getPrototypeOf(player);
    if (playerProto && !playerProto.__safeDestroyPatched) {
      playerProto.__safeDestroyPatched = true;
      const origProtoDestroy = playerProto.destroy;
      playerProto.destroy = function () {
        try {
          if (this._transmuxer) {
            safelyDisarmTransmuxer(this._transmuxer);
          }
          origProtoDestroy.call(this);
        } catch (err) {
          console.warn('[mpegts] Safe destroy caught:', err);
        } finally {
          this._emitter = dummyEmitter;
        }
      };
    }
  } catch {}

  const origLoad = player.load?.bind(player);
  if (origLoad) {
    player.load = function () {
      try {
        origLoad();
      } finally {
        if (this._transmuxer) {
          safelyDisarmTransmuxer(this._transmuxer);
        }
      }
    };
  }

  const origUnload = player.unload?.bind(player);
  if (origUnload) {
    player.unload = function () {
      if (this._transmuxer) {
        safelyDisarmTransmuxer(this._transmuxer);
      }
      try {
        origUnload();
      } catch (err) {
        console.warn('[mpegts] Safe unload caught:', err);
      } finally {
        this._emitter = dummyEmitter;
      }
    };
  }
}

// Global browser safeguard against any unhandled mpegts emitter edge case
if (typeof window !== 'undefined' && !(window as any).__mpegtsErrorListenerInstalled) {
  (window as any).__mpegtsErrorListenerInstalled = true;
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (
        event.message &&
        (event.message.includes("reading 'emit'") || event.message.includes('Non MPEG-TS/FLV') || event.message.includes('TransmuxingController'))
      ) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || String(event.reason || '');
      if (reason.includes("reading 'emit'") || reason.includes('Non MPEG-TS/FLV') || reason.includes('TransmuxingController')) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );
}

/**
 * Universal IPTV Stream Player with Anti-Freeze Watchdog,
 * Automatic Gap Nudging, and Stable Buffer Configuration.
 */
export function playUniversalStream(config: PlaybackConfig): PlaybackSession {
  const {
    url: rawUrl,
    video,
    forceProxy = false,
    onStatusChange,
    onEngineChange,
    onLevelsLoaded,
    onLevelChange,
  } = config;

  let isDestroyed = false;
  let activeHls: Hls | null = null;
  let activeMpegts: mpegts.Player | null = null;
  let hasReceivedPlaying = false;
  let fallbackTimer: NodeJS.Timeout | null = null;
  let watchdogTimer: NodeJS.Timeout | null = null;
  let currentQualityLevels: StreamQualityLevel[] = [];
  let userPreferredLevel = -1;
  let mediaRecoveryCount = 0;

  const cleanUrl = (rawUrl || '').trim();
  if (!cleanUrl) {
    onStatusChange?.('playing');
    return {
      destroy: () => {},
      reconnect: () => {},
      retryWithProxy: () => {},
      retryWithEngine: () => {},
      getLevels: () => [],
      getCurrentLevel: () => -1,
      setLevel: () => {},
    };
  }

  video.removeAttribute('crossorigin');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const getCandidateUrls = (u: string): string[] => {
    const list: string[] = [];
    let trimmed = u.trim();
    if (!trimmed) return list;

    // If it's already a local proxy URL, unwrap the inner URL to avoid double-proxying
    if (trimmed.startsWith('/api/proxy/stream')) {
      try {
        const parsedProxy = new URL(trimmed, window.location.origin);
        const innerUrl = parsedProxy.searchParams.get('url');
        if (innerUrl) trimmed = innerUrl;
      } catch {}
    }

    const toProxy = (raw: string) => `/api/proxy/stream?url=${encodeURIComponent(raw)}`;

    let tsVariant: string | null = null;
    let m3u8Variant: string | null = null;
    let directVariant: string | null = null;

    try {
      const parsed = new URL(trimmed);
      const segs = parsed.pathname.split('/').filter(Boolean);
      const search = parsed.search || '';
      const base = `${parsed.protocol}//${parsed.host}`;

      if (segs.length >= 4 && (segs[0] === 'live' || segs[0] === 'movie' || segs[0] === 'series')) {
        const streamType = segs[0];
        const streamUser = segs[1];
        const streamPass = segs[2];
        const rawId = segs[3].replace(/\.(m3u8|ts|mp4|mkv)$/i, '');
        tsVariant = `${base}/${streamType}/${streamUser}/${streamPass}/${rawId}.ts${search}`;
        m3u8Variant = `${base}/${streamType}/${streamUser}/${streamPass}/${rawId}.m3u8${search}`;
        directVariant = `${base}/${streamUser}/${streamPass}/${rawId}${search}`;
      } else if (segs.length === 3 && segs[0] !== 'api' && segs[0] !== 'hls') {
        const streamUser = segs[0];
        const streamPass = segs[1];
        const rawId = segs[2].replace(/\.(m3u8|ts|mp4|mkv)$/i, '');
        tsVariant = `${base}/live/${streamUser}/${streamPass}/${rawId}.ts${search}`;
        m3u8Variant = `${base}/live/${streamUser}/${streamPass}/${rawId}.m3u8${search}`;
        directVariant = `${base}/${streamUser}/${streamPass}/${rawId}${search}`;
      }
    } catch {}

    if (!tsVariant && trimmed.toLowerCase().includes('.m3u8')) {
      tsVariant = trimmed.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
    }
    if (!m3u8Variant && trimmed.toLowerCase().includes('.ts')) {
      m3u8Variant = trimmed.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
    }

    const shouldProxyFirst = forceProxy || isHttps || trimmed.startsWith('http://');

    const lower = trimmed.toLowerCase();
    const isOriginalM3u8 = lower.includes('.m3u8') || lower.includes('m3u');
    const isOriginalTs = lower.includes('.ts') || lower.includes('mp2t');
    const isOriginalDirectVideo =
      lower.includes('.mp4') ||
      lower.includes('.mkv') ||
      lower.includes('.webm') ||
      lower.includes('.avi') ||
      lower.includes('.mov') ||
      lower.includes('/movie/') ||
      lower.includes('/series/');

    if (isOriginalDirectVideo) {
      if (shouldProxyFirst) {
        list.push(toProxy(trimmed));
        list.push(trimmed);
      } else {
        list.push(trimmed);
        list.push(toProxy(trimmed));
      }
      return Array.from(new Set(list.filter(Boolean)));
    }

    if (isOriginalM3u8) {
      // User or playlist specified M3U8/HLS: HLS comes first, TS only as last fallback
      if (shouldProxyFirst) {
        list.push(toProxy(trimmed));
        if (m3u8Variant && m3u8Variant !== trimmed) list.push(toProxy(m3u8Variant));
        list.push(trimmed);
        if (m3u8Variant && m3u8Variant !== trimmed) list.push(m3u8Variant);
        if (tsVariant) list.push(toProxy(tsVariant));
      } else {
        list.push(trimmed);
        if (m3u8Variant && m3u8Variant !== trimmed) list.push(m3u8Variant);
        list.push(toProxy(trimmed));
        if (m3u8Variant && m3u8Variant !== trimmed) list.push(toProxy(m3u8Variant));
        if (tsVariant) list.push(tsVariant);
      }
      return Array.from(new Set(list.filter(Boolean)));
    }

    if (isOriginalTs) {
      // User specified TS: Prioritize M3U8 variant via proxy first for reliable HLS.js web playback
      if (shouldProxyFirst) {
        if (m3u8Variant) list.push(toProxy(m3u8Variant));
        list.push(toProxy(trimmed));
        if (m3u8Variant) list.push(m3u8Variant);
        if (tsVariant && tsVariant !== trimmed) list.push(toProxy(tsVariant));
        list.push(trimmed);
      } else {
        if (m3u8Variant) list.push(m3u8Variant);
        list.push(trimmed);
        if (m3u8Variant) list.push(toProxy(m3u8Variant));
        list.push(toProxy(trimmed));
      }
      return Array.from(new Set(list.filter(Boolean)));
    }

    // Extensionless or generic stream: try M3U8 first (most standard and stable in browsers MSE), then TS, then direct
    if (shouldProxyFirst) {
      if (m3u8Variant) list.push(toProxy(m3u8Variant));
      list.push(toProxy(trimmed));
      if (tsVariant) list.push(toProxy(tsVariant));
      if (directVariant) list.push(toProxy(directVariant));

      if (m3u8Variant) list.push(m3u8Variant);
      list.push(trimmed);
      if (tsVariant) list.push(tsVariant);
    } else {
      if (m3u8Variant) list.push(m3u8Variant);
      list.push(trimmed);
      if (tsVariant) list.push(tsVariant);

      if (m3u8Variant) list.push(toProxy(m3u8Variant));
      list.push(toProxy(trimmed));
      if (tsVariant) list.push(toProxy(tsVariant));
    }

    return Array.from(new Set(list.filter(Boolean)));
  };

  if (typeof mpegts !== 'undefined' && mpegts.LoggingControl) {
    mpegts.LoggingControl.enableAll = false;
    mpegts.LoggingControl.enableError = false;
    mpegts.LoggingControl.enableWarn = false;
    mpegts.LoggingControl.enableInfo = false;
    mpegts.LoggingControl.enableDebug = false;
  }

  const urls = getCandidateUrls(cleanUrl);

  const cleanup = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    if (activeHls) {
      try {
        activeHls.stopLoad();
        activeHls.detachMedia();
        activeHls.destroy();
      } catch {}
      activeHls = null;
    }
    if (activeMpegts) {
      const p = activeMpegts as any;
      activeMpegts = null;
      try {
        p.pause?.();
        p.unload?.();
        p.detachMediaElement?.();
      } catch {}
      try {
        if (!p._emitter) p._emitter = dummyEmitter;
        if (p._transmuxer) safelyDisarmTransmuxer(p._transmuxer);
      } catch {}
      // Safely defer destroy so any currently running or queued event callbacks finish
      setTimeout(() => {
        try {
          p.destroy?.();
        } catch {}
      }, 50);
    }
    try {
      video.removeAttribute('src');
      video.load();
    } catch {}
  };

  const onPlaying = () => {
    if (isDestroyed) return;
    hasReceivedPlaying = true;
    mediaRecoveryCount = 0;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    onStatusChange?.('playing');
  };

  const onWaiting = () => {
    if (isDestroyed) return;
    onStatusChange?.('buffering', 'Búfer...');
  };

  const onStalled = () => {
    if (isDestroyed) return;
    onStatusChange?.('buffering', 'Búfer...');
  };

  video.addEventListener('playing', onPlaying);
  video.addEventListener('waiting', onWaiting);
  video.addEventListener('stalled', onStalled);

  // Smooth Watchdog: monitors playback without destructive currentTime jumping
  let lastObservedTime = -1;
  let freezeCycles = 0;
  const startWatchdog = () => {
    if (watchdogTimer) clearInterval(watchdogTimer);
    freezeCycles = 0;
    lastObservedTime = -1;

    watchdogTimer = setInterval(() => {
      if (isDestroyed || !video) return;

      if (!video.paused && !video.ended) {
        const cur = video.currentTime;
        if (cur > 0 && Math.abs(cur - lastObservedTime) < 0.03) {
          freezeCycles++;
          if (freezeCycles >= 8) {
            // Video has been stationary for ~10s while unpaused
            freezeCycles = 0;
            if (activeHls) {
              try {
                activeHls.startLoad();
              } catch {}
            }
          }
        } else {
          lastObservedTime = cur;
          freezeCycles = 0;
        }
      }
    }, 1200);
  };

  const tryHls = (playbackUrl: string, engineLabel: PlayerEngineType, onFail: () => void) => {
    if (isDestroyed) return;
    cleanup();

    if (!Hls.isSupported()) {
      onFail();
      return;
    }

    onEngineChange?.(engineLabel);
    onStatusChange?.('connecting', 'Conectando...');

    // OPTIMIZED HLS CONFIGURATION FOR ZERO-FREEZE STABLE IPTV
    const hls = new Hls({
      // Deep Buffer configuration for 100% smooth playback without freezing or cuts
      maxBufferLength: 30,             // Buffer up to 30 seconds ahead
      maxMaxBufferLength: 60,         // Cap max buffer to 60 seconds
      maxBufferSize: 60 * 1024 * 1024, // 60 MB memory buffer limit
      backBufferLength: 15,           // Retain 15s of played video

      // Tolerant live sync parameters
      liveSyncDurationCount: 4,        // Healthy 4-chunk (~12s) buffer from live edge
      liveMaxLatencyDurationCount: 15, // High latency tolerance before re-sync
      liveBufferLatencyChasing: false, // Disabling latency chasing prevents rapid seeks & cuts
      lowLatencyMode: false,          // Disabling low-latency mode prevents segment starvation

      // Gap handling & retries
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxStarvationDelay: 4,

      // Timeout tolerances
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 5,
      manifestLoadingRetryDelay: 500,
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 5,
      levelLoadingRetryDelay: 500,
      fragLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 500,

      enableWorker: true,              // Web worker demuxing offloads main thread for smooth frames
      autoStartLoad: true,
      capLevelToPlayerSize: false,
      xhrSetup: (xhr: any) => {
        xhr.withCredentials = false;
      },
    } as any);

    activeHls = hls;
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isDestroyed) return;
      hls.loadSource(playbackUrl);
      startWatchdog();
    });

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      if (isDestroyed) return;
      if (data && Array.isArray(data.levels) && data.levels.length > 0) {
        currentQualityLevels = data.levels.map((lvl, idx) => ({
          index: idx,
          height: lvl.height || 0,
          width: lvl.width || 0,
          bitrate: lvl.bitrate || 0,
          name: lvl.height ? `${lvl.height}p` : `Opción ${idx + 1}`,
        }));
        onLevelsLoaded?.(currentQualityLevels);
      }
      if (userPreferredLevel !== -1 && hls.currentLevel !== userPreferredLevel) {
        hls.currentLevel = userPreferredLevel;
      }
      video.play().catch((err) => {
        if (err?.name === 'AbortError') return;
        video.muted = true;
        video.play().catch((err2) => {
          if (err2?.name !== 'AbortError') {
            console.warn('[Hls.js] Play failed:', err2?.message);
          }
        });
      });
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      if (isDestroyed) return;
      const level = currentQualityLevels.find((l) => l.index === data.level);
      const name = level ? level.name : `${data.level}p`;
      onLevelChange?.(hls.autoLevelEnabled ? -1 : data.level, name);
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (isDestroyed) return;

      // 1. Non-fatal buffer stall recovery
      if (
        data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
        data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL
      ) {
        onStatusChange?.('buffering', 'Búfer...');
        try {
          hls.startLoad();
        } catch {}
        return;
      }

      if (data.response && (data.response.code === 401 || data.response.code === 403 || data.response.code === 404)) {
        console.warn(`[Hls.js] HTTP error code ${data.response.code}. Triggering candidate fallback...`);
        onFail();
        return;
      }

      // 2. Fatal errors
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn('[Hls.js] Fatal Network error. Reloading source...');
            try {
              hls.startLoad();
            } catch {}
            if (!hasReceivedPlaying) {
              onFail();
            }
            break;

          case Hls.ErrorTypes.MEDIA_ERROR:
            console.warn('[Hls.js] Fatal Media error. Performing recovery...');
            mediaRecoveryCount++;
            if (mediaRecoveryCount <= 2) {
              hls.recoverMediaError();
            } else if (mediaRecoveryCount === 3) {
              try {
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } catch {
                onFail();
              }
            } else {
              onFail();
            }
            break;

          default:
            console.warn('[Hls.js] Unrecoverable fatal error:', data.details);
            onFail();
            break;
        }
      }
    });

    fallbackTimer = setTimeout(() => {
      if (!hasReceivedPlaying && !isDestroyed) {
        console.warn('[Hls.js] Connection timeout reached (12s). Switching to fallback...');
        onFail();
      }
    }, 12000);
  };

  const tryMpegts = (playbackUrl: string, engineLabel: PlayerEngineType, onFail: () => void) => {
    if (isDestroyed) return;
    cleanup();

    if (!mpegts.isSupported()) {
      onFail();
      return;
    }

    // Never feed HLS playlists or MP4 video files to mpegts
    const urlLower = playbackUrl.toLowerCase();
    if (
      urlLower.includes('.m3u8') ||
      urlLower.includes('m3u') ||
      urlLower.includes('.mp4') ||
      urlLower.includes('.webm') ||
      urlLower.includes('.mkv')
    ) {
      onFail();
      return;
    }

    onEngineChange?.(engineLabel);
    onStatusChange?.('connecting', 'Conectando TS...');

    let hasFailed = false;
    const safeFail = (reason?: string) => {
      if (hasFailed || isDestroyed) return;
      hasFailed = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      setTimeout(() => {
        if (!hasReceivedPlaying && !isDestroyed) {
          console.warn(`[Mpegts] Fallback triggered (${reason || 'error'})`);
          onFail();
        }
      }, 25);
    };

    try {
      const player = mpegts.createPlayer(
        {
          type: 'mpegts',
          isLive: true,
          url: playbackUrl,
          cors: true,
        },
        {
          enableWorker: false,
          lazyLoad: false,
          stashInitialSize: 384 * 1024,
          enableStashBuffer: true,
          liveBufferLatencyChasing: false,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
        }
      );
      activeMpegts = player;
      patchMpegtsPlayer(player);

      player.attachMediaElement(video);
      player.load();
      startWatchdog();

      player.on(mpegts.Events.MEDIA_INFO, () => {
        if (isDestroyed || hasFailed) return;
        video.play().catch(() => {});
      });

      try {
        const playPromise = player.play();
        if (playPromise && typeof (playPromise as any).catch === 'function') {
          (playPromise as any).catch((err: any) => {
            if (err?.name === 'AbortError') return;
            if (video) {
              video.muted = true;
              try {
                const retryPromise = player.play();
                if (retryPromise && typeof (retryPromise as any).catch === 'function') {
                  (retryPromise as any).catch(() => {});
                }
              } catch {}
            }
          });
        }
      } catch {}

      player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
        if (isDestroyed || hasFailed) return;
        console.warn(`[Mpegts] Stream loader error: type=${errorType}, detail=${errorDetail}`, errorInfo);
        if (!hasReceivedPlaying) {
          safeFail(`${errorType}: ${errorDetail}`);
        }
      });

      fallbackTimer = setTimeout(() => {
        if (!hasReceivedPlaying && !isDestroyed) {
          console.warn('[Mpegts] Connection timeout reached (12s). Switching to fallback...');
          safeFail('timeout');
        }
      }, 12000);
    } catch (e: any) {
      console.warn('[Mpegts] Initialization failed:', e?.message);
      safeFail('init_error');
    }
  };

  const tryNative = (playbackUrl: string, onFail: () => void) => {
    if (isDestroyed) return;
    cleanup();
    onEngineChange?.('native');
    onStatusChange?.('connecting', 'Nativo...');

    video.src = playbackUrl;
    video.load();
    startWatchdog();

    const handleCanPlay = () => {
      video
        .play()
        .then(() => {
          onPlaying();
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          video.muted = true;
          video
            .play()
            .then(() => {
              onPlaying();
            })
            .catch(onFail);
        });
    };

    if (video.readyState >= 2) {
      handleCanPlay();
    } else {
      video.addEventListener('canplay', handleCanPlay, { once: true });
      video.addEventListener('loadedmetadata', handleCanPlay, { once: true });
      video.addEventListener('loadeddata', handleCanPlay, { once: true });
    }

    const nativeTimer = setTimeout(() => {
      if (!hasReceivedPlaying && !isDestroyed) {
        onFail();
      }
    }, 14000);

    fallbackTimer = nativeTimer;
  };

  const startPlayback = () => {
    hasReceivedPlaying = false;

    const attemptIndex = (idx: number) => {
      if (isDestroyed) return;
      if (idx >= urls.length) {
        onStatusChange?.('error', 'Señal no disponible (Canal caído / URL no válida)');
        return;
      }

      const currentUrl = urls[idx];
      const isProxy = currentUrl.includes('/api/proxy/stream');
      const isM3u8 = currentUrl.toLowerCase().includes('.m3u8') || currentUrl.toLowerCase().includes('m3u');
      const isTs = currentUrl.toLowerCase().includes('.ts') || currentUrl.toLowerCase().includes('mp2t');
      const isVodVideo =
        currentUrl.toLowerCase().includes('.mp4') ||
        currentUrl.toLowerCase().includes('.mkv') ||
        currentUrl.toLowerCase().includes('.webm') ||
        currentUrl.toLowerCase().includes('.avi') ||
        currentUrl.toLowerCase().includes('.mov') ||
        currentUrl.toLowerCase().includes('/movie/') ||
        currentUrl.toLowerCase().includes('/series/');

      if (isVodVideo && !isM3u8) {
        tryNative(currentUrl, () => {
          attemptIndex(idx + 1);
        });
      } else if (isM3u8) {
        tryHls(currentUrl, isProxy ? 'proxy-hls' : 'hls', () => {
          tryNative(currentUrl, () => {
            attemptIndex(idx + 1);
          });
        });
      } else if (isTs) {
        tryMpegts(currentUrl, isProxy ? 'proxy-ts' : 'mpegts', () => {
          tryHls(currentUrl, isProxy ? 'proxy-hls' : 'hls', () => {
            tryNative(currentUrl, () => {
              attemptIndex(idx + 1);
            });
          });
        });
      } else {
        tryHls(currentUrl, isProxy ? 'proxy-hls' : 'hls', () => {
          tryNative(currentUrl, () => {
            attemptIndex(idx + 1);
          });
        });
      }
    };

    attemptIndex(0);
  };

  startPlayback();

  return {
    destroy: () => {
      isDestroyed = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      cleanup();
    },
    reconnect: () => {
      cleanup();
      hasReceivedPlaying = false;
      onStatusChange?.('connecting', 'Reiniciando señal...');
      startPlayback();
    },
    retryWithProxy: () => {
      cleanup();
      hasReceivedPlaying = false;
      const proxy = `/api/proxy/stream?url=${encodeURIComponent(cleanUrl)}`;
      tryHls(proxy, 'proxy-hls', () => {
        onStatusChange?.('playing');
      });
    },
    retryWithEngine: (engine: PlayerEngineType) => {
      cleanup();
      hasReceivedPlaying = false;
      if (engine === 'mpegts' || engine === 'proxy-ts') {
        tryMpegts(cleanUrl, engine, () => {});
      } else {
        tryHls(cleanUrl, 'hls', () => {});
      }
    },
    getLevels: () => currentQualityLevels,
    getCurrentLevel: () => (activeHls ? activeHls.currentLevel : -1),
    setLevel: (levelIndex: number) => {
      userPreferredLevel = levelIndex;
      if (activeHls) {
        activeHls.currentLevel = levelIndex;
      }
    },
  };
}