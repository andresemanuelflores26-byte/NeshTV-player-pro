import { UserAccount, ChannelItem, VodItem, IPTVPlaylist } from '../types/index.ts';

const LS_USERS_KEY = 'neshtv_fs_users';
const LS_PLAYLISTS_KEY = 'neshtv_fs_playlists';
const LS_CHANNELS_KEY = 'neshtv_fs_channels';
const LS_VOD_KEY = 'neshtv_fs_vod';

function getLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocal<T>(key: string, data: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export async function fetchUsersFromFirestore(): Promise<UserAccount[]> {
  try {
    const res = await fetch('/api/admin/data');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users)) {
        setLocal(LS_USERS_KEY, data.users);
        return data.users;
      }
    }
  } catch {}
  return getLocal<UserAccount>(LS_USERS_KEY);
}

export async function saveUserToFirestore(user: UserAccount): Promise<boolean> {
  const current = getLocal<UserAccount>(LS_USERS_KEY);
  const updated = [user, ...current.filter((u) => u.id !== user.id)];
  setLocal(LS_USERS_KEY, updated);

  try {
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    return true;
  } catch {
    return true;
  }
}

export async function deleteUserFromFirestore(id: string): Promise<boolean> {
  const current = getLocal<UserAccount>(LS_USERS_KEY);
  setLocal(LS_USERS_KEY, current.filter((u) => u.id !== id));

  try {
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    return true;
  } catch {
    return true;
  }
}

export async function fetchPlaylistsFromFirestore(): Promise<IPTVPlaylist[]> {
  try {
    const res = await fetch('/api/admin/data');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.playlists)) {
        setLocal(LS_PLAYLISTS_KEY, data.playlists);
        return data.playlists;
      }
    }
  } catch {}
  return getLocal<IPTVPlaylist>(LS_PLAYLISTS_KEY);
}

export async function savePlaylistToFirestore(pl: IPTVPlaylist): Promise<boolean> {
  const current = getLocal<IPTVPlaylist>(LS_PLAYLISTS_KEY);
  const updated = [pl, ...current.filter((p) => p.id !== pl.id)];
  setLocal(LS_PLAYLISTS_KEY, updated);

  try {
    await fetch('/api/admin/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pl),
    });
    return true;
  } catch {
    return true;
  }
}

export async function deletePlaylistFromFirestore(id: string): Promise<boolean> {
  const current = getLocal<IPTVPlaylist>(LS_PLAYLISTS_KEY);
  setLocal(LS_PLAYLISTS_KEY, current.filter((p) => p.id !== id));

  try {
    await fetch(`/api/admin/playlists/${id}`, { method: 'DELETE' });
    return true;
  } catch {
    return true;
  }
}

export async function fetchChannelsFromFirestore(): Promise<ChannelItem[]> {
  try {
    const res = await fetch('/api/admin/data');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.channels)) {
        setLocal(LS_CHANNELS_KEY, data.channels);
        return data.channels;
      }
    }
  } catch {}
  return getLocal<ChannelItem>(LS_CHANNELS_KEY);
}

export async function saveChannelToFirestore(channel: ChannelItem): Promise<boolean> {
  const current = getLocal<ChannelItem>(LS_CHANNELS_KEY);
  const updated = [channel, ...current.filter((c) => c.id !== channel.id)];
  setLocal(LS_CHANNELS_KEY, updated);

  try {
    await fetch('/api/admin/channels/add-custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: channel.name,
        url: channel.url || channel.streamUrl,
        category: channel.category,
        logo: channel.logo,
      }),
    });
    return true;
  } catch {
    return true;
  }
}

export async function fetchVodFromFirestore(): Promise<VodItem[]> {
  try {
    const res = await fetch('/api/admin/data');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.vod)) {
        setLocal(LS_VOD_KEY, data.vod);
        return data.vod;
      }
    }
  } catch {}
  return getLocal<VodItem>(LS_VOD_KEY);
}

export async function saveVodToFirestore(item: VodItem): Promise<boolean> {
  const current = getLocal<VodItem>(LS_VOD_KEY);
  const updated = [item, ...current.filter((v) => v.id !== item.id)];
  setLocal(LS_VOD_KEY, updated);

  try {
    await fetch('/api/admin/vod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return true;
  } catch {
    return true;
  }
}

export function removeChannelFromLocal(id: string) {
  const current = getLocal<ChannelItem>(LS_CHANNELS_KEY);
  setLocal(LS_CHANNELS_KEY, current.filter((c) => c.id !== id));
}

export function removeChannelsBatchFromLocal(ids: string[]) {
  const idSet = new Set(ids);
  const current = getLocal<ChannelItem>(LS_CHANNELS_KEY);
  setLocal(LS_CHANNELS_KEY, current.filter((c) => !idSet.has(c.id)));
}

export function clearLocalChannels() {
  setLocal(LS_CHANNELS_KEY, []);
}

export function removeVodFromLocal(id: string) {
  const current = getLocal<VodItem>(LS_VOD_KEY);
  setLocal(LS_VOD_KEY, current.filter((v) => v.id !== id));
}

export function removeVodBatchFromLocal(ids: string[]) {
  const idSet = new Set(ids);
  const current = getLocal<VodItem>(LS_VOD_KEY);
  setLocal(LS_VOD_KEY, current.filter((v) => !idSet.has(v.id)));
}

export function clearLocalVod() {
  setLocal(LS_VOD_KEY, []);
}

