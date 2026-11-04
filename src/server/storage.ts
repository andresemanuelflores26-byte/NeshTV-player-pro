import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DbData, UserAccount, ChannelItem, VodItem, IPTVPlaylist } from '../types/index.ts';
import { readXtreamContent } from './xtreamParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/db.json');

export class StorageService {
  private static instance: StorageService;
  private db: DbData & {
    deletedChannelIds?: string[];
    deletedVodIds?: string[];
    playerSettings?: any;
  };

  private constructor() {
    this.db = this.loadDb();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private loadDb(): any {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (!data.vodItems && data.vod) {
          data.vodItems = data.vod;
        }
        if (!data.vod && data.vodItems) {
          data.vod = data.vodItems;
        }
        if (!data.proVipChannels && data.listaProItems) {
          data.proVipChannels = data.listaProItems;
        }
        if (!data.listaProItems && data.proVipChannels) {
          data.listaProItems = data.proVipChannels;
        }
        return data;
      }
    } catch (e) {
      console.error('Error loading db.json:', e);
    }
    return {
      users: [
        {
          id: 'usr_demo',
          username: 'demo',
          password: '123',
          expiryDate: '2026-12-31',
          status: 'active',
          notes: 'Demo User',
          blockedChannels: [],
          maxConnections: 2,
        },
      ],
      playlists: [],
      channels: [],
      vod: [],
      vodItems: [],
      listaProItems: [],
      proVipChannels: [],
      announcements: [],
      deletedChannelIds: [],
      deletedVodIds: [],
      supportNote: {
        whatsappNumber: '+54 9 11 9876-5432',
        paymentInstructions: 'Para renovación de cuenta o soporte técnico, contáctanos por WhatsApp.',
        customMessage: 'Servicio 100% Estable Anti-Corte',
      },
    };
  }

  public saveDb(newData: any): void {
    try {
      this.db = newData;
      if (!this.db.vodItems && this.db.vod) {
        this.db.vodItems = this.db.vod;
      }
      if (!this.db.vod && this.db.vodItems) {
        this.db.vod = this.db.vodItems;
      }
      if (!this.db.proVipChannels && this.db.listaProItems) {
        this.db.proVipChannels = this.db.listaProItems as any;
      }
      if (!this.db.listaProItems && this.db.proVipChannels) {
        this.db.listaProItems = this.db.proVipChannels as any;
      }
      
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving db.json:', e);
    }
  }

  public getDb(): any {
    return this.db;
  }

  public getPublicInfo() {
    return {
      contactNote: this.db.contactNote || 'Soporte vía WhatsApp disponible 24/7.',
      supportNote: this.db.supportNote,
      announcements: this.db.announcements || [],
    };
  }

  public authenticateClient(username: string, pass: string): { success: boolean; user?: UserAccount; suspended?: boolean; message?: string } {
    const users = this.db.users || [];
    if (username === 'admin' && (pass === 'Admin2026' || pass === 'admin123')) {
      return {
        success: true,
        user: {
          id: 'usr_admin',
          username: 'admin',
          expiryDate: '2030-01-01',
          status: 'active',
          isAdmin: true,
          blockedChannels: [],
          maxConnections: 99,
        },
      };
    }

    const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!found) {
      return { success: false, message: 'Usuario no encontrado en el sistema' };
    }

    if (found.status === 'blocked' || found.status === 'suspended') {
      return { success: false, suspended: true, message: 'Cuenta suspendida o bloqueada. Contacte al administrador.' };
    }

    if (found.password && found.password !== pass) {
      return { success: false, message: 'Contraseña incorrecta' };
    }

    const today = new Date().toISOString().split('T')[0];
    if (found.expiryDate && found.expiryDate < today) {
      return { success: false, suspended: true, message: 'Su suscripción ha expirado. Por favor renueve su cuenta.' };
    }

    return { success: true, user: found };
  }

  public authenticateAdmin(usernameOrToken: string, pass?: string): boolean {
    if (usernameOrToken && usernameOrToken.startsWith('nesh_admin_token_')) {
      return true;
    }
    const u = (usernameOrToken || '').trim().toLowerCase();
    const p = (pass || '').trim();
    return u === 'admin' && (p === 'Admin2026' || p === 'admin123' || p === 'admin');
  }

  public addUser(user: UserAccount): void {
    if (!this.db.users) this.db.users = [];
    this.db.users.push(user);
    this.saveDb(this.db);
  }

  public updateUser(user: UserAccount): void {
    if (!this.db.users) this.db.users = [];
    const idx = this.db.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      this.db.users[idx] = { ...this.db.users[idx], ...user };
      this.saveDb(this.db);
    }
  }

  public deleteUser(userId: string): void {
    if (!this.db.users) this.db.users = [];
    this.db.users = this.db.users.filter(u => u.id !== userId);
    this.saveDb(this.db);
  }

  public updatePlaylist(playlist: IPTVPlaylist): void {
    if (!this.db.playlists) this.db.playlists = [];
    const idx = this.db.playlists.findIndex(p => p.id === playlist.id);
    if (idx !== -1) {
      this.db.playlists[idx] = { ...this.db.playlists[idx], ...playlist };
    } else {
      this.db.playlists.push(playlist);
    }
    this.saveDb(this.db);
  }

  public deletePlaylist(id: string): void {
    if (!this.db.playlists) this.db.playlists = [];
    this.db.playlists = this.db.playlists.filter(p => p.id !== id);
    this.saveDb(this.db);
  }

  public updateContactNote(note: string): void {
    this.db.contactNote = note;
    this.saveDb(this.db);
  }

  public updateFloatingMessage(msg: any): void {
    this.db.floatingMessage = msg;
    if (!this.db.announcements) this.db.announcements = [];
    this.db.announcements.push(msg);
    this.saveDb(this.db);
  }

  public addListaProItem(item: VodItem): void {
    if (!this.db.listaProItems) this.db.listaProItems = [];
    this.db.listaProItems.push(item);
    if (!this.db.proVipChannels) this.db.proVipChannels = [];
    this.db.proVipChannels.push(item as any);
    this.saveDb(this.db);
  }

  public deleteListaProItem(id: string): void {
    if (this.db.listaProItems) {
      this.db.listaProItems = this.db.listaProItems.filter(i => i.id !== id);
    }
    if (this.db.proVipChannels) {
      this.db.proVipChannels = this.db.proVipChannels.filter(i => i.id !== id);
    }
    this.saveDb(this.db);
  }

  public resetCoreChannels(): void {
    this.db.deletedChannelIds = [];
    this.saveDb(this.db);
  }

  public deleteChannel(id: string): boolean {
    if (!this.db.deletedChannelIds) this.db.deletedChannelIds = [];
    if (!this.db.deletedChannelIds.includes(id)) {
      this.db.deletedChannelIds.push(id);
    }
    if (this.db.channels) {
      this.db.channels = this.db.channels.filter(c => c.id !== id);
    }
    this.saveDb(this.db);
    return true;
  }

  public deleteChannelsBatch(ids: string[]): number {
    if (!this.db.deletedChannelIds) this.db.deletedChannelIds = [];
    ids.forEach(id => {
      if (!this.db.deletedChannelIds!.includes(id)) {
        this.db.deletedChannelIds!.push(id);
      }
    });
    if (this.db.channels) {
      this.db.channels = this.db.channels.filter(c => !ids.includes(c.id));
    }
    this.saveDb(this.db);
    return ids.length;
  }

  public deleteChannelCategory(categoryName: string): number {
    if (!this.db.channels) return 0;
    const normCategory = categoryName.trim().toLowerCase();
    const toDelete = this.db.channels.filter(c => (c.category?.trim() || 'Sin Categoría').toLowerCase() === normCategory);
    const ids = toDelete.map(c => c.id);
    if (ids.length > 0) {
      this.deleteChannelsBatch(ids);
    }
    return ids.length;
  }

  public deleteVod(id: string): boolean {
    if (!this.db.deletedVodIds) this.db.deletedVodIds = [];
    if (!this.db.deletedVodIds.includes(id)) {
      this.db.deletedVodIds.push(id);
    }
    if (this.db.vod) this.db.vod = this.db.vod.filter(v => v.id !== id);
    if (this.db.vodItems) this.db.vodItems = this.db.vodItems.filter(v => v.id !== id);
    this.saveDb(this.db);
    return true;
  }

  public deleteVodBatch(ids: string[]): number {
    if (!this.db.deletedVodIds) this.db.deletedVodIds = [];
    ids.forEach(id => {
      if (!this.db.deletedVodIds!.includes(id)) {
        this.db.deletedVodIds!.push(id);
      }
    });
    if (this.db.vod) this.db.vod = this.db.vod.filter(v => !ids.includes(v.id));
    if (this.db.vodItems) this.db.vodItems = this.db.vodItems.filter(v => !ids.includes(v.id));
    this.saveDb(this.db);
    return ids.length;
  }

  public deleteVodCategory(categoryName: string, type?: string): number {
    if (!this.db.vod) return 0;
    const normCategory = categoryName.trim().toLowerCase();
    const toDelete = (this.db.vod || []).filter(v => {
      const cat = (v.category?.trim() || (type === 'series' ? 'Series Generales' : 'Películas Generales')).toLowerCase();
      const matchesType = !type || (type === 'series' ? v.type === 'series' : v.type !== 'series');
      return cat === normCategory && matchesType;
    });
    const ids = toDelete.map(v => v.id);
    if (ids.length > 0) {
      this.deleteVodBatch(ids);
    }
    return ids.length;
  }

  public addPlaylist(pl: IPTVPlaylist): void {
    if (!this.db.playlists) this.db.playlists = [];
    this.db.playlists.push(pl);
    this.saveDb(this.db);
  }

  public setPlaylistStatus(id: string, status: 'online' | 'offline' | 'failed' | 'working', details: any): void {
    if (!this.db.playlists) return;
    const pl = this.db.playlists.find(p => p.id === id);
    if (pl) {
      pl.status = status;
      pl.statusMessage = details.message || details.errorDetail;
      pl.latencyMs = details.latencyMs || 0;
      pl.lastTested = new Date().toISOString();
      this.saveDb(this.db);
    }
  }

  public addDirectChannel(ch: ChannelItem): ChannelItem {
    if (!this.db.channels) this.db.channels = [];
    this.db.channels = this.db.channels.filter(c => c.id !== ch.id && c.url !== ch.url);
    this.db.channels.unshift(ch);
    this.saveDb(this.db);
    return ch;
  }

  public clearAllChannels(): void {
    this.db.channels = [];
    this.db.deletedChannelIds = [];
    if (this.db.users) {
      this.db.users.forEach(u => {
        u.blockedChannels = [];
      });
    }
    this.saveDb(this.db);
  }

  public addMultipleChannels(channels: ChannelItem[]): ChannelItem[] {
    if (!this.db.channels) this.db.channels = [];
    const existingUrls = new Set(this.db.channels.map(c => c.url));
    const newItems = channels.filter(c => !existingUrls.has(c.url));
    this.db.channels.push(...newItems);
    this.saveDb(this.db);
    return newItems;
  }

  public async importXtreamContent(playlistId: string): Promise<any> {
    const pl = (this.db.playlists || []).find(p => p.id === playlistId);
    if (!pl) return { channels: [], vod: [] };
    const { channels, vod } = await readXtreamContent(pl);
    if (channels.length > 0) {
      this.addMultipleChannels(channels);
    }
    if (vod.length > 0) {
      this.addMultipleVod(vod);
    }
    pl.channelCount = channels.length;
    pl.vodCount = vod.length;
    pl.lastSynced = new Date().toISOString();
    this.saveDb(this.db);
    return { channels, vod };
  }

  public toggleChannelBlocked(id: string, blocked?: boolean): ChannelItem | null {
    if (!this.db.channels) return null;
    const ch = this.db.channels.find(c => c.id === id);
    if (ch) {
      ch.isBlocked = typeof blocked === 'boolean' ? blocked : !ch.isBlocked;
      this.saveDb(this.db);
      return ch;
    }
    return null;
  }

  public toggleCategoryChannelsBlocked(category: string, blocked: boolean): number {
    if (!this.db.channels) return 0;
    let count = 0;
    const normCategory = category.trim().toLowerCase();
    this.db.channels.forEach(c => {
      const cat = (c.category?.trim() || 'Sin Categoría').toLowerCase();
      if (cat === normCategory) {
        c.isBlocked = blocked;
        count++;
      }
    });
    this.saveDb(this.db);
    return count;
  }

  public toggleVodBlocked(id: string, blocked?: boolean): VodItem | null {
    if (!this.db.vod) return null;
    const v = this.db.vod.find(item => item.id === id);
    if (v) {
      v.isBlocked = typeof blocked === 'boolean' ? blocked : !v.isBlocked;
      if (this.db.vodItems) {
        const vi = this.db.vodItems.find(item => item.id === id);
        if (vi) vi.isBlocked = v.isBlocked;
      }
      this.saveDb(this.db);
      return v;
    }
    return null;
  }

  public addVodItem(item: VodItem): void {
    if (!this.db.vod) this.db.vod = [];
    this.db.vod.push(item);
    if (!this.db.vodItems) this.db.vodItems = [];
    this.db.vodItems.push(item);
    this.saveDb(this.db);
  }

  public addSeriesWithEpisodes(series: VodItem): void {
    this.addVodItem(series);
  }

  public addMultipleVod(items: VodItem[]): void {
    if (!this.db.vod) this.db.vod = [];
    this.db.vod.push(...items);
    if (!this.db.vodItems) this.db.vodItems = [];
    this.db.vodItems.push(...items);
    this.saveDb(this.db);
  }

  public deleteUnpaidUsers(): void {
    const today = new Date().toISOString().split('T')[0];
    if (!this.db.users) return;
    this.db.users = this.db.users.filter(u => !u.expiryDate || u.expiryDate >= today || u.isAdmin);
    this.saveDb(this.db);
  }

  public updatePlayerSettings(settings: any): void {
    this.db.playerSettings = settings;
    this.saveDb(this.db);
  }
}
