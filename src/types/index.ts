export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  expiryDate: string; // YYYY-MM-DD
  status: 'active' | 'blocked' | 'suspended';
  notes?: string;
  assignedList?: 'all' | 'standard' | 'listapro';
  createdAt?: string;
  blockedChannels?: string[];
  maxConnections?: number;
  isAdmin?: boolean;
}

export type User = UserAccount & {
  expDate?: string;
};

export interface ChannelItem {
  id: string;
  number: number;
  name: string;
  category: string;
  logo: string;
  url: string;
  streamUrl?: string;
  resolution?: string;
  isBlocked?: boolean;
  isLocked?: boolean;
  playlistId?: string;
  isProVip?: boolean;
  epgNow?: {
    title: string;
    startTime: string;
    endTime: string;
    description: string;
  };
  epgNext?: {
    title: string;
    startTime: string;
    endTime: string;
    description: string;
  };
}

export type Channel = ChannelItem;

export interface Episode {
  id: string;
  title: string;
  seasonNumber?: number;
  season?: number;
  episodeNumber?: number;
  episode?: number;
  chapterName?: string;
  streamUrl?: string;
  url?: string;
  poster?: string;
  duration?: string;
}

export interface VodItem {
  id: string;
  playlistId?: string;
  title: string;
  type: 'movie' | 'series';
  category: string;
  year: number | string;
  rating: string;
  poster: string;
  backdrop?: string;
  synopsis: string;
  url?: string;
  streamUrl?: string;
  isBlocked?: boolean;
  isListaPro?: boolean;
  seasons?: number;
  seasonsCount?: number;
  episodes?: Episode[];
}

export interface IPTVPlaylist {
  id: string;
  name: string;
  type: 'm3u' | 'xtream' | 'm3u_url' | 'm3u_file';
  url: string;
  serverUrl?: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  channelCount: number;
  vodCount?: number;
  latencyMs?: number;
  status: 'working' | 'failed' | 'online' | 'offline' | 'untested';
  statusMessage?: string;
  lastSynced: string;
  lastTested?: string;
  expDate?: string;
  enableChannels?: boolean;
  enableMovies?: boolean;
  enableSeries?: boolean;
  enableLive?: boolean;
}

export type Playlist = IPTVPlaylist;

export interface FloatingMessage {
  id: string;
  text: string;
  sender: string;
  targetUserId: string;
  active: boolean;
  type: 'info' | 'warning' | 'alert' | 'marquee' | 'popup';
  createdAt?: string;
}

export type SystemAnnouncement = FloatingMessage;

export interface SupportNote {
  whatsappNumber: string;
  paymentInstructions: string;
  customMessage: string;
}

export interface PlayerSettings {
  bufferLength?: number;
  maxBufferSize?: number;
  lowLatency?: boolean;
  autoQuality?: boolean;
}

export interface DbData {
  users: UserAccount[];
  playlists: IPTVPlaylist[];
  channels: ChannelItem[];
  vod: VodItem[];
  vodItems?: VodItem[];
  listaProItems?: VodItem[];
  floatingMessage?: FloatingMessage;
  announcements?: FloatingMessage[];
  contactNote?: string;
  supportNote?: SupportNote;
  proVipChannels?: ChannelItem[];
}

export type StreamEngine = 'hls' | 'mpegts' | 'native' | 'proxy-hls' | 'proxy-ts' | 'exoplayer';
export type PlayerEngineType = 'hls' | 'mpegts' | 'native' | 'proxy' | 'proxy-hls' | 'proxy-ts' | 'exoplayer';
