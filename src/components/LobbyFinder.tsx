import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, 
  Search, 
  RefreshCw, 
  User, 
  Gamepad2, 
  ShieldAlert, 
  ArrowLeft, 
  Globe, 
  Flame, 
  Droplet, 
  Zap, 
  Wifi, 
  Crown,
  Play
} from 'lucide-react';

interface LobbyFinderProps {
  onBack: () => void;
  onJoin: (name: string, avatar: string, color: string, roomCode: string) => void;
  onCreate: (name: string, avatar: string, color: string) => void;
  liveRooms: Array<{ code: string; hostName: string; playerCount: number; status: string }>;
  onRefreshRooms: () => void;
  socketError: string | null;
  language: 'vi' | 'en';
}

const AVATARS = ['🔥', '💧', '⛰️', '⚡', '💨', '🐉', '👾', '🚀', '🔮', '🤖', '💀', '🦊', '🐱', '🦁', '🐼', '🐯'];
const COLORS = [
  '#ef4444', // Fire Red
  '#3b82f6', // Water Blue
  '#10b981', // Earth Emerald
  '#8b5cf6', // Lightning Violet
  '#f59e0b', // Amber
  '#ec4899', // Rose Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

const RANDOM_NAMES = [
  'HỏaThần', 'ThủyQuái', 'LôiMa', 'PhongLãngKhách', 'ThổThần',
  'ElementalKing', 'StormBringer', 'FlameLord', 'AquaHunter', 'GigaZapper',
  'ChiếnBinhRồng', 'SátThủBóngĐêm', 'PhápSưTốiThượng', 'LãngKháchCôĐộc', 'ChiếnThầnGaming'
];

export default function LobbyFinder({
  onBack,
  onJoin,
  onCreate,
  liveRooms,
  onRefreshRooms,
  socketError,
  language
}: LobbyFinderProps) {
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [roomCode, setRoomCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [localError, setLocalError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const content = {
    en: {
      back: "Back to Menu",
      heroConfig: "Configure Your Elemental Hero",
      nicknameLabel: "Hero Nickname",
      randomName: "Randomize 🎲",
      avatarLabel: "Select Element Avatar",
      colorLabel: "Energy Aura Color",
      publicRoomsTitle: "Public Element Battle Rooms",
      searchPlaceholder: "Search by room name or host...",
      refresh: "Refresh list",
      noRooms: "No public rooms available. Be the first to create one!",
      joinByCode: "Join with Room Code",
      codePlaceholder: "Enter 6-digit room code",
      joinButton: "Join Battle",
      createButton: "Create Battle Room",
      playersCount: "Players",
      statusWaiting: "Waiting in Lobby",
      statusPlaying: "Active Match",
      statusFull: "Lobby Full",
      invalidCode: "Please enter a valid 6-character room code.",
      needIdentity: "Configure your Hero Profile first!",
    },
    vi: {
      back: "Quay về Trang chủ",
      heroConfig: "Cấu hình Anh hùng Nguyên tố",
      nicknameLabel: "Tên anh hùng",
      randomName: "Ngẫu nhiên 🎲",
      avatarLabel: "Chọn Linh Vật Nguyên tố",
      colorLabel: "Màu Luân Xa Đại diện",
      publicRoomsTitle: "Phòng chơi Công khai hiện có",
      searchPlaceholder: "Tìm kiếm phòng, chủ phòng...",
      refresh: "Làm mới danh sách",
      noRooms: "Không có phòng chơi nào trực tuyến. Hãy tự tạo phòng đầu tiên!",
      joinByCode: "Gia nhập bằng Mã Phòng",
      codePlaceholder: "Nhập mã 6 ký tự",
      joinButton: "Vào chiến trường",
      createButton: "Tạo phòng đấu mới",
      playersCount: "Người chơi",
      statusWaiting: "Đang chờ khách",
      statusPlaying: "Trận đấu đang diễn ra",
      statusFull: "Phòng đã đầy",
      invalidCode: "Vui lòng nhập mã phòng 6 ký tự.",
      needIdentity: "Vui lòng cấu hình Hồ sơ Anh hùng của bạn trước!",
    }
  }[language];

  const randomizeName = () => {
    const randomIdx = Math.floor(Math.random() * RANDOM_NAMES.length);
    const suffix = Math.floor(Math.random() * 900 + 100);
    setName(`${RANDOM_NAMES[randomIdx]}#${suffix}`);
  };

  const getFinalName = () => {
    return name.trim() || `Hero_${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || roomCode.trim().length !== 6) {
      setLocalError(content.invalidCode);
      return;
    }
    setLocalError('');
    onJoin(getFinalName(), selectedAvatar, selectedColor, roomCode.toUpperCase().trim());
  };

  const handleCreateRoom = () => {
    setLocalError('');
    onCreate(getFinalName(), selectedAvatar, selectedColor);
  };

  const triggerRefresh = () => {
    setIsRefreshing(true);
    onRefreshRooms();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const activeRoomsCombined = liveRooms.map(r => ({
    code: r.code,
    hostName: r.hostName,
    playerCount: r.playerCount,
    maxCount: 12,
    status: r.status,
    ping: '15ms',
    element: r.code.charCodeAt(0) % 2 === 0 ? 'water' : 'fire'
  }));

  // Search filter
  const filteredRooms = activeRoomsCombined.filter(room => 
    room.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.hostName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full space-y-6">
      
      {/* Top action header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 py-2 px-4 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          {content.back}
        </button>
        
        <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
          <Globe className="w-3.5 h-3.5 animate-spin" />
          <span>REALTIME MULTIPLAYER SERVICE</span>
        </div>
      </div>

      {/* Grid container: Left side holds config + join by code; Right side holds public rooms list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: HERO CHARACTER CONFIGURATOR & JOIN CARD (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Character Config Card */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
            <div 
              className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-20 transition-all duration-500"
              style={{ backgroundColor: selectedColor }}
            />
            
            <div className="flex items-center gap-2 mb-4">
              <Gamepad2 className="w-5 h-5 text-indigo-400" />
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">
                {content.heroConfig}
              </h3>
            </div>

            <div className="space-y-4">
              {/* Nickname input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase">
                    {content.nicknameLabel}
                  </label>
                  <button
                    type="button"
                    onClick={randomizeName}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    {content.randomName}
                  </button>
                </div>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Nhập tên anh hùng..."
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setLocalError('');
                    }}
                    maxLength={16}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 focus:ring-1 focus:ring-indigo-500 text-white outline-none transition-all placeholder:text-slate-600 font-bold"
                  />
                </div>
              </div>

              {/* Avatar select */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  {content.avatarLabel} ({selectedAvatar})
                </label>
                <div className="grid grid-cols-8 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emoji)}
                      className={`text-xl p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer ${
                        selectedAvatar === emoji ? 'bg-indigo-600/30 border border-indigo-500 scale-110' : 'border border-transparent'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aura color */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  {content.colorLabel}
                </label>
                <div className="flex justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setSelectedColor(hex)}
                      className={`w-5 h-5 rounded-full cursor-pointer transition-transform relative ${
                        selectedColor === hex ? 'scale-125 ring-2 ring-white' : 'hover:scale-115'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Join by code Card */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">
              {content.joinByCode}
            </h3>

            <form onSubmit={handleJoinByCode} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder={content.codePlaceholder}
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase().trim());
                    setLocalError('');
                  }}
                  maxLength={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 focus:ring-1 focus:ring-indigo-500 text-white font-mono tracking-widest text-center text-lg outline-none transition-all placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                />
              </div>

              {localError && (
                <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-xl p-3 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{localError}</span>
                </div>
              )}

              {socketError && (
                <div className="bg-red-950/40 border border-red-800 text-red-300 rounded-xl p-3 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{socketError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-transform active:scale-[0.98] shadow-lg shadow-indigo-900/20 cursor-pointer"
              >
                {content.joinButton}
              </button>
            </form>

            <div className="relative flex items-center justify-center my-3">
              <hr className="w-full border-slate-800" />
              <span className="absolute px-3 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase">OR</span>
            </div>

            <button
              onClick={handleCreateRoom}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl border border-indigo-500/20 transition-transform active:scale-[0.98] shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current text-amber-400" />
              {content.createButton}
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: PUBLIC ROOMS DIRECTORY (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-2xl flex-1 flex flex-col justify-between">
            <div className="space-y-4 flex-1">
              
              {/* Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">
                  {content.publicRoomsTitle}
                </h3>

                <button
                  onClick={triggerRefresh}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-all cursor-pointer self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
                  {content.refresh}
                </button>
              </div>

              {/* Search input field */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder={content.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-11 pr-4 focus:ring-1 focus:ring-indigo-500 text-sm text-white outline-none transition-all placeholder:text-slate-600"
                />
              </div>

              {/* Rooms Grid / List */}
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {filteredRooms.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 space-y-3">
                    <Compass className="w-10 h-10 mx-auto text-slate-700 animate-pulse" />
                    <p className="text-sm">{content.noRooms}</p>
                  </div>
                ) : (
                  filteredRooms.map((room) => {
                    // Match visual styles
                    const isFull = room.playerCount >= room.maxCount;
                    const isPlaying = room.status === 'playing';
                    
                    return (
                      <motion.div
                        key={room.code}
                        layout
                        className="bg-slate-950 border border-slate-850 hover:border-indigo-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black tracking-wider text-indigo-400 text-sm">
                              {room.code}
                            </span>
                            
                            {/* Elemental symbol decoration */}
                            {room.element === 'fire' ? (
                              <Flame className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <Droplet className="w-3.5 h-3.5 text-blue-400" />
                            )}

                            {/* Status label badge */}
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              isPlaying
                                ? 'bg-purple-950/60 text-purple-400 border border-purple-800/20'
                                : isFull
                                  ? 'bg-red-950/60 text-red-400 border border-red-800/20'
                                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/20'
                            }`}>
                              {isPlaying ? content.statusPlaying : isFull ? content.statusFull : content.statusWaiting}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                            <Crown className="w-3 h-3 text-amber-500" />
                            <span>{room.hostName}</span>
                            <span className="text-slate-600">|</span>
                            <span>{room.playerCount}/{room.maxCount} {content.playersCount}</span>
                          </div>
                        </div>

                        {/* Action section inside row */}
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t border-slate-900 pt-3 sm:pt-0 sm:border-0">
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{room.ping}</span>
                          </div>

                          <button
                            onClick={() => {
                              if (isPlaying) {
                                setLocalError('Trận đấu đang diễn ra, không thể tham gia lúc này.');
                              } else if (isFull) {
                                setLocalError('Phòng đấu đã đầy thành viên.');
                              } else {
                                onJoin(getFinalName(), selectedAvatar, selectedColor, room.code);
                              }
                            }}
                            className={`py-2 px-4 rounded-lg font-bold text-xs transition-colors ${
                              isPlaying || isFull
                                ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800/60'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                            }`}
                          >
                            JOIN
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
