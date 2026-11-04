import React, { useState } from 'react';
import { Search, Tv, Play, ArrowLeft, X, Film, CheckCircle2 } from 'lucide-react';
import { VodItem, Episode } from '../types';
import { StreamPlayer } from './Player/StreamPlayer';

interface SeriesViewProps {
  vodItems: VodItem[];
  onBack: () => void;
}

export const SeriesView: React.FC<SeriesViewProps> = ({ vodItems, onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeries, setSelectedSeries] = useState<VodItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [playingEpisode, setPlayingEpisode] = useState<{ title: string; streamUrl: string } | null>(null);

  const seriesOnly = vodItems.filter(v => v.type === 'series');
  const categories = ['Todos', ...Array.from(new Set(seriesOnly.map(v => v.category)))];

  const filteredSeries = seriesOnly.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategory === 'Todos') return true;
    return s.category === selectedCategory;
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
            <Tv className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold text-white">Series de TV (Temporadas & Episodios)</h1>
            <span className="text-xs bg-slate-800 border border-slate-700 text-amber-400 px-2.5 py-0.5 rounded-full font-mono">
              {filteredSeries.length} series
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar serie..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* Main Grid */}
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

        {/* Series Poster Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {filteredSeries.map(series => (
              <div
                key={series.id}
                onClick={() => {
                  setSelectedSeries(series);
                  setSelectedSeason(1);
                }}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl hover:border-amber-500/80 transition-all cursor-pointer group tv-focusable transform hover:-translate-y-1"
              >
                <div className="relative aspect-[2/3] overflow-hidden">
                  <img
                    src={series.poster}
                    alt={series.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 bg-slate-950/90 px-2 py-0.5 rounded text-[10px] font-bold text-amber-400 border border-amber-500/30">
                    ★ {series.rating}
                  </div>
                  <div className="absolute top-2 right-2 bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-bold">
                    {series.seasonsCount || 1} Temp.
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-bold text-white text-xs truncate group-hover:text-amber-400 transition-colors">
                    {series.title}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{series.year} · {series.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Series Season & Episodes Modal */}
      {selectedSeries && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <div className="flex items-center gap-3">
                <img src={selectedSeries.poster} alt="" className="w-12 h-16 rounded-lg object-cover border border-slate-700" />
                <div>
                  <h2 className="text-base font-bold text-white">{selectedSeries.title}</h2>
                  <p className="text-xs text-slate-400">{selectedSeries.category} · {selectedSeries.year}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSeries(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full border border-slate-700 tv-focusable"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Season Selector Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-900/80 px-4 pt-2 gap-2">
              {Array.from({ length: selectedSeries.seasonsCount || 1 }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setSelectedSeason(i + 1)}
                  className={`px-4 py-2 font-bold text-xs rounded-t-lg transition-colors tv-focusable ${
                    selectedSeason === i + 1
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Temporada {i + 1}
                </button>
              ))}
            </div>

            {/* Episodes List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedSeries.episodes && selectedSeries.episodes.filter(e => e.seasonNumber === selectedSeason).length > 0 ? (
                selectedSeries.episodes
                  .filter(e => e.seasonNumber === selectedSeason)
                  .map(ep => (
                    <div
                      key={ep.id}
                      onClick={() => {
                        setPlayingEpisode({ title: `${selectedSeries.title} - ${ep.title}`, streamUrl: ep.streamUrl || ep.url || '' });
                        setSelectedSeries(null);
                      }}
                      className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500 rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-slate-850 group tv-focusable"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">{ep.title}</h4>
                          <span className="text-[10px] text-slate-400">{ep.duration || '45 min'}</span>
                        </div>
                      </div>
                      <span className="text-xs text-amber-400 font-bold">Ver Capítulo</span>
                    </div>
                  ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  No hay episodios cargados para la Temporada {selectedSeason}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Episode Player Modal */}
      {playingEpisode && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center z-10">
            <h3 className="text-sm font-bold text-amber-400">{playingEpisode.title}</h3>
            <button
              onClick={() => setPlayingEpisode(null)}
              className="p-1.5 rounded-lg bg-rose-950 text-rose-200 hover:bg-rose-900 text-xs font-bold tv-focusable"
            >
              Cerrar Reproductor
            </button>
          </div>
          <div className="flex-1">
            <StreamPlayer
              title={playingEpisode.title}
              category="Serie TV"
              streamUrl={playingEpisode.streamUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'}
              initialEngine="native"
              isVod={true}
              onClose={() => setPlayingEpisode(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
