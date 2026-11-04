import React, { useEffect, useState } from 'react';
import {
  Tv,
  Film,
  Radio,
  Zap,
  Settings,
  Smartphone,
  LogOut,
  MessageSquare,
  PhoneCall,
  UserCheck,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  PlayCircle
} from 'lucide-react';
import { DbData, User, Channel, VodItem, SupportNote } from './types';
import { useTvRemote } from './hooks/useTvRemote';
import { AdminPanel } from './components/Admin/AdminPanel';
import { AndroidTvModal } from './components/AndroidTvModal';
import { LiveTvView } from './components/LiveTvView';
import { VodView } from './components/VodView';
import { SeriesView } from './components/SeriesView';
import { ProVipView } from './components/ProVipView';

export default function App() {
  const [dbData, setDbData] = useState<DbData | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    expDate: string;
    daysRemaining: number;
    isAdmin?: boolean;
  } | null>(null);

  // Login form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Views & Modals
  const [currentView, setCurrentView] = useState<'dashboard' | 'live' | 'movies' | 'series' | 'provip'>('dashboard');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  // D-Pad remote navigation hook with Back button handler
  useTvRemote(() => {
    if (showAdminPanel) setShowAdminPanel(false);
    else if (showAndroidModal) setShowAndroidModal(false);
    else if (currentView !== 'dashboard') setCurrentView('dashboard');
  });

  // Load initial DB from backend
  const fetchDbData = async () => {
    try {
      const res = await fetch('/api/admin/data');
      const data = await res.json();
      if (!data.vodItems && data.vod) {
        data.vodItems = data.vod;
      }
      if (!data.proVipChannels && data.listaProItems) {
        data.proVipChannels = data.listaProItems;
      }
      setDbData(data);
    } catch (err) {
      console.error('Failed to fetch DB data:', err);
    }
  };

  useEffect(() => {
    fetchDbData();
  }, []);

  const handleUpdateDb = async (newDb: DbData) => {
    setDbData(newDb);
    try {
      await fetch('/api/admin/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDb),
      });
    } catch (err) {
      console.error('Error saving DB:', err);
    }
  };

  const handleLogin = async (usr = loginUser, pass = loginPass) => {
    setLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usr, password: pass }),
      });
      const data = await res.json();

      if (data.success) {
        setCurrentUser(data.user);
        if (data.isAdmin || data.user?.isAdmin) {
          setShowAdminPanel(true);
        }
        setCurrentView('dashboard');
      } else {
        setLoginError(data.error || 'Credenciales inválidas');
      }
    } catch (err: any) {
      setLoginError('Error conectando al servidor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!dbData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white space-y-4 font-sans">
        <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-transparent animate-spin"></div>
        <h2 className="text-base font-bold tracking-wide text-amber-400">Iniciando Servidor NeshTV IPTV...</h2>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Background glow effects */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 relative z-10 backdrop-blur-md">
          {/* Logo Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-xl mb-1">
              <Tv className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-wider uppercase">
              Nesh<span className="text-amber-400">TV</span> IPTV
            </h1>
            <p className="text-xs text-slate-400">Sistema de Streaming Ultra Fluido Smarters Pro 5.1</p>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={e => { e.preventDefault(); handleLogin(); }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nombre de Usuario:</label>
              <input
                type="text"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 font-mono tv-focusable"
                placeholder="Ingresa tu usuario"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Contraseña:</label>
              <input
                type="password"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 font-mono tv-focusable"
                placeholder="Ingresa tu contraseña"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 tv-focusable"
            >
              {loading ? 'Verificando Cuenta...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Support WhatsApp Note */}
          {dbData.supportNote && (
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> Soporte Técnico / Renovaciones:
              </div>
              <p className="leading-normal">{dbData.supportNote.paymentInstructions}</p>
              {dbData.supportNote.whatsappNumber && (
                <a
                  href={`https://wa.me/${dbData.supportNote.whatsappNumber.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-400 font-bold hover:underline pt-1"
                >
                  💬 WhatsApp: {dbData.supportNote.whatsappNumber}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // VIEW ROUTER
  if (currentView === 'live') {
    return <LiveTvView channels={dbData?.channels || []} onBack={() => setCurrentView('dashboard')} />;
  }
  if (currentView === 'movies') {
    return <VodView vodItems={dbData?.vodItems || []} onBack={() => setCurrentView('dashboard')} />;
  }
  if (currentView === 'series') {
    return <SeriesView vodItems={dbData?.vodItems || []} onBack={() => setCurrentView('dashboard')} />;
  }
  if (currentView === 'provip') {
    return <ProVipView proChannels={dbData?.proVipChannels || []} onBack={() => setCurrentView('dashboard')} />;
  }

  // MAIN DASHBOARD (IPTV Smarters Pro 5.1 Style)
  const marqueeText = (dbData?.announcements || []).find(a => a.active)?.text;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 select-none relative overflow-x-hidden">
      {/* Top Header Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-wider">
              Nesh<span className="text-amber-400">TV</span> IPTV
            </h1>
            <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Búfer Anti-Congelamiento
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-slate-300 font-bold">{currentUser.username}</span>
            <span className="text-amber-400 font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[10px]">
              {currentUser.daysRemaining} días restantes
            </span>
          </div>

          <button
            onClick={() => setShowAndroidModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors tv-focusable"
          >
            <Smartphone className="w-4 h-4 text-amber-400" /> APK Android TV
          </button>

          {currentUser.isAdmin && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-lg tv-focusable"
            >
              <Settings className="w-4 h-4" /> Panel de Administración
            </button>
          )}

          <button
            onClick={() => setCurrentUser(null)}
            className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white transition-colors tv-focusable"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Marquee Announcement Banner */}
      {marqueeText && (
        <div className="my-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs font-semibold text-amber-300 overflow-hidden whitespace-nowrap shadow-md">
          <div className="animate-marquee inline-block">{marqueeText}</div>
        </div>
      )}

      {/* IPTV Smarters Pro 5.1 Tile Grid */}
      <main className="my-auto py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
        {/* 1. Live TV Tile */}
        <div
          onClick={() => setCurrentView('live')}
          className="group relative bg-slate-900/90 border-2 border-slate-800 hover:border-amber-500 rounded-3xl p-6 flex flex-col justify-between h-60 shadow-2xl cursor-pointer transition-all duration-300 transform hover:-translate-y-2 hover:shadow-amber-500/10 tv-focusable overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between z-10">
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-lg">
              <Tv className="w-8 h-8" />
            </div>
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
              {dbData.channels.length} canales
            </span>
          </div>

          <div className="space-y-1 z-10">
            <h2 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">CANALES EN VIVO</h2>
            <p className="text-xs text-slate-400">TV en Directo con Búfer Seguro de 30s</p>
          </div>
        </div>

        {/* 2. Movies Tile */}
        <div
          onClick={() => setCurrentView('movies')}
          className="group relative bg-slate-900/90 border-2 border-slate-800 hover:border-amber-500 rounded-3xl p-6 flex flex-col justify-between h-60 shadow-2xl cursor-pointer transition-all duration-300 transform hover:-translate-y-2 hover:shadow-amber-500/10 tv-focusable overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between z-10">
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-lg">
              <Film className="w-8 h-8" />
            </div>
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
              {(dbData?.vodItems || []).filter(v => v.type === 'movie').length} películas
            </span>
          </div>

          <div className="space-y-1 z-10">
            <h2 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">PELÍCULAS (VOD)</h2>
            <p className="text-xs text-slate-400">Soporta MP4, M4P, MKV, AVI, WebM</p>
          </div>
        </div>

        {/* 3. Series Tile */}
        <div
          onClick={() => setCurrentView('series')}
          className="group relative bg-slate-900/90 border-2 border-slate-800 hover:border-amber-500 rounded-3xl p-6 flex flex-col justify-between h-60 shadow-2xl cursor-pointer transition-all duration-300 transform hover:-translate-y-2 hover:shadow-amber-500/10 tv-focusable overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between z-10">
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-lg">
              <PlayCircle className="w-8 h-8" />
            </div>
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
              {(dbData?.vodItems || []).filter(v => v.type === 'series').length} series
            </span>
          </div>

          <div className="space-y-1 z-10">
            <h2 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">SERIES DE TV</h2>
            <p className="text-xs text-slate-400">Temporadas y Capítulos Anidados</p>
          </div>
        </div>

        {/* 4. Pro VIP Tile */}
        <div
          onClick={() => setCurrentView('provip')}
          className="group relative bg-slate-900/90 border-2 border-slate-800 hover:border-amber-500 rounded-3xl p-6 flex flex-col justify-between h-60 shadow-2xl cursor-pointer transition-all duration-300 transform hover:-translate-y-2 hover:shadow-amber-500/10 tv-focusable overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between z-10">
            <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-lg">
              <Zap className="w-8 h-8" />
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
              EVENTOS VIP
            </span>
          </div>

          <div className="space-y-1 z-10">
            <h2 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">CANALES PRO VIP</h2>
            <p className="text-xs text-slate-400">Transmisión Directa Alta Prioridad</p>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800 text-xs text-slate-500">
        <div>
          NeshTV IPTV Smarters Pro v5.1 · Motor Anti-Corte Deep Zero-Freeze
        </div>

        {dbData.supportNote?.whatsappNumber && (
          <a
            href={`https://wa.me/${dbData.supportNote.whatsappNumber.replace(/[^0-9]/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500 hover:text-slate-950 transition-colors tv-focusable"
          >
            <PhoneCall className="w-4 h-4" /> Soporte WhatsApp: {dbData.supportNote.whatsappNumber}
          </a>
        )}
      </footer>

      {/* Modals */}
      {showAdminPanel && (
        <AdminPanel
          initialAdminToken="master_admin_token_2026"
          onClose={() => setShowAdminPanel(false)}
          onRefreshData={fetchDbData}
        />
      )}

      {showAndroidModal && (
        <AndroidTvModal onClose={() => setShowAndroidModal(false)} />
      )}

      {/* Floating Admin Return Button for User Simulation */}
      {currentUser.isAdmin && !showAdminPanel && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setShowAdminPanel(true)}
            className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse tv-focusable cursor-pointer border-2 border-amber-300"
            title="Volver al Panel de Administración"
          >
            <Settings className="w-5 h-5" /> ⚙️ Volver al Panel de Administración
          </button>
        </div>
      )}
    </div>
  );
}
