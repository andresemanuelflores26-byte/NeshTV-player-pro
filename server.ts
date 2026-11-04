import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { StorageService } from './src/server/storage.ts';
import { readXtreamContent } from './src/server/xtreamParser.ts';
import { DEFAULT_CHANNELS } from './src/data/defaultChannels.ts';
import { ChannelItem } from './src/types/index.ts';

// Ignore invalid/self-signed SSL certificates for IPTV upstream servers
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const storage = StorageService.getInstance();

  app.use(compression());

  const getAvailableChannelsWithDefaults = (dbChannels: ChannelItem[] = [], userBlockedSet = new Set<string>(), disabledChannelsPlaylists = new Set<string>()) => {
    const deletedChannelSet = new Set(storage.getDb().deletedChannelIds || []);
    return (dbChannels || []).filter(ch => {
      if (!ch || !ch.id) return false;
      if (deletedChannelSet.has(ch.id)) return false;
      if (ch.isBlocked || userBlockedSet.has(ch.id)) return false;
      if (ch.playlistId && disabledChannelsPlaylists.has(ch.playlistId)) return false;
      return true;
    });
  };

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS and pre-flight handling
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Public endpoint for login screen footer info
  app.get('/api/public/info', (req, res) => {
    try {
      res.json(storage.getPublicInfo());
    } catch (e) {
      res.json({ contactNote: 'Para soporte técnico o renovaciones, contáctanos vía WhatsApp.' });
    }
  });

  // Client authentication endpoint
  const loginHandler = (req: any, res: any) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
      }

      const authResult = storage.authenticateClient(username, password);
      if (!authResult.success) {
        return res.status(authResult.suspended ? 403 : 401).json({
          success: false,
          suspended: authResult.suspended || false,
          message: authResult.message || 'Credenciales inválidas',
        });
      }

      const user = authResult.user!;
      const db = storage.getDb();

      // FILTROS DE TILDES POR LISTA (Canales, Películas, Series)
      const playlists = db.playlists || [];
      const disabledChannelsPlaylists = new Set(playlists.filter(p => p.enableChannels === false).map(p => p.id));
      const disabledMoviesPlaylists = new Set(playlists.filter(p => p.enableMovies === false).map(p => p.id));
      const disabledSeriesPlaylists = new Set(playlists.filter(p => p.enableSeries === false).map(p => p.id));

      // Filter out channels that are blocked globally, by user, or disabled via playlist checkboxes
      const userBlockedSet = new Set(user.blockedChannels || []);
      const availableChannels = getAvailableChannelsWithDefaults(db.channels, userBlockedSet, disabledChannelsPlaylists);

      // Filter VOD / Movies & Series based on playlist checkboxes and deleted items
      const deletedVodSet = new Set(db.deletedVodIds || []);
      const availableVod = (db.vod || []).filter(v => {
        if (deletedVodSet.has(v.id)) return false;
        if (v.isBlocked) return false;
        if (v.playlistId) {
          const isSeries = v.type === 'series' || v.category?.toLowerCase().includes('serie');
          if (isSeries && disabledSeriesPlaylists.has(v.playlistId)) return false;
          if (!isSeries && disabledMoviesPlaylists.has(v.playlistId)) return false;
        }
        return true;
      }).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

      // Floating message for this user or all
      let activeMessage = null;
      if (db.floatingMessage?.active) {
        if (db.floatingMessage.targetUserId === 'all' || db.floatingMessage.targetUserId === user.id) {
          activeMessage = db.floatingMessage;
        }
      }

      const cleanUser = user.username.toLowerCase();
      const isAdmin = user.id === 'usr_admin';
      const adminToken = isAdmin ? 'nesh_admin_token_' + Date.now() : null;

      return res.json({
        success: true,
        isAdmin,
        adminToken,
        user: {
          id: user.id,
          username: user.username,
          expiryDate: user.expiryDate,
          status: user.status,
          notes: user.notes,
          assignedList: user.assignedList || 'all',
        },
        channels: availableChannels,
        vod: availableVod,
        listaProItems: db.listaProItems || [],
        contactNote: db.contactNote || '',
        floatingMessage: activeMessage,
        playerSettings: db.playerSettings,
      });
    } catch (err: any) {
      console.error('Error handling /api/auth/client-login:', err);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al procesar inicio de sesión',
      });
    }
  };

  app.post('/api/auth/client-login', loginHandler);
  app.post('/api/auth/login', loginHandler);

  // Client data refresh endpoint (fetches latest channels, VOD and settings for active user)
  app.post('/api/client/refresh', (req, res) => {
    try {
      const { username } = req.body || {};
      if (!username) {
        return res.status(400).json({ success: false, message: 'Usuario requerido' });
      }
      const db = storage.getDb();
      const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user || user.status === 'blocked') {
        return res.status(403).json({ success: false, message: 'Usuario no encontrado o suspendido' });
      }

      const playlists = db.playlists || [];
      const disabledChannelsPlaylists = new Set(playlists.filter(p => p.enableChannels === false).map(p => p.id));
      const disabledMoviesPlaylists = new Set(playlists.filter(p => p.enableMovies === false).map(p => p.id));
      const disabledSeriesPlaylists = new Set(playlists.filter(p => p.enableSeries === false).map(p => p.id));

      const userBlockedSet = new Set(user.blockedChannels || []);
      const availableChannels = getAvailableChannelsWithDefaults(db.channels, userBlockedSet, disabledChannelsPlaylists);

      const deletedVodSet = new Set(db.deletedVodIds || []);
      const availableVod = (db.vod || []).filter(v => {
        if (deletedVodSet.has(v.id)) return false;
        if (v.isBlocked) return false;
        if (v.playlistId) {
          const isSeries = v.type === 'series' || v.category?.toLowerCase().includes('serie');
          if (isSeries && disabledSeriesPlaylists.has(v.playlistId)) return false;
          if (!isSeries && disabledMoviesPlaylists.has(v.playlistId)) return false;
        }
        return true;
      }).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

      let activeMessage = null;
      if (db.floatingMessage?.active) {
        if (db.floatingMessage.targetUserId === 'all' || db.floatingMessage.targetUserId === user.id) {
          activeMessage = db.floatingMessage;
        }
      }

      const isAdmin = user.id === 'usr_admin';

      return res.json({
        success: true,
        isAdmin,
        user: {
          id: user.id,
          username: user.username,
          expiryDate: user.expiryDate,
          status: user.status,
          notes: user.notes,
          assignedList: user.assignedList || 'all',
        },
        channels: availableChannels,
        vod: availableVod,
        listaProItems: db.listaProItems || [],
        contactNote: db.contactNote || '',
        floatingMessage: activeMessage,
        playerSettings: db.playerSettings,
      });

    } catch (err) {
      console.error('Error in /api/client/refresh:', err);
      return res.status(500).json({ success: false, message: 'Error al actualizar datos' });
    }
  });

  // Admin authentication endpoint
  app.post('/api/auth/admin-login', (req, res) => {
    const { username, password } = req.body || {};
    const u = (username || 'admin').trim();
    const p = (password || '').trim();

    if (storage.authenticateAdmin(u, p)) {
      return res.json({
        success: true,
        token: 'nesh_admin_token_' + Date.now(),
        adminUser: 'admin',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Credenciales maestras incorrectas. Usa admin / Admin2026',
    });
  });

  // Direct Master Access endpoint for app owner (supports GET and POST)
  const handleMasterAccess = (_req: express.Request, res: express.Response) => {
    return res.json({
      success: true,
      token: 'nesh_admin_token_' + Date.now(),
      adminUser: 'admin',
    });
  };
  app.post('/api/auth/master-access', handleMasterAccess);
  app.get('/api/auth/master-access', handleMasterAccess);

  // Admin: Get all data
  app.get('/api/admin/data', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && !authHeader.includes('nesh_admin_token_') && !authHeader.includes('Bearer')) {
        return res.status(401).json({ error: 'Acceso no autorizado' });
      }

      const db = storage.getDb();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      const deletedChs = new Set(db.deletedChannelIds || []);
      const deletedVods = new Set(db.deletedVodIds || []);
      const filteredChannels = (db.channels || []).filter(c => !deletedChs.has(c.id));
      const filteredVod = (db.vod || []).filter(v => !deletedVods.has(v.id));

      // Allow omitting VOD when client only needs channels and users (e.g. ?vod=false)
      if (req.query.vod === 'false' || req.query.lightweight === 'true') {
        return res.json({
          users: db.users || [],
          playlists: db.playlists || [],
          channels: filteredChannels,
          vod: [],
          listaProItems: db.listaProItems || [],
          contactNote: db.contactNote || '',
          floatingMessage: db.floatingMessage || { active: false, text: '' },
          playerSettings: db.playerSettings || { decoder: 'hardware', bufferSize: 20 },
        });
      }

      return res.json({
        ...db,
        channels: filteredChannels,
        vod: filteredVod,
      });
    } catch (err: any) {
      console.error('Error in /api/admin/data:', err);
      if (!res.headersSent) {
        return res.status(200).json({
          users: [],
          playlists: [],
          channels: [],
          vod: [],
          listaProItems: [],
          contactNote: '',
          floatingMessage: { active: false, text: '' },
          playerSettings: { decoder: 'hardware', bufferSize: 20 },
        });
      }
    }
  });

  // Admin: Create user
  app.post('/api/admin/users', (req, res) => {
    const { username, password, expiryDate, status, notes, blockedChannels } = req.body;
    if (!username || !password || !expiryDate) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    storage.addUser({
      id: `usr_${Date.now()}`,
      username,
      password,
      expiryDate,
      status: status || 'active',
      notes: notes || '',
      blockedChannels: blockedChannels || [],
    });
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Update user
  app.put('/api/admin/users/:id', (req, res) => {
    storage.updateUser({ id: req.params.id, ...req.body });
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Delete user
  app.delete('/api/admin/users/:id', (req, res) => {
    storage.deleteUser(req.params.id);
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Update playlist settings (enable/disable channels, movies, series)
  app.put('/api/admin/playlists/:id', (req, res) => {
    const plId = req.params.id;
    storage.updatePlaylist({ id: plId, ...req.body });
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Update contact note
  app.post('/api/admin/contact-note', (req, res) => {
    const { note } = req.body;
    if (typeof note !== 'string') {
      return res.status(400).json({ error: 'Nota requerida' });
    }
    storage.updateContactNote(note);
    storage.saveDb(storage.getDb());
    res.json({ success: true, contactNote: note });
  });

  // Admin: Update floating message
  app.post('/api/admin/floating-message', (req, res) => {
    storage.updateFloatingMessage(req.body);
    storage.saveDb(storage.getDb());
    res.json({ success: true, floatingMessage: req.body });
  });

  // Admin: Add Lista Pro item
  app.post('/api/admin/listapro', (req, res) => {
    const item = req.body;
    if (!item || !item.title || !item.url) {
      return res.status(400).json({ error: 'Título y URL requeridos' });
    }
    storage.addListaProItem(item);
    storage.saveDb(storage.getDb());
    res.json({ success: true, item });
  });

  // Admin: Delete Lista Pro item
  app.delete('/api/admin/listapro/:id', (req, res) => {
    storage.deleteListaProItem(req.params.id);
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Reset core channels
  app.post('/api/admin/reset-channels', (req, res) => {
    storage.resetCoreChannels();
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin & Client: Delete single channel
  app.delete(['/api/admin/channels/:id', '/api/client/channels/:id'], (req, res) => {
    try {
      const channelId = req.params.id;
      storage.deleteChannel(channelId);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, channelId });
    } catch (err: any) {
      console.error('Error deleting channel:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar canal' });
    }
  });

  // Admin & Client: Batch delete channels
  app.post(['/api/admin/channels/delete-batch', '/api/client/channels/delete-batch'], (req, res) => {
    try {
      const { channelIds } = req.body || {};
      if (!Array.isArray(channelIds) || channelIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de IDs de canales requerida' });
      }
      storage.deleteChannelsBatch(channelIds);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, count: channelIds.length, deletedIds: channelIds });
    } catch (err: any) {
      console.error('Error batch deleting channels:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar canales en lote' });
    }
  });

  // Admin & Client: Delete category folder of channels
  app.post(['/api/admin/channels/delete-category', '/api/client/channels/delete-category'], (req, res) => {
    try {
      const { category } = req.body || {};
      if (!category) {
        return res.status(400).json({ success: false, error: 'Nombre de categoría requerido' });
      }
      const count = storage.deleteChannelCategory(category);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, count, category });
    } catch (err: any) {
      console.error('Error deleting channel category:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar carpeta de canales' });
    }
  });

  // Admin & Client: Delete single VOD item (Movie or Series)
  app.delete(['/api/admin/vod/:id', '/api/client/vod/:id'], (req, res) => {
    try {
      const vodId = req.params.id;
      storage.deleteVod(vodId);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, vodId });
    } catch (err: any) {
      console.error('Error deleting VOD item:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar película/serie' });
    }
  });

  // Admin & Client: Batch delete VOD items (Movies or Series)
  app.post(['/api/admin/vod/delete-batch', '/api/client/vod/delete-batch'], (req, res) => {
    try {
      const { vodIds } = req.body || {};
      if (!Array.isArray(vodIds) || vodIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de IDs de películas/series requerida' });
      }
      storage.deleteVodBatch(vodIds);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, count: vodIds.length, deletedIds: vodIds });
    } catch (err: any) {
      console.error('Error batch deleting VOD items:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar películas/series en lote' });
    }
  });

  // Admin & Client: Delete category folder of VOD (Movies or Series)
  app.post(['/api/admin/vod/delete-category', '/api/client/vod/delete-category'], (req, res) => {
    try {
      const { category, type } = req.body || {};
      if (!category) {
        return res.status(400).json({ success: false, error: 'Nombre de categoría requerido' });
      }
      const count = storage.deleteVodCategory(category, type);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, count, category });
    } catch (err: any) {
      console.error('Error deleting VOD category:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al eliminar carpeta de VOD' });
    }
  });

  // Streaming Proxy for CORS, Mixed Content (HTTP on HTTPS) and Xtream/HLS bypass
  app.get('/api/proxy/stream', async (req, res) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).send('URL requerida');
    }

    try {
      try {
        const u = new URL(streamUrl);
        console.log(`[Proxy] Request received for host: ${u.host}, path: ${u.pathname.split('/').slice(0, 3).join('/')}/...`);
      } catch {
        console.log(`[Proxy] Request received`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const upstreamRes = await fetch(streamUrl, {
        headers: {
          'User-Agent': 'IPTVSmartersPro/5.1.0 (Linux; Android 7.1.2) VLC/3.5.4',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          ...(req.headers.range ? { Range: req.headers.range as string } : {}),
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);
      console.log(`[Proxy] Upstream status: ${upstreamRes.status}, Content-Type: ${upstreamRes.headers.get('content-type') || 'none'}`);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', '*');

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return res.status(upstreamRes.status).send(`Upstream returned HTTP ${upstreamRes.status}`);
      }

      const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('text/html')) {
        return res.status(502).send('Upstream returned HTML webpage instead of media stream');
      }

      if (upstreamRes.headers.get('content-length')) {
        res.setHeader('Content-Length', upstreamRes.headers.get('content-length')!);
      }
      if (upstreamRes.headers.get('content-range')) {
        res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
      }
      if (upstreamRes.headers.get('accept-ranges')) {
        res.setHeader('Accept-Ranges', upstreamRes.headers.get('accept-ranges')!);
      }

      const urlLower = streamUrl.toLowerCase();
      const upstreamEffectiveUrl = (upstreamRes.url || streamUrl).toLowerCase();

      const isVodFile =
        urlLower.includes('.mp4') ||
        urlLower.includes('.mkv') ||
        urlLower.includes('.avi') ||
        urlLower.includes('.mov') ||
        urlLower.includes('.webm') ||
        urlLower.includes('/movie/') ||
        urlLower.includes('/series/');

      const isM3u8ContentType =
        contentType.includes('mpegurl') ||
        contentType.includes('application/x-mpegurl') ||
        contentType.includes('vnd.apple.mpegurl');
      const isM3u8Url =
        !isVodFile &&
        (upstreamEffectiveUrl.includes('.m3u8') ||
          upstreamEffectiveUrl.includes('m3u') ||
          urlLower.includes('.m3u8') ||
          urlLower.includes('m3u'));

      const isLikelyM3u8 =
        !isVodFile &&
        (isM3u8ContentType || (isM3u8Url && !contentType.includes('video/mp2t')));

      if (isLikelyM3u8) {
        const text = await upstreamRes.text();
        const trimmed = text.trim();

        if (trimmed.includes('#EXTM3U') || trimmed.includes('#EXTINF')) {
          const effectiveUrl = upstreamRes.url || streamUrl;
          let origin = '';
          let baseUrl = '';
          try {
            const u = new URL(effectiveUrl);
            origin = u.origin;
            baseUrl = effectiveUrl.substring(0, effectiveUrl.lastIndexOf('/') + 1);
          } catch {
            origin = '';
            baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
          }

          const rewritten = text
            .split('\n')
            .map((line) => {
              const lineTrimmed = line.trim();
              if (!lineTrimmed) return line;

              if (lineTrimmed.startsWith('#')) {
                if (lineTrimmed.includes('URI=')) {
                  return line.replace(/URI=["']([^"']+)["']/g, (_match, uri) => {
                    let fullUri = uri;
                    if (!fullUri.startsWith('http://') && !fullUri.startsWith('https://')) {
                      fullUri = fullUri.startsWith('/') ? origin + fullUri : baseUrl + fullUri;
                    }
                    return `URI="/api/proxy/stream?url=${encodeURIComponent(fullUri)}"`;
                  });
                }
                return line;
              }

              let fullSegmentUrl = lineTrimmed;
              if (!fullSegmentUrl.startsWith('http://') && !fullSegmentUrl.startsWith('https://')) {
                fullSegmentUrl = fullSegmentUrl.startsWith('/') ? origin + fullSegmentUrl : baseUrl + fullSegmentUrl;
              }
              return `/api/proxy/stream?url=${encodeURIComponent(fullSegmentUrl)}`;
            })
            .join('\n');

          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.status(upstreamRes.status).send(rewritten);
        } else {
          res.setHeader('Content-Type', contentType || 'application/octet-stream');
          res.status(upstreamRes.status);
          return res.send(Buffer.from(text));
        }
      }

      const finalContentType = contentType && contentType.includes('video') ? contentType : (contentType.includes('audio') ? contentType : 'video/mp4');
      res.setHeader('Content-Type', finalContentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.status(upstreamRes.status);

      try {
        req.socket?.setNoDelay(true);
        res.socket?.setNoDelay(true);
      } catch {}

      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      if (upstreamRes.body) {
        res.status(upstreamRes.status);
        try {
          const nodeStream = Readable.fromWeb(upstreamRes.body as any);
          nodeStream.on('error', (err) => {
            console.warn('[Proxy stream error]:', err?.message);
            if (!res.headersSent) res.status(502).end();
            else res.end();
          });
          res.on('error', () => {
            try {
              nodeStream.destroy();
            } catch {}
          });
          req.on('close', () => {
            try {
              nodeStream.destroy();
            } catch {}
          });
          nodeStream.pipe(res);
        } catch {
          const buffer = await upstreamRes.arrayBuffer();
          res.send(Buffer.from(buffer));
        }
      } else {
        const buffer = await upstreamRes.arrayBuffer();
        res.status(upstreamRes.status).send(Buffer.from(buffer));
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).send('Error conectando con el flujo IPTV: ' + (err.message || 'Error'));
      }
    }
  });

  // Client refresh data endpoint
  app.get('/api/client/data', (req, res) => {
    try {
      const db = storage.getDb();
      const userId = req.query.userId as string;
      let blockedSet = new Set<string>();

      if (userId) {
        const user = db.users.find((u) => u.id === userId);
        if (user && user.blockedChannels) {
          blockedSet = new Set(user.blockedChannels);
        }
      }

      const playlists = db.playlists || [];
      const disabledChannelsPlaylists = new Set(playlists.filter(p => p.enableChannels === false).map(p => p.id));
      const disabledMoviesPlaylists = new Set(playlists.filter(p => p.enableMovies === false).map(p => p.id));
      const disabledSeriesPlaylists = new Set(playlists.filter(p => p.enableSeries === false).map(p => p.id));

      const activeChannels = getAvailableChannelsWithDefaults(db.channels, blockedSet, disabledChannelsPlaylists);

      const activeVod = (db.vod || []).filter((v) => {
        if (v.isBlocked) return false;
        if (v.playlistId) {
          const isSeries = v.type === 'series' || v.category?.toLowerCase().includes('serie');
          if (isSeries && disabledSeriesPlaylists.has(v.playlistId)) return false;
          if (!isSeries && disabledMoviesPlaylists.has(v.playlistId)) return false;
        }
        return true;
      }).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

      res.json({
        success: true,
        channels: activeChannels,
        vod: activeVod,
        contactNote: db.contactNote || '',
        floatingMessage: db.floatingMessage,
        playerSettings: db.playerSettings,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Error cargando datos de cliente' });
    }
  });

  // Admin: Test playlist URL connectivity
  app.post('/api/admin/playlists/test', async (req, res) => {
    const { url, username, password } = req.body || {};
    if (!url) {
      return res.status(400).json({ success: false, works: false, message: 'URL requerida para la prueba' });
    }

    try {
      const result = await readXtreamContent(url, username || '', password || '');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        works: false,
        message: 'Error inesperado al probar la URL: ' + (err.message || 'Error desconocido'),
      });
    }
  });

  // Admin: Sync playlist URL and import channels & VOD into database
  app.post('/api/admin/playlists/:id/sync', async (req, res) => {
    const plId = req.params.id;
    const db = storage.getDb();
    const playlist = db.playlists.find(p => p.id === plId);

    if (!playlist) {
      return res.status(404).json({ success: false, works: false, message: 'Lista no encontrada' });
    }

    try {
      const result = await readXtreamContent(playlist.url, playlist.username || '', playlist.password || '');

      if (result.works && result.channels.length > 0) {
        let channelsToImport = result.channels;
        let vodToImport = result.vod;

        if (playlist.enableChannels === false) channelsToImport = [];
        if (playlist.enableMovies === false) vodToImport = vodToImport.filter(item => item.type === 'series' || item.category?.toLowerCase().includes('serie'));
        if (playlist.enableSeries === false) vodToImport = vodToImport.filter(item => item.type !== 'series' && !item.category?.toLowerCase().includes('serie'));

        const imported = storage.importXtreamContent(
          channelsToImport,
          vodToImport,
          {
            playlistId: playlist.id,
            name: playlist.name,
            url: playlist.url,
            username: playlist.username,
            serverUrl: result.serverInfo?.url,
            status: result.userInfo?.status,
            expDate: result.userInfo?.expDate,
            latencyMs: result.latencyMs,
          },
          true
        );

        storage.saveDb(storage.getDb());

        return res.json({
          success: true,
          works: true,
          message: result.message,
          latencyMs: result.latencyMs,
          statusCode: result.statusCode || 200,
          stats: result.stats,
          playlist: imported.playlist,
          channelsCount: imported.channelsCount,
          vodCount: imported.vodCount,
        });
      } else {
        storage.setPlaylistStatus(playlist.id, 'failed', result.message, result.latencyMs);
        storage.saveDb(storage.getDb());
        return res.json({
          success: false,
          works: false,
          statusCode: result.statusCode || 0,
          latencyMs: result.latencyMs,
          message: result.message,
          errorDetail: result.errorDetail,
        });
      }
    } catch (err: any) {
      storage.setPlaylistStatus(playlist.id, 'failed', err.message || 'Error de sincronización');
      storage.saveDb(storage.getDb());
      return res.status(500).json({
        success: false,
        works: false,
        message: 'Fallo al sincronizar: ' + (err.message || 'Error'),
      });
    }
  });

  // Admin: Test any single channel or stream URL in real time
  app.post('/api/admin/channels/test-url', async (req, res) => {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ online: false, message: 'URL requerida' });
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const probeRes = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12) VLC/3.0.18',
          'Range': 'bytes=0-1024',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      res.json({
        online: probeRes.ok || probeRes.status === 206 || probeRes.status === 200,
        statusCode: probeRes.status,
        statusText: probeRes.statusText,
        latencyMs,
        contentType: probeRes.headers.get('content-type') || 'unknown',
        contentLength: probeRes.headers.get('content-length') || null,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      res.json({
        online: false,
        statusCode: 0,
        latencyMs,
        error: err.message || 'Error de conexión',
      });
    }
  });

  // Admin: Add direct/custom channel (PERSISTENCIA CORREGIDA)
  app.post('/api/admin/channels/add-custom', (req, res) => {
    try {
      const { name, url, category, logo } = req.body || {};
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ success: false, error: 'URL requerida' });
      }
      const newChannel = storage.addDirectChannel({
        id: `custom_ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        number: (storage.getDb().channels?.length || 0) + 1,
        name: (name || '').trim() || 'Canal Directo',
        url: url.trim(),
        category: (category || '').trim() || 'Canales Directos',
        logo: (logo || '').trim() || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80',
        resolution: '1080p Stream',
        isBlocked: false,
        epgNow: { title: name || 'Transmisión en Vivo', startTime: '00:00', endTime: '23:59', description: 'Canal directo' },
        epgNext: { title: 'Programación continua', startTime: '23:59', endTime: '06:00', description: 'Sin interrupciones' }
      });
      storage.saveDb(storage.getDb());
      return res.json({ success: true, channel: newChannel });
    } catch (err: any) {
      console.error('Error adding custom channel:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al guardar canal' });
    }
  });

  // Admin: Clear all channels and clean client accounts
  app.post('/api/admin/channels/clear-all', (req, res) => {
    try {
      storage.clearAllChannels();
      storage.saveDb(storage.getDb());
      return res.json({ success: true, message: 'Todos los canales han sido eliminados por completo y removidos de los usuarios.' });
    } catch (err: any) {
      console.error('Error clearing all channels:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al vaciar canales' });
    }
  });

  // Admin: Batch import channels from M3U (PERSISTENCIA CORREGIDA)
  app.post('/api/admin/channels/import-batch', (req, res) => {
    try {
      const { channels: channelsToImport } = req.body || {};
      if (!Array.isArray(channelsToImport) || channelsToImport.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de canales requerida' });
      }

      const formattedChannels = channelsToImport.map((item: any, idx: number) => ({
        id: `m3u_ch_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 4)}`,
        number: (storage.getDb().channels?.length || 0) + idx + 1,
        name: item.name || `Canal ${idx + 1}`,
        category: item.category || 'Canales M3U',
        logo: item.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80',
        url: item.url,
        resolution: '1080p Stream',
        isBlocked: false,
        epgNow: { title: item.name || 'En Vivo', startTime: '00:00', endTime: '23:59', description: 'Importado M3U' },
        epgNext: { title: 'Programación continua', startTime: '23:59', endTime: '06:00', description: 'Continuidad' }
      }));

      const added = storage.addMultipleChannels(formattedChannels);
      storage.saveDb(storage.getDb());

      return res.json({ success: true, count: added.length, channels: added });
    } catch (err: any) {
      console.error('Error batch importing channels:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al importar canales' });
    }
  });

  // Admin: Add playlist (with auto-sync support)
  app.post('/api/admin/playlists', async (req, res) => {
    try {
      const { name, type, url, username, password, active, autoSync } = req.body || {};
      if (!name || !url) {
        return res.status(400).json({ success: false, error: 'Nombre y URL requeridos' });
      }

      let channelCount = 0;
      let vodCount = 0;
      let initialStatus: 'working' | 'failed' | 'untested' = 'untested';
      let statusMessage = 'Guardado correctamente';
      let latencyMs: number | undefined;
      let probeResult: any = null;

      if (autoSync !== false) {
        try {
          const probe = await readXtreamContent(url, username || '', password || '');
          probeResult = probe;
          if (probe && probe.works) {
            channelCount = probe.channels?.length || 0;
            vodCount = probe.vod?.length || 0;
            initialStatus = 'working';
            statusMessage = probe.message || 'Sincronizado';
            latencyMs = probe.latencyMs;
          } else {
            initialStatus = 'failed';
            statusMessage = probe?.message || 'Lista guardada (sin conexión actual con el proveedor)';
            latencyMs = probe?.latencyMs;
          }
        } catch (probeErr: any) {
          initialStatus = 'failed';
          statusMessage = 'Lista guardada (error al verificar)';
        }
      }

      const pl = {
        id: `pl_${Date.now()}`,
        name,
        type: type || 'm3u',
        url,
        username: username || '',
        password: password || '',
        channelCount,
        active: active !== undefined ? active : true,
        status: initialStatus,
        statusMessage,
        latencyMs,
        vodCount,
        expDate: probeResult?.userInfo?.expDate,
        lastSynced: new Date().toISOString()
      };

      storage.addPlaylist(pl);

      if (probeResult && probeResult.works && probeResult.channels && probeResult.channels.length > 0) {
        try {
          storage.importXtreamContent(
            probeResult.channels,
            probeResult.vod || [],
            {
              playlistId: pl.id,
              name: pl.name,
              url: pl.url,
              username: pl.username,
              serverUrl: probeResult.serverInfo?.url,
              status: probeResult.userInfo?.status,
              expDate: probeResult.userInfo?.expDate,
              latencyMs: probeResult.latencyMs,
            },
            true
          );
        } catch {}
      }

      storage.saveDb(storage.getDb());

      return res.json({
        success: true,
        works: initialStatus === 'working',
        playlist: pl,
        syncResult: probeResult ? {
          success: probeResult.success,
          works: probeResult.works,
          message: probeResult.message,
          latencyMs: probeResult.latencyMs,
          stats: probeResult.stats,
          userInfo: probeResult.userInfo,
          serverInfo: probeResult.serverInfo,
        } : null,
      });
    } catch (err: any) {
      console.error('Error in /api/admin/playlists:', err);
      return res.status(200).json({ success: false, error: err?.message || 'Error al guardar lista' });
    }
  });

  // Admin: Delete playlist
  app.delete('/api/admin/playlists/:id', (req, res) => {
    storage.deletePlaylist(req.params.id);
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Toggle channel blocked state
  app.put('/api/admin/channels/:id/toggle', (req, res) => {
    const ch = storage.toggleChannelBlocked(req.params.id, req.body.blocked);
    storage.saveDb(storage.getDb());
    if (!ch) {
      return res.status(404).json({ error: 'Canal no encontrado' });
    }
    res.json({ success: true, channel: ch });
  });

  // Admin: Toggle entire category blocked state
  app.put('/api/admin/channels-category/toggle', (req, res) => {
    const { category, blocked } = req.body || {};
    if (!category) {
      return res.status(400).json({ error: 'Categoría requerida' });
    }
    const count = storage.toggleCategoryChannelsBlocked(category, Boolean(blocked));
    storage.saveDb(storage.getDb());
    res.json({ success: true, updatedCount: count });
  });

  // Admin: Toggle VOD blocked state
  app.put('/api/admin/vod/:id/toggle', (req, res) => {
    const item = storage.toggleVodBlocked(req.params.id, req.body.blocked);
    storage.saveDb(storage.getDb());
    if (!item) {
      return res.status(404).json({ error: 'Película/Serie no encontrada' });
    }
    res.json({ success: true, vod: item });
  });

  // Admin: Add custom VOD item (movie or series)
  app.post('/api/admin/vod', (req, res) => {
    try {
      const { title, url, type, category, year, rating, poster, backdrop, synopsis, seasons, episodesCount, episodes } = req.body || {};
      if (!title || (!url && (!episodes || episodes.length === 0))) {
        return res.status(400).json({ success: false, error: 'Título y URL o episodios requeridos' });
      }
      const newItem = {
        id: `vod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        url: url || (episodes && episodes[0]?.url) || '',
        type: type || 'movie',
        category: category || 'Películas Generales',
        year: Number(year) || 2026,
        rating: rating || '9.0',
        poster: poster || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80',
        backdrop: backdrop || '',
        synopsis: synopsis || '',
        isBlocked: false,
        seasons,
        episodesCount,
        episodes
      };
      storage.addVodItem(newItem);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, vodItem: newItem });
    } catch (err: any) {
      console.error('Error adding VOD item:', err);
      return res.status(500).json({ success: false, error: err.message || 'Error al agregar VOD' });
    }
  });

  // Admin: Save complete series with all its nested seasons and episodes
  app.post('/api/admin/vod/save-series', (req, res) => {
    try {
      const { title, category, year, rating, poster, backdrop, synopsis, seasons, episodes } = req.body || {};
      if (!title) {
        return res.status(400).json({ success: false, error: 'Título de la serie requerido' });
      }
      const created = {
        id: `series_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        category: category || 'Series Turcas',
        year: Number(year) || 2026,
        rating: rating || '9.2',
        poster: poster || 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?w=500&auto=format&fit=crop&q=80',
        backdrop: backdrop || poster || '',
        synopsis: synopsis || '',
        type: 'series',
        isBlocked: false,
        seasons: Number(seasons) || 1,
        episodesCount: Array.isArray(episodes) ? episodes.length : 0,
        episodes: Array.isArray(episodes) ? episodes : [],
        url: Array.isArray(episodes) && episodes[0] ? episodes[0].url : ''
      };
      storage.addSeriesWithEpisodes(created);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, series: created });
    } catch (err: any) {
      console.error('Error in /api/admin/vod/save-series:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al guardar la serie' });
    }
  });

  // Admin: Batch import VOD items
  app.post('/api/admin/vod/import-batch', (req, res) => {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de elementos VOD requerida' });
      }
      storage.addMultipleVod(items);
      storage.saveDb(storage.getDb());
      return res.json({ success: true, count: items.length, items });
    } catch (err: any) {
      console.error('Error batch importing VOD items:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Error al importar elementos VOD' });
    }
  });

  // Admin: Scraper to extract series, episodes, poster, title, and synopsis from web page URL
  app.post('/api/admin/scraper/extract-series', async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
        return res.status(400).json({ success: false, error: 'URL válida requerida (debe iniciar con http:// o https://)' });
      }

      const targetUrl = url.trim();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Error al acceder a la página web: Código HTTP ${response.status}`,
        });
      }

      const html = await response.text();

      let rawTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]
        || '';

      let cleanTitle = rawTitle
        .replace(/\s*\|.*$/, '')
        .replace(/\s*-\s*(?:Series|Peliculas|Ver|Online|Gratis|Capitulos|HD).*$/i, '')
        .replace(/\s*\(en Español\)/i, '')
        .replace(/\s*Audio latino/i, '')
        .replace(/[✔️✅]/g, '')
        .trim();

      if (!cleanTitle) {
        try {
          const urlObj = new URL(targetUrl);
          cleanTitle = urlObj.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Serie / Novela';
          cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
        } catch {
          cleanTitle = 'Serie Web';
        }
      }

      let poster = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i)?.[1]
        || html.match(/<img\s+[^>]*class=["'][^"']*(?:poster|cover|cartelera|thumb)[^"']*["'][^>]*src=["']([^"']+)["']/i)?.[1]
        || html.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*(?:poster|cover|cartelera|thumb)[^"']*["']/i)?.[1]
        || '';

      if (poster) {
        try {
          poster = new URL(poster, targetUrl).href;
        } catch {}
      } else {
        poster = 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?w=500&auto=format&fit=crop&q=80';
      }

      let synopsis = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<div\s+class=["'][^"']*(?:sinopsis|description|overview|entry-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
        || '';
      synopsis = synopsis.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!synopsis) {
        synopsis = `Todos los capítulos completos y temporadas de "${cleanTitle}". Disfruta de la mejor calidad en streaming.`;
      }

      let year = 2026;
      const yearMatch = html.match(/\b(202[0-6]|201\d|200\d|199\d)\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }

      let category = 'Series y Novelas';
      const lowerUrl = targetUrl.toLowerCase();
      if (lowerUrl.includes('turca') || /turc[ao]s?/i.test(html.slice(0, 5000))) {
        category = 'Series Turcas';
      } else if (lowerUrl.includes('dorama') || /dorama/i.test(html.slice(0, 5000))) {
        category = 'Doramas';
      } else if (lowerUrl.includes('anime') || /anime/i.test(html.slice(0, 5000))) {
        category = 'Anime';
      } else if (lowerUrl.includes('pelicula') || lowerUrl.includes('movie')) {
        category = 'Películas Estreno';
      }

      const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      const rawEpisodes: Array<{ title: string; chapterName: string; season: number; episode: number; url: string; poster: string }> = [];
      const seenUrls = new Set<string>();

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const innerText = match[2].replace(/<[^>]+>/g, ' ').trim();

        const hasEpNumber = /cap[ií]tulo[-\s_]*(\d+)/i.exec(href)
          || /cap[ií]tulo\s*(\d+)/i.exec(innerText)
          || /episodio[-\s_]*(\d+)/i.exec(href)
          || /episodio\s*(\d+)/i.exec(innerText)
          || /t(\d+)e(\d+)/i.exec(href)
          || /temporada[-\s_]*(\d+)[-\s_]*capitulo[-\s_]*(\d+)/i.exec(href);

        if (hasEpNumber) {
          try {
            const fullUrl = new URL(href, targetUrl).href;
            if (!seenUrls.has(fullUrl)) {
              seenUrls.add(fullUrl);
              let epNum = 1;
              let seasonNum = 1;

              if (/temporada[-\s_]*(\d+)[-\s_]*capitulo[-\s_]*(\d+)/i.test(href)) {
                const sMatch = /temporada[-\s_]*(\d+)[-\s_]*capitulo[-\s_]*(\d+)/i.exec(href)!;
                seasonNum = parseInt(sMatch[1], 10);
                epNum = parseInt(sMatch[2], 10);
              } else if (/t(\d+)e(\d+)/i.exec(href)) {
                const tMatch = /t(\d+)e(\d+)/i.exec(href)!;
                seasonNum = parseInt(tMatch[1], 10);
                epNum = parseInt(tMatch[2], 10);
              } else {
                epNum = parseInt(hasEpNumber[1], 10);
                const sFromHref = /temporada[-\s_]*(\d+)/i.exec(href);
                if (sFromHref) seasonNum = parseInt(sFromHref[1], 10);
              }

              rawEpisodes.push({
                title: `${cleanTitle} - T${seasonNum} E${epNum} (Capítulo ${epNum})`,
                chapterName: `Temporada ${seasonNum} · Capítulo ${epNum}`,
                season: seasonNum,
                episode: epNum,
                url: fullUrl,
                poster: poster,
              });
            }
          } catch {}
        }
      }

      rawEpisodes.sort((a, b) => {
        if (a.season === b.season) return a.episode - b.episode;
        return a.season - b.season;
      });

      if (rawEpisodes.length === 0) {
        const iframeSrc = html.match(/<iframe[^>]*src=["']([^"']+)["']/i)?.[1];
        const videoSrc = html.match(/<source[^>]*src=["']([^"']+)["']/i)?.[1]
          || html.match(/<video[^>]*src=["']([^"']+)["']/i)?.[1];

        const streamUrl = videoSrc ? new URL(videoSrc, targetUrl).href : (iframeSrc ? new URL(iframeSrc, targetUrl).href : targetUrl);

        rawEpisodes.push({
          title: cleanTitle,
          chapterName: 'Película Completa',
          season: 1,
          episode: 1,
          url: streamUrl,
          poster: poster,
        });
      }

      return res.json({
        success: true,
        series: {
          title: cleanTitle,
          poster,
          synopsis,
          year,
          category,
          type: rawEpisodes.length > 1 ? 'series' : 'movie',
          episodes: rawEpisodes,
        },
      });
    } catch (err: any) {
      console.error('Error in /api/admin/scraper/extract-series:', err);
      return res.status(500).json({
        success: false,
        error: 'Error al extraer la serie de la página web: ' + (err.message || 'Error inesperado'),
      });
    }
  });

  // Admin: Purge unpaid/expired users
  app.post('/api/admin/users/purge-unpaid', (req, res) => {
    storage.deleteUnpaidUsers();
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  // Admin: Update player settings
  app.post('/api/admin/settings', (req, res) => {
    storage.updatePlayerSettings(req.body);
    storage.saveDb(storage.getDb());
    res.json({ success: true });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NeshTV Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
