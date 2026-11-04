import React, { useState } from 'react';
import { ArrowLeft, Zap, Radio, Play } from 'lucide-react';
import { Channel } from '../types';
import { StreamPlayer } from './Player/StreamPlayer';

interface ProVipViewProps {
  proChannels: Channel[];
  onBack: () => void;
}

export const ProVipView: React.FC<ProVipViewProps> = ({ proChannels, onBack }) => {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(proChannels[0] || null);

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
            <Zap className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold text-white tracking-wide">Lista Pro (Canales Directos Premium VIP)</h1>
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-mono font-bold">
              Eventos VIP Alta Prioridad
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* VIP Channels List */}
        <div className="w-80 bg-slate-900/90 border-r border-slate-800 p-4 overflow-y-auto space-y-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
            Señales Directas VIP
          </span>
          {proChannels.map(ch => {
            const isSelected = activeChannel?.id === ch.id;
            return (
              <div
                key={ch.id}
                onClick={() => setActiveChannel(ch)}
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all tv-focusable ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-lg scale-[1.02]'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <img src={ch.logo} alt="" className="w-10 h-10 rounded-lg object-cover border border-amber-500/40 shrink-0" />
                <div className="truncate">
                  <h4 className="text-xs font-bold text-white truncate">{ch.name}</h4>
                  <span className="text-[10px] text-amber-400 font-mono">⚡ Ultra Baja Latencia</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Video Player */}
        <div className="flex-1 p-4 bg-slate-950 flex flex-col justify-center items-center">
          {activeChannel ? (
            <div className="w-full h-full">
              <StreamPlayer
                title={activeChannel.name}
                category="Eventos VIP Directos"
                streamUrl={activeChannel.streamUrl || activeChannel.url || ''}
                isProVip={true}
              />
            </div>
          ) : (
            <div className="text-center text-slate-500">
              Selecciona un canal VIP
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
