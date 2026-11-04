import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  Settings,
  ShieldCheck,
  Tv,
  X,
  Activity,
  Radio,
  RotateCcw,
  RotateCw,
  Cpu,
  Wifi,
  Sparkles,
  Zap
} from 'lucide-react';
import { StreamEngine } from '../../types';

interface StreamPlayerProps {
  title: string;
  category?: string;
  streamUrl: string;
  onClose?: () => void;
  isProVip?: boolean;
  initialEngine?: StreamEngine;
  isVod?: boolean;
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  title,
  category,
  streamUrl,
  onClose,
  isProVip = false,
  initialEngine,
  isVod: propIsVod,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsPlayerRef = useRef<any>(null);

  // Clean URL inspection
  const cleanUrl = (streamUrl || '').split('?')[0].toLowerCase();
  const isDirectVideo =
    propIsVod ||
    cleanUrl.endsWith('.mp4') ||
    cleanUrl.endsWith('.m4p') ||
    cleanUrl.endsWith('.mkv') ||
    cleanUrl.endsWith('.avi') ||
    cleanUrl.endsWith('.webm') ||
    cleanUrl.endsWith('.mov') ||
    cleanUrl.endsWith('.mp3');
  const isTsStream = cleanUrl.endsWith('.ts');

  // Engine state (defaults to 'native' for VOD, 'mpegts' for .ts streams, 'proxy-hls' for live)
  const [engine, setEngine] = useState<StreamEngine>(
    initialEngine || (isDirectVideo ? 'native' : (isTsStream ? 'mpegts' : 'proxy-hls'))
  );

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | 'fill' | 'original'>('16:9');
  const [bufferSeconds, setBufferSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('Conectando señal...');
  const [showSettings, setShowSettings] = useState(false);
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(-1);
  const [hasError, setHasError] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);

  // TV Box Mode: Low-RAM preset (8MB RAM, 8s buffer, safe for Android 6 TV Box with 1GB RAM)
  const [tvBoxLowRamMode, setTvBoxLowRamMode] = useState(true);

  // VOD Timeline tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(!isDirectVideo);

  // Watchdog references
  const lastTimeRef = useRef<number>(0);
  const freezeDurationRef = useRef<number>(0);
  const fallbackAttemptedRef = useRef(false);

  // Component mount lifecycle tracker to prevent playing on unmounted media
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isPlayInterrupted = (video: HTMLVideoElement | null, err?: any) => {
    if (!isMountedRef.current || !video || !document.body.contains(video)) {
      return true;
    }
    if (!err) return false;
    const name = err.name || '';
    const msg = err.message || '';
    return (
      name === 'AbortError' ||
      msg.includes('interrupted') ||
      msg.includes('removed from the document') ||
      msg.includes('new load request')
    );
  };

  // Robust play starter: starts muted by default for instant autoplay across all browsers and TV boxes
  const startPlayback = () => {
    const video = videoRef.current;
    if (!video || !isMountedRef.current || !document.body.contains(video)) return;

    // Start muted for instant autoplay compliance
    video.muted = true;
    if (isMountedRef.current) setIsMuted(true);

    const executePlay = () => {
      if (!video || !isMountedRef.current || !document.body.contains(video)) return;

      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              if (!isMountedRef.current) return;
              setIsPlaying(true);
              setStatusMessage('Reproduciendo (Audio silenciado - Haz clic para activar)');
            })
            .catch((err) => {
              if (!isMountedRef.current || !document.body.contains(video)) return;

              // If interrupted by a new segment/load request, wait for data ready and retry seamlessly
              if (
                err?.name === 'AbortError' ||
                err?.message?.includes('interrupted') ||
                err?.message?.includes('new load request')
              ) {
                const onCanPlay = () => {
                  video.removeEventListener('canplay', onCanPlay);
                  video.removeEventListener('loadeddata', onCanPlay);
                  executePlay();
                };
                video.addEventListener('canplay', onCanPlay, { once: true });
                video.addEventListener('loadeddata', onCanPlay, { once: true });
                return;
              }

              if (isMountedRef.current) {
                setIsPlaying(false);
                setStatusMessage('Toca la pantalla o presiona OK para reproducir');
              }
            });
        }
      } catch (_) {}
    };

    if (video.readyState >= 2) {
      executePlay();
    } else {
      const onReady = () => {
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('loadeddata', onReady);
        executePlay();
      };
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('loadeddata', onReady, { once: true });
      executePlay();
    }
  };

  // Determine effective URL based on engine and mixed-content restrictions
  const getEffectiveUrl = (eng: StreamEngine, rawUrl: string) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/api/proxy/stream')) return rawUrl;

    if (eng === 'proxy-ts') {
      return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}&raw=1`;
    }
    if (eng === 'proxy-hls') {
      if (isTsStream) {
        return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}&format=m3u8`;
      }
      return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}`;
    }
    if (eng === 'hls') {
      if (isTsStream) {
        return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}&format=m3u8`;
      }
      return rawUrl;
    }
    if (eng === 'native') {
      if (rawUrl.startsWith('http://')) {
        return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}`;
      }
      return rawUrl;
    }
    return `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}`;
  };

  // Main playback setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);
    fallbackAttemptedRef.current = false;
    setStatusMessage(`Cargando motor ${engine.toUpperCase()}...`);

    // Clean up previous HLS and mpegts instances
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (_) {}
      hlsRef.current = null;
    }
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.destroy();
      } catch (_) {}
      mpegtsPlayerRef.current = null;
    }

    const effectiveUrl = getEffectiveUrl(engine, streamUrl);

    // 1. DIRECT VOD FILES OR NATIVE ENGINE
    if (engine === 'native' || isDirectVideo) {
      setIsLiveStream(false);
      video.src = effectiveUrl;
      video.load();
      startPlayback();
      return;
    }

    // 2. MPEG-TS ENGINE (mpegts.js for raw .ts streams)
    if (engine === 'mpegts' && mpegts.getFeatureList().mseLivePlayback) {
      const tsUrl = getEffectiveUrl('proxy-ts', streamUrl);
      const urlLower = tsUrl.toLowerCase();
      if (urlLower.includes('.m3u8') || urlLower.includes('m3u') || urlLower.includes('.mp4') || urlLower.includes('.mkv')) {
        setEngine('proxy-hls');
        return;
      }
      const mpegPlayer = mpegts.createPlayer({
        type: 'mse',
        isLive: true,
        url: tsUrl,
        cors: true,
      }, {
        liveBufferLatencyChasing: false,
        maxBufferLength: 30,
        maxBufferSize: 60 * 1024 * 1024,
        stashInitialSize: 1024 * 512,
      } as any);
      mpegtsPlayerRef.current = mpegPlayer;
      mpegPlayer.attachMediaElement(video);
      mpegPlayer.load();
      startPlayback();
      setStatusMessage('Reproductor MPEG-TS (mpegts.js) conectado.');

      mpegPlayer.on(mpegts.Events.ERROR, (_eventType: string, _errorDetail: string) => {
        if (!fallbackAttemptedRef.current) {
          fallbackAttemptedRef.current = true;
          setStatusMessage('Cambiando a motor HLS Proxy...');
          setEngine('proxy-hls');
        } else {
          setHasError(true);
          setStatusMessage('Error en flujo MPEG-TS.');
        }
      });
      return;
    }

    // 3. HLS.JS ENGINE (Adaptive Zero-Freeze Deep Buffer)
    if ((engine === 'hls' || engine === 'proxy-hls') && Hls.isSupported()) {
      // Configuration tailored for Android 6 TV Box (Low RAM) vs High Performance
      const hlsConfig: any = tvBoxLowRamMode
        ? {
            // TV Box Low-RAM Profile (1GB/2GB RAM, Android 6.0/7.0)
            maxBufferLength: 8,             // 8s ahead buffer
            maxMaxBufferLength: 15,         // 15s absolute max
            maxBufferSize: 8 * 1024 * 1024, // 8 MB RAM max
            backBufferLength: 4,            // 4s back buffer
            liveSyncDurationCount: 3,       // 3 segments live sync
            liveMaxLatencyDurationCount: 8,
            liveBufferLatencyChasing: false,
            lowLatencyMode: false,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 3,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 5,
            levelLoadingTimeOut: 15000,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 6,
            enableWorker: false,            // Safer for older Android 6 WebViews
            autoStartLoad: true,
          }
        : {
            // Standard / High-Spec Profile (Exact requested buffer & anti-freeze config)
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 60 * 1024 * 1024, // 60 MB RAM cache
            backBufferLength: 15,
            liveSyncDurationCount: 4,
            liveMaxLatencyDurationCount: 15,
            liveBufferLatencyChasing: false, // Desactivado
            lowLatencyMode: false,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 4,
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 5,
            levelLoadingTimeOut: 15000,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 6,
            enableWorker: true,
            autoStartLoad: true,
          };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setStatusMessage('Señal conectada. Búfer listo.');
        setIsLiveStream(data.levels[0]?.details?.live ?? true);
        startPlayback();

        if (data.audioTracks && data.audioTracks.length > 0) {
          setAudioTracks(data.audioTracks.map((t, idx) => ({ id: idx, name: t.name || `Pista ${idx + 1}` })));
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        const v = videoRef.current;
        if (v && v.paused && isMountedRef.current) {
          startPlayback();
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT || data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
          console.warn('[StreamPlayer] Non-fatal frag load timeout/error, retrying...');
          hls.startLoad();
          return;
        }
        if (data.fatal) {
          console.warn('[StreamPlayer] Fatal HLS error:', data.type, data.details);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!fallbackAttemptedRef.current && engine === 'hls') {
                fallbackAttemptedRef.current = true;
                setStatusMessage('Conectando vía Proxy Anti-Corte...');
                setEngine('proxy-hls');
              } else if (!fallbackAttemptedRef.current && engine !== 'proxy-hls') {
                fallbackAttemptedRef.current = true;
                setStatusMessage('Conectando vía Proxy Anti-Corte...');
                setEngine('proxy-hls');
              } else {
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setStatusMessage('Resincronizando audio/video...');
              hls.recoverMediaError();
              break;
            default:
              hls.startLoad();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS for Safari / WebKit
      video.src = effectiveUrl;
      startPlayback();
      setStatusMessage('Reproducción nativa WebKit.');
    } else {
      // Fallback Direct HTML5
      video.src = effectiveUrl;
      startPlayback();
      setStatusMessage('Reproducción directa.');
    }

    return () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (_) {}
        hlsRef.current = null;
      }
      if (mpegtsPlayerRef.current) {
        try {
          mpegtsPlayerRef.current.destroy();
        } catch (_) {}
        mpegtsPlayerRef.current = null;
      }
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
      }
    };
  }, [streamUrl, engine, tvBoxLowRamMode]);

  // SILENT WATCHDOG CLOCK (Every 1000ms inspects buffer & rescues frozen video)
  useEffect(() => {
    const watchdogInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      // Update current time & duration for VOD
      if (video.duration && !isNaN(video.duration) && video.duration !== Infinity) {
        setDuration(video.duration);
        setCurrentTime(video.currentTime);
        setIsLiveStream(false);
      } else {
        setIsLiveStream(true);
      }

      // Calculate buffer seconds ahead
      if (video.buffered && video.buffered.length > 0) {
        const cTime = video.currentTime;
        let foundBuffer = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= cTime && video.buffered.end(i) >= cTime) {
            foundBuffer = video.buffered.end(i) - cTime;
            break;
          }
        }
        setBufferSeconds(Math.round(foundBuffer));
      }

      // Detect Freeze: currentTime stagnant for > 3.5s while playing
      if (!video.paused && !video.ended) {
        if (video.currentTime === lastTimeRef.current && video.readyState < 3) {
          freezeDurationRef.current += 1000;
          if (freezeDurationRef.current >= 3500) {
            setStatusMessage('Rescatando señal automáticamente...');
            if (hlsRef.current) {
              hlsRef.current.startLoad();
            } else {
              video.play().catch(() => {});
            }
            setRecoveryCount(prev => {
              const nextCount = prev + 1;
              if (nextCount >= 2) {
                setStatusMessage('Señal caída detectada. Cambiando motor de respaldo...');
                setEngine(prevEng => {
                  const ladder: Record<StreamEngine, StreamEngine> = {
                    'hls': 'proxy-hls',
                    'proxy-hls': 'proxy-ts',
                    'proxy-ts': 'native',
                    'native': 'proxy-hls',
                    'mpegts': 'proxy-hls',
                    'exoplayer': 'proxy-hls',
                  };
                  return ladder[prevEng] || 'proxy-hls';
                });
                return 0;
              }
              return nextCount;
            });
            freezeDurationRef.current = 0;
          }
        } else {
          lastTimeRef.current = video.currentTime;
          freezeDurationRef.current = 0;
        }
      }
    }, 1000);

    return () => clearInterval(watchdogInterval);
  }, []);

  // TV REMOTE KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Ignore if user is typing in an input
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (
        e.key === ' ' ||
        e.key === 'k' ||
        e.key === 'Enter' ||
        e.keyCode === 13 ||
        e.keyCode === 23
      ) {
        e.preventDefault();
        togglePlay();
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (!isLiveStream && duration > 0) {
            e.preventDefault();
            seekRelative(-10);
          }
          break;
        case 'ArrowRight':
          if (!isLiveStream && duration > 0) {
            e.preventDefault();
            seekRelative(10);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
        case 'Backspace':
          if (onClose) {
            e.preventDefault();
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, volume, duration, isLiveStream, onClose]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !isMountedRef.current || !document.body.contains(video)) return;

    if (video.paused) {
      if (video.muted && isMuted) {
        video.muted = false;
        setIsMuted(false);
      }
      try {
        const p = video.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (isMountedRef.current) setIsPlaying(true);
          }).catch((err) => {
            if (isPlayInterrupted(video, err)) return;
            if (err.name === 'NotAllowedError' && isMountedRef.current && document.body.contains(video)) {
              video.muted = true;
              if (isMountedRef.current) setIsMuted(true);
              video.play()
                ?.then(() => {
                  if (isMountedRef.current) setIsPlaying(true);
                })
                .catch((e) => {
                  if (isPlayInterrupted(video, e)) return;
                  if (isMountedRef.current) setIsPlaying(false);
                });
            } else if (isMountedRef.current) {
              setIsPlaying(false);
            }
          });
        }
      } catch (_) {}
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const adjustVolume = (delta: number) => {
    const newVol = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video || isLiveStream || !duration) return;
    const target = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = target;
    setCurrentTime(target);
  };

  const handleTimelineSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const target = parseFloat(e.target.value);
    video.currentTime = target;
    setCurrentTime(target);
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('player-container');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const changeAudioTrack = (trackId: number) => {
    setSelectedAudioTrack(trackId);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getAspectClass = () => {
    switch (aspectRatio) {
      case '4:3':
        return 'aspect-[4/3] object-fill';
      case 'fill':
        return 'w-full h-full object-cover';
      case 'original':
        return 'max-w-full max-h-full object-contain';
      default:
        return 'aspect-video object-contain';
    }
  };

  return (
    <div
      id="player-container"
      onClick={togglePlay}
      className="relative w-full h-full min-h-[420px] bg-black flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800 shadow-2xl group select-none cursor-pointer"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className={`w-full h-full transition-all duration-200 ${getAspectClass()}`}
        playsInline
        preload="auto"
        onPlay={() => {
          if (isMountedRef.current) setIsPlaying(true);
        }}
        onPause={() => {
          if (isMountedRef.current) setIsPlaying(false);
        }}
        onError={() => {
          console.warn('[StreamPlayer] Video element error encountered, auto-rotating engine...');
          setEngine(prev => {
            const ladder: Record<StreamEngine, StreamEngine> = {
              'proxy-hls': 'hls',
              'hls': 'proxy-ts',
              'proxy-ts': 'mpegts',
              'mpegts': 'native',
              'native': 'proxy-hls',
              'exoplayer': 'proxy-hls',
            };
            return ladder[prev] || 'native';
          });
        }}
        onTimeUpdate={() => {
          if (videoRef.current && duration > 0) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
        }}
      />

      {/* Central Big Play/Resume Overlay when paused or initial */}
      {!isPlaying && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs cursor-pointer group/play"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="w-20 h-20 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl transform group-hover/play:scale-110 active:scale-95 transition-all border-4 border-amber-300/40 tv-focusable"
            title="Reproducir Canal"
          >
            <Play className="w-10 h-10 ml-1.5 fill-current" />
          </button>
          <span className="mt-3 text-xs font-bold text-white tracking-wide bg-slate-950/90 px-4 py-1.5 rounded-full border border-slate-700 shadow-lg">
            TOCA O PRESIONA OK PARA REPRODUCIR
          </span>
        </div>
      )}

      {/* Floating Unmute Banner */}
      {isMuted && isPlaying && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute top-16 left-4 z-20 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-full text-xs shadow-xl animate-bounce tv-focusable"
          title="Activar Sonido"
        >
          <VolumeX className="w-4 h-4" />
          <span>Audio silenciado · Toca para activar</span>
        </button>
      )}

      {/* Top Overlay Banner (Title, VIP, Engine & TV Box Info) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between z-20 opacity-100 transition-opacity duration-300"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1 rounded-full">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              {isProVip ? '⚡ VIP Directo' : (category || (isLiveStream ? 'Canal en Vivo' : 'Película VOD'))}
            </span>
          </div>
          <h2 className="text-base font-bold text-white tracking-wide truncate max-w-sm sm:max-w-md">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Buffer Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 font-mono">Búfer:</span>
            <span className="font-mono font-bold text-emerald-400">{bufferSeconds}s</span>
          </div>

          {/* Low-RAM TV Box Preset Badge / Toggle */}
          <button
            onClick={() => setTvBoxLowRamMode(!tvBoxLowRamMode)}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors tv-focusable ${
              tvBoxLowRamMode
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Optimización para TV Box con 1GB/2GB RAM"
          >
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>{tvBoxLowRamMode ? 'Modo TV Box (8MB)' : 'Modo Full (40MB)'}</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-amber-400 transition-colors tv-focusable"
            title="Ajustes de Motor"
          >
            <Settings className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-800 text-rose-200 hover:text-white transition-colors tv-focusable"
              title="Cerrar Reproductor"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute top-16 right-4 z-30 w-84 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl text-xs space-y-4 max-w-[90vw]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4" /> Ajustes del Reproductor
            </span>
            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Engine Selector */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Motor de Transmisión Smarters:</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'hls', label: 'HLS.js (Directo)' },
                { id: 'proxy-hls', label: 'Proxy HLS Anti-Bloqueo' },
                { id: 'mpegts', label: 'MPEG-TS (mpegts.js)' },
                { id: 'proxy-ts', label: 'Proxy MPEG-TS' },
                { id: 'native', label: 'HTML5 Nativo' },
              ].map(eng => (
                <button
                  key={eng.id}
                  onClick={() => {
                    setEngine(eng.id as StreamEngine);
                    setShowSettings(false);
                  }}
                  className={`px-2.5 py-2 rounded-xl text-left border text-xs font-semibold transition-colors tv-focusable ${
                    engine === eng.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {eng.label}
                </button>
              ))}
            </div>
          </div>

          {/* TV Box Performance Profile */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Aceleración TV Box</span>
                <span className="text-[10px] text-slate-400">Para TV Box Android 6/7 con 1GB RAM</span>
              </div>
              <button
                onClick={() => setTvBoxLowRamMode(!tvBoxLowRamMode)}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  tvBoxLowRamMode ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tvBoxLowRamMode ? 'ACTIVADO' : 'DESACTIVADO'}
              </button>
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">Relación de Aspecto:</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['16:9', '4:3', 'fill', 'original'] as const).map(ar => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`py-1.5 rounded-lg text-center border uppercase font-medium tv-focusable ${
                    aspectRatio === ar
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Tracks if available */}
          {audioTracks.length > 0 && (
            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">Pista de Audio:</label>
              <select
                value={selectedAudioTrack}
                onChange={(e) => changeAudioTrack(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none"
              >
                <option value={-1}>Predeterminado</option>
                {audioTracks.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
            <span>Búfer Resiliente Anti-Cortes</span>
            <span className="text-emerald-400 font-bold">{tvBoxLowRamMode ? '8MB / 8s' : '40MB / 30s'}</span>
          </div>
        </div>
      )}



      {/* Bottom Control Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2 z-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300"
      >
        {/* VOD Progress Scrubber Timeline (Only for Películas & Series with duration) */}
        {!isLiveStream && duration > 0 && (
          <div className="space-y-1 py-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="1"
              value={currentTime}
              onChange={handleTimelineSeek}
              className="w-full accent-amber-500 bg-slate-800 h-2 rounded-lg cursor-pointer tv-focusable"
            />
          </div>
        )}

        {/* Status Line */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span className="flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            {statusMessage}
          </span>
          <span className="font-mono text-slate-500 text-[10px]">
            Motor: <strong className="text-amber-400">{engine.toUpperCase()}</strong> | Búfer: <span className="text-emerald-400">{bufferSeconds}s</span> | Rescatado: {recoveryCount}x
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all tv-focusable shadow-lg"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
            </button>

            {/* Jump -10s / +10s (For VOD) */}
            {!isLiveStream && duration > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => seekRelative(-10)}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 tv-focusable"
                  title="Retroceder 10s"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => seekRelative(10)}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 tv-focusable"
                  title="Adelantar 10s"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-slate-300 hover:text-amber-400 tv-focusable p-1">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 accent-amber-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer hidden sm:block tv-focusable"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Fast Engine Switcher Button */}
            <button
              onClick={() => {
                const ladder: Record<StreamEngine, StreamEngine> = {
                  'hls': 'proxy-hls',
                  'proxy-hls': 'native',
                  'native': 'proxy-ts',
                  'proxy-ts': 'hls',
                  'mpegts': 'hls',
                  'exoplayer': 'hls',
                };
                setEngine(ladder[engine] || 'hls');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-amber-400 flex items-center gap-1.5 tv-focusable"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Alternar Motor
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-amber-400 tv-focusable"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
