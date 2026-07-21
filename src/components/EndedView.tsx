import React from 'react';
import { motion } from 'motion/react';
import { Trophy, RotateCcw, Award, CheckCircle, RefreshCw, XCircle, ShieldCheck } from 'lucide-react';
import { Room } from '../types';

interface EndedViewProps {
  room: Room;
  myPlayerId: string;
  onRestartGame: () => void;
}

const KINGDOM_THEMES = {
  flame: {
    bg: 'bg-red-950/40',
    border: 'border-red-500/40',
    text: 'text-red-400',
    name: 'Flame Kingdom (Hỏa Quốc)',
    emoji: '🔥'
  },
  ocean: {
    bg: 'bg-sky-950/40',
    border: 'border-sky-500/40',
    text: 'text-sky-400',
    name: 'Ocean Kingdom (Thủy Quốc)',
    emoji: '💧'
  },
  forest: {
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    name: 'Forest Kingdom (Mộc Quốc)',
    emoji: '🌿'
  },
  storm: {
    bg: 'bg-violet-950/40',
    border: 'border-violet-500/40',
    text: 'text-violet-400',
    name: 'Storm Kingdom (Lôi Quốc)',
    emoji: '⚡'
  }
};

export default function EndedView({ room, myPlayerId, onRestartGame }: EndedViewProps) {
  const me = room.players.find(p => p.id === myPlayerId);
  const isHost = me?.isHost || false;

  const winnerKingdom = room.winnerKingdom;
  const winnerTheme = winnerKingdom ? KINGDOM_THEMES[winnerKingdom as keyof typeof KINGDOM_THEMES] : null;

  const didMyKingdomWin = me && me.kingdom === winnerKingdom;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      
      {/* Dynamic Game Result Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-3xl border p-8 text-center relative overflow-hidden shadow-2xl ${
          didMyKingdomWin
            ? 'bg-gradient-to-b from-emerald-950/40 to-slate-900/80 border-emerald-500/30'
            : 'bg-gradient-to-b from-slate-900 to-slate-950 border-slate-800'
        }`}
      >
        {/* Decorative ambient glowing circles */}
        <div 
          className={`absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-25 ${
            didMyKingdomWin ? 'bg-emerald-500' : 'bg-indigo-500'
          }`}
        />

        <div className="relative space-y-4">
          <div className="flex justify-center">
            {didMyKingdomWin ? (
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                <Trophy className="w-10 h-10 animate-[bounce_1.5s_infinite]" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <CheckCircle className="w-10 h-10 animate-pulse" />
              </div>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase">
            {didMyKingdomWin ? 'QUÂN ĐOÀN KHẢI HOÀN!' : 'TRẬN ĐẤU KHÉP LẠI!'}
          </h1>
          
          <div className="max-w-md mx-auto space-y-2">
            <p className="text-slate-400 text-sm leading-relaxed">
              Vương quốc giành chiến thắng tối cao trong cuộc tranh đấu nguyên tố lần này chính là:
            </p>
            {winnerTheme ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 border border-slate-850 rounded-xl">
                <span className="text-2xl">{winnerTheme.emoji}</span>
                <span className={`font-black tracking-widest text-lg uppercase ${winnerTheme.text}`}>
                  {winnerTheme.name}
                </span>
              </div>
            ) : (
              <span className="font-extrabold text-slate-400">Không phân định</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Detailed standings list and secret roles revealed */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Bảng Thân Phận Thực Sự Của Các Chiến Binh
          </h3>
          
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {room.players.map((player) => {
              const isMe = player.id === myPlayerId;
              const isWinner = player.kingdom === winnerKingdom;
              const theme = player.kingdom ? KINGDOM_THEMES[player.kingdom as keyof typeof KINGDOM_THEMES] : null;

              return (
                <div
                  key={player.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border gap-3 ${
                    isWinner 
                      ? 'bg-emerald-950/10 border-emerald-500/20' 
                      : 'bg-slate-950/40 border-slate-850/60'
                  }`}
                >
                  {/* Player avatar and name */}
                  <div className="flex items-center gap-3 truncate">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: `${player.color}15`, border: `1.5px solid ${player.color}` }}
                    >
                      {player.avatar}
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-sm text-slate-200 block truncate">
                        {player.name} {isMe && <span className="text-indigo-400 font-medium text-[10px]">(Bạn)</span>}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {player.isEliminated ? '💀 Đã gục ngã' : '💪 Sống sót đến cùng'}
                      </span>
                    </div>
                  </div>

                  {/* Secret Identity details */}
                  <div className="flex items-center gap-2.5">
                    {/* Hero role */}
                    {player.hero && (
                      <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-300 font-extrabold text-[10px] rounded-lg">
                        🦸 {player.hero}
                      </span>
                    )}

                    {/* Kingdom element */}
                    {theme && (
                      <span className={`px-2.5 py-1 bg-slate-950 border border-slate-850 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${theme.text}`}>
                        <span>{theme.emoji}</span> {theme.name.split(' ')[0]}
                      </span>
                    )}

                    {isWinner && (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                        <Award className="w-3 h-3" /> THẮNG
                      </span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* End Screen actions */}
      <div className="flex flex-col items-center gap-3">
        {isHost ? (
          <button
            onClick={onRestartGame}
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-xl shadow-indigo-950/50 flex items-center justify-center gap-2 cursor-pointer transition-transform duration-200 active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            TÁI THIẾT LẬP PHÒNG CHỜ (CHƠI LẠI)
          </button>
        ) : (
          <div className="w-full bg-slate-950 border border-slate-850 rounded-xl p-4 flex items-center justify-center gap-3 text-slate-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Đang chờ chủ phòng bắt đầu vòng đấu mới...</span>
          </div>
        )}
      </div>

    </div>
  );
}
