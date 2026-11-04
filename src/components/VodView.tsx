import React, { useState } from 'react';
import { Search, Film, Play, Star, ArrowLeft, X, Sparkles, Tv } from 'lucide-react';
import { VodItem } from '../types';
import { StreamPlayer } from './Player/StreamPlayer';

interface VodViewProps {
  vodItems: VodItem[];
  onBack: () => void;
}

export const VodView: React.FC<VodViewProps> = ({ vodItems, onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVod, setSelectedVod] = useState<VodItem | null>(null);
  const [playingVod, setPlayingVod] = useState<VodItem | null>(null);

  const moviesOnly = vodItems.filter(v => v.type === 'movie' || (!v.type && !v.episodes));
  const categories = ['Todos', ...Array.from(new Set(moviesOnly.map(v => v.category || 'General')))];

  const filteredMovies = moviesOnly.filter(m => {
    const matchesSearch = (m.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategory === 'Todos') return true;
    return m.category === selectedCategory;
  });

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors tv-focusable"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Film className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold text-white">Películas bajo Demanda (VOD)</h1>
            <span className="text-xs bg-slate-800 border border-slate-700 text-amber-400 px-2.5 py-0.5 rounded-full font-mono">
              {filteredMovies.length} títulos
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar película..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Category Sidebar */}
        <div className="w-56 bg-slate-900/90 border-r border-slate-800 p-3 overflow-y-auto space-y-1 shrink-0 hidden md:block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-2 block">
            Categorías
          </span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors tv-focusable ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="truncate">{cat}</span>
            </button>
          ))}
        </div>

        {/* Movie Poster Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredMovies.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Film className="w-12 h-12 mx-auto text-slate-700" />
              <h3 className="text-sm font-bold text-slate-400">No se encontraron películas</h3>
              <p className="text-xs text-slate-500">Prueba cambiando de categoría o término de búsqueda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {filteredMovies.map(movie => (
                <div
                  key={movie.id}
                  onClick={() => setSelectedVod(movie)}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl hover:border-amber-500/80 transition-all cursor-pointer group tv-focusable transform hover:-translate-y-1"
                >
                  <div className="relative aspect-[2/3] overflow-hidden bg-slate-950">
                    <img
                      src={movie.poster}
                      alt={movie.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop';
                      }}
                    />
                    <div className="absolute top-2 left-2 bg-slate-950/90 px-2 py-0.5 rounded text-[10px] font-bold text-amber-400 border border-amber-500/30">
                      ★ {movie.rating || '9.0'}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="p-3 bg-amber-500 text-slate-950 rounded-full shadow-2xl transform scale-75 group-hover:scale-100 transition-transform">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors">
                      {movie.title}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{movie.year || '2026'} · {movie.category || 'VOD'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Movie Details Modal Overlay */}
      {selectedVod && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setSelectedVod(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-950/80 hover:bg-slate-800 text-slate-300 rounded-full border border-slate-700 tv-focusable"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col md:flex-row">
              <div className="w-full md:w-1/3 aspect-[2/3] relative bg-slate-950">
                <img
                  src={selectedVod.poster}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop';
                  }}
                />
              </div>
              <div className="p-6 md:w-2/3 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
                    {selectedVod.category || 'VOD'}
                  </span>
                  <h2 className="text-xl font-bold text-white">{selectedVod.title}</h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>★ {selectedVod.rating || '9.0'}</span>
                    <span>·</span>
                    <span>{selectedVod.year || '2026'}</span>
                    <span>·</span>
                    <span className="text-emerald-400">Directo MP4 / MKV / Proxy</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-2 border-t border-slate-800">
                    {selectedVod.synopsis || 'Disfruta de esta película con la mejor calidad y sincronización instantánea.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex gap-3">
                  <button
                    onClick={() => {
                      setPlayingVod(selectedVod);
                      setSelectedVod(null);
                    }}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg tv-focusable"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir Película
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {playingVod && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center z-10">
            <h3 className="text-sm font-bold text-amber-400">{playingVod.title}</h3>
            <button
              onClick={() => setPlayingVod(null)}
              className="p-1.5 rounded-lg bg-rose-950 text-rose-200 hover:bg-rose-900 text-xs font-bold tv-focusable"
            >
              Cerrar Reproductor
            </button>
          </div>
          <div className="flex-1">
            <StreamPlayer
              title={playingVod.title}
              category={playingVod.category}
              streamUrl={playingVod.streamUrl || playingVod.url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'}
              initialEngine="native"
              isVod={true}
              onClose={() => setPlayingVod(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
