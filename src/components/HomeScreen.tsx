import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Volume2, 
  VolumeX, 
  Languages, 
  Settings, 
  Flame, 
  Droplet, 
  Zap, 
  Sparkles, 
  ShieldAlert, 
  X,
  Compass,
  Trophy
} from 'lucide-react';

interface HomeScreenProps {
  onPlayWithFriends: () => void;
  isSoundOn: boolean;
  onToggleSound: () => void;
  language: 'vi' | 'en';
  onToggleLanguage: () => void;
}

export default function HomeScreen({
  onPlayWithFriends,
  isSoundOn,
  onToggleSound,
  language,
  onToggleLanguage,
}: HomeScreenProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [selectedElement, setSelectedElement] = useState<'fire' | 'water' | 'earth' | 'lightning'>('fire');

  const content = {
    en: {
      slogan: "Master the Elements. Conquer the Battlefield.",
      friendsTitle: "Play Now",
      friendsDesc: "Browse public rooms, enter a code, or create your own battle.",
      settingsTitle: "Game Settings",
      difficulty: "Graphics Quality",
      serverRegion: "Server Region",
      close: "Close",
    },
    vi: {
      slogan: "Làm chủ Nguyên tố. Chinh phục Chiến trường.",
      friendsTitle: "Chơi ngay",
      friendsDesc: "Chọn phòng công khai, nhập mã hoặc mở phòng mới.",
      settingsTitle: "Cài đặt Game",
      difficulty: "Chất lượng đồ họa",
      serverRegion: "Khu vực Máy chủ",
      close: "Đóng",
    }
  }[language];

  // Element theme mappings for visual backgrounds
  const elementStyles = {
    fire: {
      color: '#ef4444',
      glow: 'shadow-red-500/20',
      bg: 'from-red-950/40 via-slate-900 to-slate-950',
      border: 'border-red-500/30',
      accent: 'text-red-400',
    },
    water: {
      color: '#3b82f6',
      glow: 'shadow-blue-500/20',
      bg: 'from-blue-950/40 via-slate-900 to-slate-950',
      border: 'border-blue-500/30',
      accent: 'text-blue-400',
    },
    earth: {
      color: '#10b981',
      glow: 'shadow-emerald-500/20',
      bg: 'from-emerald-950/40 via-slate-900 to-slate-950',
      border: 'border-emerald-500/30',
      accent: 'text-emerald-400',
    },
    lightning: {
      color: '#a855f7',
      glow: 'shadow-purple-500/20',
      bg: 'from-purple-950/40 via-slate-900 to-slate-950',
      border: 'border-purple-500/30',
      accent: 'text-purple-400',
    }
  };

  const activeStyle = elementStyles[selectedElement];

  return (
    <div className={`w-full min-h-[85vh] flex flex-col justify-between relative overflow-hidden transition-all duration-1000 bg-gradient-to-b ${activeStyle.bg}`}>
      
      {/* 1. TOP NAV / CONTROLS */}
      <div className="w-full max-w-6xl mx-auto flex justify-between items-center px-4 py-4 z-10">
        <div className="flex gap-2">
          {/* Active element switcher */}
          {(['fire', 'water', 'earth', 'lightning'] as const).map((el) => (
            <button
              key={el}
              onClick={() => setSelectedElement(el)}
              className={`p-2 rounded-lg border transition-all cursor-pointer capitalize flex items-center gap-1 text-xs font-bold ${
                selectedElement === el
                  ? 'bg-white/10 text-white border-white/20 shadow-lg'
                  : 'bg-black/30 text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              {el === 'fire' && <Flame className="w-3.5 h-3.5 text-red-500" />}
              {el === 'water' && <Droplet className="w-3.5 h-3.5 text-blue-400" />}
              {el === 'earth' && <Compass className="w-3.5 h-3.5 text-emerald-400" />}
              {el === 'lightning' && <Zap className="w-3.5 h-3.5 text-purple-400" />}
              <span className="hidden md:inline">{el}</span>
            </button>
          ))}
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSound}
            className="p-2.5 bg-slate-900/80 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Âm thanh"
          >
            {isSoundOn ? <Volume2 className="w-4 h-4 text-amber-500" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
          
          <button
            onClick={onToggleLanguage}
            className="p-2.5 bg-slate-900/80 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 font-bold text-xs"
            title="Ngôn ngữ / Language"
          >
            <Languages className="w-4 h-4 text-indigo-400" />
            <span className="uppercase">{language}</span>
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 bg-slate-900/80 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Cài đặt"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. HERO / LOGO SECTION */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center z-10">
        
        {/* Decorative elements container */}
        <div className="relative mb-4">
          {/* Ambient elemental glow rings */}
          <div className={`absolute -inset-10 bg-radial from-indigo-500/20 to-transparent blur-3xl rounded-full opacity-60 animate-pulse`} />
          
          {/* Animated floating small icons around logo */}
          <motion.div 
            animate={{ y: [0, -8, 0] }} 
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="absolute -top-12 -left-12 p-2 bg-red-500/10 border border-red-500/30 rounded-full text-red-400"
          >
            <Flame className="w-5 h-5 animate-pulse" />
          </motion.div>
          
          <motion.div 
            animate={{ y: [0, 8, 0] }} 
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 2 }}
            className="absolute -bottom-8 -right-12 p-2 bg-purple-500/10 border border-purple-500/30 rounded-full text-purple-400"
          >
            <Zap className="w-5 h-5 animate-pulse" />
          </motion.div>

          <span className="text-[10px] tracking-[0.25em] font-black uppercase text-amber-500/90 bg-amber-500/10 px-4 py-1.5 rounded-full border border-amber-500/20 shadow-sm animate-pulse mb-3 inline-block">
            TACTICAL MULTIPLAYER LOBBY
          </span>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 uppercase drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] filter">
            War of the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)]">Elements</span>
          </h1>
        </div>

        <p className="text-sm md:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed font-medium">
          {content.slogan}
        </p>
      </div>

      {/* 3. GAME MODE SELECTION */}
      <div className="w-full max-w-4xl mx-auto px-4 pb-16 z-10">
        <div className="max-w-xl mx-auto">
          {/* PLAY WITH FRIENDS */}
          <motion.div
            whileHover={{ y: -6, scale: 1.01 }}
            onClick={onPlayWithFriends}
            className="group relative bg-slate-900/40 backdrop-blur-md rounded-2xl border border-indigo-500/20 p-6 md:p-8 text-left cursor-pointer transition-all duration-300 hover:border-indigo-400/50 hover:bg-indigo-950/10 shadow-2xl overflow-hidden"
          >
            {/* Hover state intense light glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-emerald-500/5" />
            
            <div className="flex items-start gap-4">
              <div className="p-4 bg-slate-950 border border-indigo-500/30 rounded-xl text-indigo-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                <Users className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-200 group-hover:text-white transition-colors flex items-center gap-2">
                  {content.friendsTitle}
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </h3>
                <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors leading-relaxed">
                  {content.friendsDesc}
                </p>
                <div className="pt-3">
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 px-2.5 py-1 rounded-md border border-emerald-500/10">
                    REALTIME MULTIPLAYER
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* 4. FOOTER CREDITS */}
      <div className="w-full text-center py-6 text-[10px] text-slate-600 border-t border-slate-900 z-10 px-4 flex flex-col sm:flex-row justify-between items-center max-w-6xl mx-auto gap-2">
        <p>© 2026 War of the Elements. All rights reserved.</p>
        <p className="font-mono">Client: v1.4.2-AAA | Engine: Node WebSocket server</p>
      </div>

      {/* ================= MODAL: SETTINGS ================= */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            
            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10"
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                {content.settingsTitle}
              </h3>

              <div className="space-y-4 mb-6">
                {/* Graphics Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                    {content.difficulty}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['LOW', 'MEDIUM', 'ULTRA'].map((q) => (
                      <button
                        key={q}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          q === 'ULTRA'
                            ? 'bg-indigo-600 text-white shadow-lg'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Server Region */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                    {content.serverRegion}
                  </label>
                  <select className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-200 outline-none">
                    <option>Southeast Asia (Singapore) - 15ms</option>
                    <option>East Asia (Tokyo) - 62ms</option>
                    <option>North America (Oregon) - 145ms</option>
                    <option>Europe West (Frankfurt) - 190ms</option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all cursor-pointer"
              >
                {content.close}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
