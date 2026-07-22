import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, Crown, MessageSquare, LogOut, Play, ShieldAlert, Terminal, Send } from 'lucide-react';
import { Room, ChatMessage } from '../types';
import { HERO_MAP } from '../heroes';

interface LobbyViewProps {
  room: Room;
  myPlayerId: string;
  chatMessages: ChatMessage[];
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
  socketError: string | null;
}

export default function LobbyView({
  room,
  myPlayerId,
  chatMessages,
  onStartGame,
  onLeaveRoom,
  onSendChat,
  socketError
}: LobbyViewProps) {
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const me = room.players.find(p => p.id === myPlayerId);
  const isHost = me?.isHost || false;
  const totalPlayers = room.players.length;
  const canStart = totalPlayers >= 3;

  // Copy Room Code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Chat Submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Construct a list of 12 slots to visually display "Up to 12 players"
  const lobbySlots = Array.from({ length: 12 }).map((_, idx) => {
    return room.players[idx] || null;
  });

  return (
    <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* LEFT & CENTER: Lobby Status & Player Slots (2 Columns on lg) */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Room Header Info */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Đang chờ trận đấu</span>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-2xl font-extrabold tracking-tight">Phòng của bạn</h1>
              <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-semibold text-slate-300">
                {totalPlayers}/12 Người chơi
              </span>
            </div>
          </div>

          {/* Room Code */}
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3">
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">MÃ PHÒNG CHƠI</p>
              <p className="font-mono text-xl font-bold tracking-widest text-white">{room.code}</p>
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
              title="Sao chép mã phòng"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 12-Player Slots Grid */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Sơ đồ vị trí trong phòng (Tối đa 12)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {lobbySlots.map((player, idx) => {
              if (player) {
                const isMe = player.id === myPlayerId;
                return (
                  <motion.div
                    key={player.id}
                    layoutId={`player-card-${player.id}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative bg-slate-900/60 border rounded-xl p-4 flex flex-col items-center justify-center text-center group transition-all"
                    style={{ borderColor: player.color }}
                  >
                    {/* Corner badge for Host */}
                    {player.isHost && (
                      <div className="absolute top-2 right-2 p-1 bg-amber-500/10 rounded-lg text-amber-500">
                        <Crown className="w-3.5 h-3.5 fill-current animate-bounce" />
                      </div>
                    )}

                    {/* Avatar with Glow indicator if Ready */}
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-3xl mb-2 relative"
                      style={{ 
                        backgroundColor: `${player.color}15`,
                        border: `2px solid ${player.color}`,
                        boxShadow: `0 0 15px ${player.color}40`
                      }}
                    >
                      {player.avatar}
                      {/* Live pulse for current user */}
                      {isMe && (
                        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-500 border border-slate-900"></span>
                        </span>
                      )}
                    </div>

                    <p className="font-semibold text-sm truncate max-w-full text-slate-200">
                      {player.name} {isMe && <span className="text-xs text-indigo-400">(Bạn)</span>}
                    </p>

                    <div className="mt-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ĐÃ VÀO PHÒNG</div>
                  </motion.div>
                );
              } else {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="border border-dashed border-slate-800/60 bg-slate-950/20 rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px]"
                  >
                    <div className="w-10 h-10 rounded-full border border-dashed border-slate-800 flex items-center justify-center mb-2">
                      <span className="text-slate-700 text-xs">{idx + 1}</span>
                    </div>
                    <span className="text-[11px] text-slate-600 font-medium animate-pulse">Trống...</span>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={onLeaveRoom}
            className="flex-1 py-3 px-4 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Rời Phòng
          </button>

          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`flex-[2] py-4 px-6 rounded-xl font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-transform duration-200 active:scale-[0.98] ${
                canStart
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-400'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              BẮT ĐẦU TRẬN ĐẤU ({totalPlayers} người chơi)
            </button>
          ) : (
            <div className="flex-[2] py-4 px-6 rounded-xl font-bold text-center bg-emerald-950/30 text-emerald-400 border border-emerald-800/40">Đã vào phòng · Đang chờ chủ phòng bắt đầu</div>
          )}
        </div>

        {/* Warning messages if some players are not ready */}
        {isHost && totalPlayers < 3 && (
          <div className="bg-rose-950/20 border border-rose-850 rounded-xl p-3 text-xs text-rose-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Trò chơi cần tối thiểu 3 người để khởi tranh. Hãy chia sẻ mã phòng cho bạn bè!</span>
          </div>
        )}

        {/* Display connection errors */}
        {socketError && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{socketError}</span>
          </div>
        )}
      </div>

      {/* RIGHT SIDE: Chat Panel & Server Console logs */}
      <div className="space-y-6">
        
        {/* Realtime Chat Board */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col h-[380px]">
          <div className="p-4 border-b border-slate-800/80 flex items-center gap-2 text-slate-300">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Kênh Chat Chung</h3>
          </div>

          {/* Chat text box */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center p-4">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-xs">Chưa có tin nhắn nào. Hãy gửi lời chào đến mọi người!</span>
              </div>
            ) : (
              chatMessages.map((msg, index) => (
                <div key={index} className="flex flex-col gap-0.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{msg.avatar}</span>
                    <span className="font-bold" style={{ color: msg.color }}>{msg.sender}</span>
                    <span className="text-[10px] text-slate-600">{msg.time}</span>
                  </div>
                  <div className="bg-slate-950/60 text-slate-300 py-1.5 px-2.5 rounded-lg border border-slate-800/50 max-w-[90%] break-all self-start ml-6">
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form */}
          <form onSubmit={handleChatSubmit} className="p-3 border-t border-slate-800/80 flex gap-2">
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              maxLength={100}
            />
            <button
              type="submit"
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Live System Logs / Terminal Console */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl flex flex-col h-[200px]">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>LOG HỆ THỐNG PHÒNG CHƠI</span>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          {/* Console Output */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] text-emerald-500 space-y-1">
            {room.systemLogs.length === 0 ? (
              <span className="text-slate-600">Đang lắng nghe hành động...</span>
            ) : (
              room.systemLogs.map((log, index) => (
                <div key={index} className="leading-relaxed whitespace-pre-wrap">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
