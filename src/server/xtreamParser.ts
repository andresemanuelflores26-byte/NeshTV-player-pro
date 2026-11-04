import { ChannelItem, VodItem } from '../types/index.ts';

export async function readXtreamContent(playlist: { url?: string; serverUrl?: string; username?: string; password?: string; type?: string; m3uUrl?: string }) {
  const channels: ChannelItem[] = [];
  const vod: VodItem[] = [];
  
  try {
    const targetUrl = playlist.url || playlist.m3uUrl || (playlist.serverUrl ? `${playlist.serverUrl}/get.php?username=${playlist.username}&password=${playlist.password}&type=m3u_plus` : '');
    if (!targetUrl) {
      return { channels, vod };
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();

    const lines = text.split('\n');
    let currentChannel: Partial<ChannelItem> = {};
    let currentVod: Partial<VodItem> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        // Parse attributes
        const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const nameMatch = line.split(',').pop() || '';

        const name = tvgNameMatch ? tvgNameMatch[1] : nameMatch.trim();
        const logo = tvgLogoMatch ? tvgLogoMatch[1] : '';
        const category = groupMatch ? groupMatch[1] : 'General';

        // Next line should be URL
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        if (nextLine && !nextLine.startsWith('#')) {
          const isMovie = category.toLowerCase().includes('pelicula') || category.toLowerCase().includes('movie' ) || category.toLowerCase().includes('vod') || nextLine.includes('.mp4') || nextLine.includes('.mkv');
          
          if (isMovie) {
            vod.push({
              id: `xtream_vod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              title: name,
              type: 'movie',
              category: category,
              year: 2026,
              rating: '8.5',
              poster: logo || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop',
              synopsis: `Contenido VOD importado desde lista ${playlist.url || 'Xtream'}`,
              url: nextLine,
              streamUrl: nextLine,
              isBlocked: false,
            });
          } else {
            channels.push({
              id: `xtream_ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              number: channels.length + 100,
              name: name,
              category: category,
              logo: logo || 'https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=200&h=200&fit=crop',
              url: nextLine,
              streamUrl: nextLine,
              resolution: '1080p',
              isBlocked: false,
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error reading Xtream/M3U playlist:', e);
  }

  return { channels, vod };
}
