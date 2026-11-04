import React, { useState, useEffect } from 'react';
import { Search, Radio, Star, Play, Lock, Tv, ArrowLeft, Filter, Plus, X } from 'lucide-react';
import { Channel } from '../types';
import { StreamPlayer } from './Player/StreamPlayer';

interface LiveTvViewProps {
  channels: Channel[];
  onBack: () => void;
}

export const LiveTvView: React.FC<LiveTvViewProps> = ({ channels: initialChannels, onBack }) => {
  const [userChannels, setUserChannels] = useState<Channel[]>([]);
  const allChannels = [...initialChannels, ...userChannels];

  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(allChannels[0] || null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [m3uText, setM3uText] = useState('');
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const categories = ['Todos', 'Favoritos', ...Array.from(new Set(allChannels.map(c => c.category)))];

  const toggleFavorite = (chId: string) => {
    setFavorites(prev =>
      prev.includes(chId) ? prev.filter(id => id !== chId) : [...prev, chId]
    );
  };

  const filteredChannels = allChannels.filter(ch => {
    const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategory === 'Favoritos') return favorites.includes(ch.id);
    if (selectedCategory === 'Todos') return true;
    return ch.category === selectedCategory;
  });

  // Remote Control Channel Zapping (PageUp / PageDown / ChannelUp / ChannelDown)
  useEffect(() => {
    const handleChannelKeys = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.key === 'PageDown' || e.key === 'ChannelDown' || e.keyCode === 167) {
        e.preventDefault();
        if (filteredChannels.length > 0 && activeChannel) {
          const currentIndex = filteredChannels.findIndex(c => c.id === activeChannel.id);
          const nextIndex = (currentIndex + 1) % filteredChannels.length;
          setActiveChannel(filteredChannels[nextIndex]);
        }
      } else if (e.key === 'PageUp' || e.key === 'ChannelUp' || e.keyCode === 166) {
        e.preventDefault();
        if (filteredChannels.length > 0 && activeChannel) {
          const currentIndex = filteredChannels.findIndex(c => c.id === activeChannel.id);
          const prevIndex = (currentIndex - 1 + filteredChannels.length) % filteredChannels.length;
          setActiveChannel(filteredChannels[prevIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleChannelKeys);
    return () => window.removeEventListener('keydown', handleChannelKeys);
  }, [filteredChannels, activeChannel]);

  const handleAddM3u = () => {
    if (!m3uText.trim()) return;
    const lines = m3uText.split(/\r?\n/);
    const newChs: Channel[] = [];
    let currentName = 'Canal M3U';
    let currentLogo = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80';
    let currentCat = 'Mis Listas M3U';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXTINF:')) {
        const logoMatch = trimmed.match(/tvg-logo=["']([^"']*)["']/i);
        const groupMatch = trimmed.match(/group-title=["']([^"']*)["']/i);
        const commaIdx = trimmed.lastIndexOf(',');
        if (commaIdx !== -1) currentName = trimmed.substring(commaIdx + 1).trim();
        if (logoMatch && logoMatch[1]) currentLogo = logoMatch[1].trim();
        if (groupMatch && groupMatch[1]) currentCat = groupMatch[1].trim();
      } else if (trimmed && !trimmed.startsWith('#')) {
        newChs.push({
          id: `user_ch_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          number: allChannels.length + newChs.length + 1,
          name: currentName,
          category: currentCat,
          logo: currentLogo,
          url: trimmed,
          streamUrl: trimmed,
          resolution: '1080p Stream',
          isBlocked: false,
        });
        currentName = 'Canal M3U';
      }
    }

    if (newChs.length > 0) {
      setUserChannels(prev => [...prev, ...newChs]);
      setActiveChannel(newChs[0]);
      setShowAddModal(false);
      setM3uText('');
    }
  };

  const handleAddSingle = () => {
    if (!customName.trim() || !customUrl.trim()) return;
    const newCh: Channel = {
      id: `user_ch_${Date.now()}`,
      number: allChannels.length + 1,
      name: customName.trim(),
      category: 'Personalizados',
      logo: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80',
      url: customUrl.trim(),
      streamUrl: customUrl.trim(),
      resolution: '1080p Stream',
      isBlocked: false,
    };
    setUserChannels(prev => [...prev, newCh]);
    setActiveChannel(newCh);
    setShowAddModal(false);
    setCustomName('');
    setCustomUrl('');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden relative">
      {/* View Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors tv-focusable"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Tv className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold text-white tracking-wide">Canales en Vivo (IPTV Live)</h1>
            <span className="text-xs bg-slate-800 border border-slate-700 text-amber-400 px-2 py-0.5 rounded-full font-mono">
              {filteredChannels.length} canales
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Add M3U / Custom Channel Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg tv-focusable"
          >
            <Plus className="w-4 h-4" /> Cargar Lista M3U / Canal
          </button>

          {/* Search */}
          <div className="relative w-64 hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar canal..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Main Content Layout (Sidebar + Player Split) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Categories Sidebar */}
        <div className="w-56 bg-slate-900/90 border-r border-slate-800 p-3 overflow-y-auto space-y-1 shrink-0 hidden md:block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-2 block">
            Categorías
          </span>
          {categories.map((cat, idx) => (
            <button
              key={`cat-${cat}-${idx}`}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors tv-focusable ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="truncate">{cat}</span>
              {cat === 'Favoritos' && <Star className="w-3.5 h-3.5 fill-current text-amber-400" />}
            </button>
          ))}
        </div>

        {/* Channels List Grid */}
        <div className="w-80 bg-slate-950/80 border-r border-slate-800 p-3 overflow-y-auto space-y-2 shrink-0">
          {/* Mobile Category Dropdown */}
          <div className="md:hidden mb-2">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none"
            >
              {categories.map((cat, idx) => (
                <option key={`opt-${cat}-${idx}`} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {filteredChannels.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Radio className="w-8 h-8 mx-auto text-slate-700" />
              <p className="text-xs">No se encontraron canales</p>
            </div>
          ) : (
            filteredChannels.map((ch, idx) => {
              const isSelected = activeChannel?.id === ch.id;
              const isFav = favorites.includes(ch.id);
              return (
                <div
                  key={`${ch.id || 'ch'}-${idx}`}
                  onClick={() => setActiveChannel(ch)}
                  className={`w-full p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer tv-focusable ${
                    isSelected
                      ? 'bg-amber-500/20 border border-amber-500 text-white shadow-lg'
                      : 'bg-slate-900/60 border border-slate-800/80 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <img
                      src={ch.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80'}
                      alt={ch.name}
                      className="w-10 h-10 rounded-xl object-cover bg-slate-950 border border-slate-800 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=120&auto=format&fit=crop&q=80';
                      }}
                    />
                    <div className="truncate">
                      <span className="text-xs font-bold block truncate">{ch.name}</span>
                      <p className="text-[10px] text-slate-400 truncate">{ch.category}</p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(ch.id);
                    }}
                    className="p-1 text-slate-500 hover:text-amber-400 transition-colors"
                  >
                    <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Video Player Main Viewport */}
        <div className="flex-1 p-4 bg-slate-950 flex flex-col justify-center items-center relative">
          {activeChannel ? (
            <div className="w-full h-full flex flex-col">
              <StreamPlayer
                title={activeChannel.name}
                category={activeChannel.category}
                streamUrl={activeChannel.streamUrl || activeChannel.url || ''}
                isProVip={activeChannel.isProVip}
              />
            </div>
          ) : (
            <div className="text-center space-y-3 text-slate-500">
              <Tv className="w-12 h-12 mx-auto text-slate-700" />
              <p className="text-xs">Selecciona un canal de la lista para comenzar a reproducir</p>
            </div>
          )}
        </div>
      </div>

      {/* Add M3U / Custom Stream Modal */}
      {showAddModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl text-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 text-sm">
                <Tv className="w-5 h-5" /> Cargar tu Lista M3U o Canal IPTV
              </span>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Pegar Contenido M3U (Formato IPTV Smarters):</label>
                <textarea
                  rows={4}
                  placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo='...' group-title='Deportes', Mi Canal HD&#10;http://servidor.com:8080/live/user/pass/123.ts"
                  value={m3uText}
                  onChange={e => setM3uText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                />
                <button
                  onClick={handleAddM3u}
                  className="mt-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg"
                >
                  Procesar y Cargar Lista M3U
                </button>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <label className="block text-slate-300 font-semibold mb-1.5">O Agregar 1 Canal Directo (URL .m3u8 / .ts):</label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Nombre del canal (ej: TyC Sports)"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    placeholder="URL del Stream (ej: http://... o https://...)"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    onClick={handleAddSingle}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs"
                  >
                    Agregar Canal Directo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
