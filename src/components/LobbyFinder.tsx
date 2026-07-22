import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Compass, Crown, Gamepad2, Plus, RefreshCw, Search, ShieldAlert, User, Wifi } from 'lucide-react';

interface LobbyFinderProps {
  onBack: () => void;
  onJoin: (name: string, avatar: string, color: string, roomCode: string) => void;
  onCreate: (name: string, avatar: string, color: string) => void;
  liveRooms: Array<{ code: string; hostName: string; playerCount: number; status: string }>;
  onRefreshRooms: () => void;
  socketError: string | null;
  language: 'vi' | 'en';
}

type PlayerProfile = { name: string; avatar: string; color: string };
type PendingRoom = { type: 'join'; roomCode: string } | { type: 'create' };

const PROFILE_KEY = 'wote-player-profile';
const AVATARS = ['🔥', '💧', '⛰️', '⚡', '💨', '🐉', '👾', '🚀', '🔮', '🤖', '💀', '🦊', '🐱', '🦁', '🐼', '🐯'];
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'];

function loadProfile(): PlayerProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (saved && typeof saved.name === 'string' && AVATARS.includes(saved.avatar) && COLORS.includes(saved.color)) return saved;
  } catch { /* Invalid data is replaced when the profile is saved. */ }
  return { name: '', avatar: AVATARS[0], color: COLORS[0] };
}

export default function LobbyFinder({ onBack, onJoin, onCreate, liveRooms, onRefreshRooms, socketError, language }: LobbyFinderProps) {
  const [pendingRoom, setPendingRoom] = useState<PendingRoom | null>(null);
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  const [roomCode, setRoomCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [localError, setLocalError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const vi = language === 'vi';
  const rooms = useMemo(() => liveRooms.filter(room =>
    room.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.hostName.toLowerCase().includes(searchTerm.toLowerCase())
  ), [liveRooms, searchTerm]);

  useEffect(() => { setLocalError(''); }, [pendingRoom]);

  const selectRoom = (room: typeof liveRooms[number]) => {
    if (room.status !== 'lobby') return setLocalError(vi ? 'Trận đấu đã bắt đầu.' : 'The match has already started.');
    if (room.playerCount >= 12) return setLocalError(vi ? 'Phòng đã đầy.' : 'The room is full.');
    setPendingRoom({ type: 'join', roomCode: room.code });
  };

  const chooseCode = (event: React.FormEvent) => {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 6) return setLocalError(vi ? 'Mã phòng phải gồm 6 ký tự.' : 'Room code must contain 6 characters.');
    setPendingRoom({ type: 'join', roomCode: code });
  };

  const saveAndContinue = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanProfile = { ...profile, name: profile.name.trim() };
    if (!cleanProfile.name) return setLocalError(vi ? 'Hãy nhập tên người chơi.' : 'Enter a player name.');
    localStorage.setItem(PROFILE_KEY, JSON.stringify(cleanProfile));
    if (pendingRoom?.type === 'create') onCreate(cleanProfile.name, cleanProfile.avatar, cleanProfile.color);
    if (pendingRoom?.type === 'join') onJoin(cleanProfile.name, cleanProfile.avatar, cleanProfile.color, pendingRoom.roomCode);
  };

  const refresh = () => {
    setIsRefreshing(true);
    onRefreshRooms();
    window.setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button onClick={pendingRoom ? () => setPendingRoom(null) : onBack} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4" /> {pendingRoom ? (vi ? 'Chọn lại phòng' : 'Choose another room') : (vi ? 'Trang chủ' : 'Home')}
        </button>
        <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-2"><Wifi className="w-4 h-4" /> REALTIME</div>
      </div>

      {!pendingRoom ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <p className="text-indigo-400 text-xs font-black uppercase tracking-[.25em] mb-2">{vi ? 'Bước 1 / 2' : 'Step 1 / 2'}</p>
            <h2 className="text-3xl font-black">{vi ? 'Chọn cách tham gia' : 'Choose how to play'}</h2>
            <p className="text-slate-400 mt-2">{vi ? 'Chọn một phòng công khai, nhập mã mời hoặc mở phòng mới.' : 'Pick a public room, enter an invite code, or create a new room.'}</p>
          </div>

          {(localError || socketError) && <div className="p-3 rounded-xl border border-red-800 bg-red-950/40 text-red-300 text-sm flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />{localError || socketError}</div>}

          <div className="grid md:grid-cols-2 gap-4">
            <form onSubmit={chooseCode} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/70 space-y-3">
              <h3 className="font-black">{vi ? 'Nhập mã phòng' : 'Enter room code'}</h3>
              <input value={roomCode} onChange={e => { setRoomCode(e.target.value.toUpperCase().replace(/\s/g, '')); setLocalError(''); }} maxLength={6} placeholder="ABC123" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-center font-mono text-xl tracking-[.3em] outline-none focus:border-indigo-500" />
              <button className="w-full p-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold">{vi ? 'Tiếp tục' : 'Continue'}</button>
            </form>
            <button onClick={() => setPendingRoom({ type: 'create' })} className="p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-violet-950/80 to-slate-900 text-left hover:border-indigo-400 transition-colors">
              <Plus className="w-8 h-8 text-indigo-400 mb-4" />
              <h3 className="font-black text-lg">{vi ? 'Mở phòng mới' : 'Create a new room'}</h3>
              <p className="text-sm text-slate-400 mt-1">{vi ? 'Bạn sẽ là chủ phòng và có thể mời bạn bè bằng mã.' : 'Become the host and invite friends with a code.'}</p>
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <h3 className="font-black flex items-center gap-2"><Compass className="w-5 h-5 text-indigo-400" />{vi ? 'Phòng công khai' : 'Public rooms'}</h3>
              <div className="flex gap-2">
                <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={vi ? 'Tìm phòng...' : 'Search rooms...'} className="bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm outline-none" /></div>
                <button onClick={refresh} className="p-2 border border-slate-800 rounded-lg"><RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {rooms.length === 0 ? <div className="py-10 text-center text-slate-500">{vi ? 'Chưa có phòng công khai.' : 'No public rooms yet.'}</div> : rooms.map(room => {
                const available = room.status === 'lobby' && room.playerCount < 12;
                return <button key={room.code} onClick={() => selectRoom(room)} disabled={!available} className="w-full p-4 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between text-left disabled:opacity-45 hover:enabled:border-indigo-500">
                  <div><div className="font-mono font-black text-indigo-400">{room.code}</div><div className="text-xs text-slate-400 mt-1 flex gap-2 items-center"><Crown className="w-3 h-3 text-amber-400" />{room.hostName}</div></div>
                  <div className="text-right"><div className="font-bold text-sm">{room.playerCount}/12</div><div className={`text-xs ${available ? 'text-emerald-400' : 'text-slate-500'}`}>{available ? (vi ? 'Ấn để chọn' : 'Select') : (vi ? 'Không thể vào' : 'Unavailable')}</div></div>
                </button>;
              })}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.form onSubmit={saveAndContinue} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-xl mx-auto p-6 md:p-8 rounded-2xl border border-slate-800 bg-slate-900/70 space-y-6">
          <div><p className="text-indigo-400 text-xs font-black uppercase tracking-[.25em] mb-2">{vi ? 'Bước 2 / 2' : 'Step 2 / 2'}</p><h2 className="text-2xl font-black">{vi ? 'Cấu hình người chơi' : 'Player profile'}</h2><p className="text-slate-400 text-sm mt-2">{pendingRoom.type === 'create' ? (vi ? 'Bạn đang mở một phòng mới.' : 'You are creating a new room.') : `${vi ? 'Phòng đã chọn' : 'Selected room'}: ${pendingRoom.roomCode}`}</p></div>
          <div><label className="text-xs font-bold text-slate-400 uppercase">{vi ? 'Tên người chơi' : 'Player name'}</label><div className="relative mt-2"><User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" /><input autoFocus value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} maxLength={16} className="w-full p-3 pl-10 rounded-xl bg-slate-950 border border-slate-700 outline-none focus:border-indigo-500" placeholder={vi ? 'Nhập tên của bạn' : 'Enter your name'} /></div></div>
          <div><label className="text-xs font-bold text-slate-400 uppercase">Avatar</label><div className="grid grid-cols-8 gap-2 mt-2 p-3 bg-slate-950 rounded-xl">{AVATARS.map(avatar => <button type="button" key={avatar} onClick={() => setProfile({ ...profile, avatar })} className={`text-xl p-1 rounded-lg ${profile.avatar === avatar ? 'bg-indigo-600 ring-2 ring-indigo-300' : 'hover:bg-slate-800'}`}>{avatar}</button>)}</div></div>
          <div><label className="text-xs font-bold text-slate-400 uppercase">{vi ? 'Màu đại diện' : 'Profile color'}</label><div className="flex gap-4 mt-3">{COLORS.map(color => <button type="button" aria-label={color} key={color} onClick={() => setProfile({ ...profile, color })} style={{ backgroundColor: color }} className={`w-7 h-7 rounded-full ${profile.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''}`} />)}</div></div>
          {(localError || socketError) && <div className="p-3 rounded-xl border border-red-800 bg-red-950/40 text-red-300 text-sm flex gap-2"><ShieldAlert className="w-4 h-4" />{localError || socketError}</div>}
          <button type="submit" className="w-full p-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 font-black flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-violet-500"><Gamepad2 className="w-5 h-5" />{pendingRoom.type === 'create' ? (vi ? 'Lưu và mở phòng' : 'Save and create room') : (vi ? 'Lưu và vào phòng' : 'Save and join room')}</button>
          <p className="text-center text-xs text-slate-500">{vi ? 'Hồ sơ sẽ được lưu trên thiết bị này.' : 'Your profile will be saved on this device.'}</p>
        </motion.form>
      )}
    </div>
  );
}
