import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Sword, 
  Heart, 
  Eye, 
  Layers, 
  Clock, 
  Info, 
  Check, 
  AlertTriangle, 
  RefreshCw, 
  ChevronRight, 
  Sparkles,
  User,
  X,
  Plus
} from 'lucide-react';
import { Room, Card, Player, CardType } from '../types';
import { HERO_MAP, ALL_HEROES, KINGDOM_NAMES, KINGDOM_EMOJI } from '../heroes';

interface GameViewProps {
  room: Room;
  myPlayerId: string;
  onPlayCard: (cardId: string, targetPlayerId?: string) => void;
  onRespondAction: (action: 'dodge' | 'strike' | 'heal' | 'pass' | 'discard' | 'reveal', cardId?: string, cardIds?: string[]) => void;
  onStealSelect: (targetType: 'hand' | 'equip', targetCardId?: string) => void;
  onDestroySelect: (targetCardId: string) => void;
  onCloseViewResult: () => void;
  onRevealHero: () => void;
  onEndTurn: () => void;
  onDiscardCards: (cardIds: string[]) => void;
}

const KINGDOM_THEMES = {
  flame: {
    bg: 'bg-red-950/40',
    border: 'border-red-500/40',
    glow: 'shadow-red-950/50',
    text: 'text-red-400',
    accent: 'bg-red-500',
    name: 'Flame Kingdom (Hỏa Hoả)',
    emoji: '🔥'
  },
  ocean: {
    bg: 'bg-sky-950/40',
    border: 'border-sky-500/40',
    glow: 'shadow-sky-950/50',
    text: 'text-sky-400',
    accent: 'bg-sky-500',
    name: 'Ocean Kingdom (Thủy Quốc)',
    emoji: '💧'
  },
  forest: {
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/40',
    glow: 'shadow-emerald-950/50',
    text: 'text-emerald-400',
    accent: 'bg-emerald-500',
    name: 'Forest Kingdom (Mộc Quốc)',
    emoji: '🌿'
  },
  storm: {
    bg: 'bg-violet-950/40',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-950/50',
    text: 'text-violet-400',
    accent: 'bg-violet-500',
    name: 'Storm Kingdom (Lôi Quốc)',
    emoji: '⚡'
  }
};

const PHASE_LABELS: Record<string, string> = {
  start: 'BẮT ĐẦU',
  draw: 'RÚT BÀI',
  action: 'HÀNH ĐỘNG',
  discard: 'BỎ BÀI',
  end: 'KẾT THÚC',
};

const PHASE_COLORS: Record<string, string> = {
  start: 'bg-violet-500/20 text-violet-400',
  draw: 'bg-blue-500/20 text-blue-400',
  action: 'bg-indigo-500/20 text-indigo-400',
  discard: 'bg-amber-500/20 text-amber-400',
  end: 'bg-emerald-500/20 text-emerald-400',
};

export default function GameView({
  room,
  myPlayerId,
  onPlayCard,
  onRespondAction,
  onStealSelect,
  onDestroySelect,
  onCloseViewResult,
  onRevealHero,
  onEndTurn,
  onDiscardCards
}: GameViewProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [discardSelections, setDiscardSelections] = useState<string[]>([]);
  const [responseSelections, setResponseSelections] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'battle' | 'rules' | 'history'>('battle');

  useEffect(() => {
    setResponseSelections([]);
  }, [room.activeAction?.id]);

  const me = room.players.find(p => p.id === myPlayerId);
  const turnPlayer = room.players.find(p => p.id === room.turnPlayerId);
  const isMyTurn = room.turnPlayerId === myPlayerId;
  const canUseDodge = Boolean(me?.cards.some(card => card.type === 'dodge'));

  const selectedCard = me?.cards.find(c => c.id === selectedCardId);

  // Helper: check if a card needs targeting
  const cardNeedsTarget = (card: Card) => {
    return [
      'heal',
      'strike', 
      'lightning', 
      'duel', 
      'explosion',
      'assassinate',
      'pursuit',
      'exchange', 
      'lock', 
      'stun',
      'freeze',
      'whirlwind',
      'bind',
      'view', 
      'steal', 
      'magnet',
      'connect', 
      'supply', 
      'protect',
      'rescue',
      'resonance',
      'pact',
      'investigate',
      'track',
      'trial',
      'provoke',
      'expose',
    ].includes(card.type);
  };

  // Helper: check if target selection is valid
  const isValidTarget = (targetPlayer: Player) => {
    if (!selectedCard || !me) return false;
    if (targetPlayer.id === myPlayerId && selectedCard.type !== 'heal') return false;
    if (targetPlayer.isEliminated) return false;

    const playerIdx = room.players.findIndex(p => p.id === myPlayerId);
    const targetIdx = room.players.findIndex(p => p.id === targetPlayer.id);
    let distance = Math.min(
      Math.abs(playerIdx - targetIdx),
      room.players.length - Math.abs(playerIdx - targetIdx),
    );
    const anchored = targetPlayer.equipments.some(equipment => equipment.type === 'iron_anchor');
    if (!anchored && me.magnetTargetId === targetPlayer.id) distance = 1;
    else {
      if (!anchored && me.equipments.some(equipment => equipment.type === 'wind_boots')) distance -= 1;
      if (!anchored && me.equipments.some(equipment => equipment.type === 'compass')) distance -= 1;
      if (targetPlayer.equipments.some(equipment => equipment.type === 'wind_wings')) distance += 1;
      if (targetPlayer.equipments.some(equipment => equipment.type === 'cloak')) distance += 1;
      distance = Math.max(1, distance);
    }
    if (targetPlayer.equipments.some(equipment => equipment.type === 'mist_screen') && distance >= 3) return false;

    // Strike range check
    if (selectedCard.type === 'strike') {
      const isFirstStrike = me.strikePlayedThisTurn === 0;
      const hasDart = me.equipments.some(e => e.type === 'dart');
      const hasInfiniteRange = isFirstStrike && ((me.isRevealed && me.hero === 'Bolt') || hasDart);
      if (hasInfiniteRange) return true;

      const weapon = me.equipments.find(e => e.equipSlot === 'weapon');
      const telescopeBonus = me.equipments.some(e => e.type === 'telescope') ? 2 : 0;
      const maxRange = (weapon?.range || 1) + telescopeBonus;

      return distance <= maxRange;
    }

    return true;
  };

  const handleCardClick = (cardId: string) => {
    if (room.activeAction?.type === 'waiting_for_provoke_choice' && room.activeAction.targetPlayerId === myPlayerId) {
      setResponseSelections(previous => previous.includes(cardId)
        ? previous.filter(id => id !== cardId)
        : previous.length < 2 ? [...previous, cardId] : previous);
      return;
    }
    if (room.turnPhase === 'discard') {
      if (discardSelections.includes(cardId)) {
        setDiscardSelections(prev => prev.filter(id => id !== cardId));
      } else {
        setDiscardSelections(prev => [...prev, cardId]);
      }
      return;
    }

    if (selectedCardId === cardId) {
      setSelectedCardId(null);
      setSelectedTargetId(null);
    } else {
      setSelectedCardId(cardId);
      setSelectedTargetId(null);
    }
  };

  const handlePlayCardAction = () => {
    if (!selectedCardId) return;
    const card = me?.cards.find(c => c.id === selectedCardId);
    if (!card) return;

    if (cardNeedsTarget(card)) {
      if (!selectedTargetId) return;
      onPlayCard(selectedCardId, selectedTargetId);
    } else {
      onPlayCard(selectedCardId);
    }

    // Reset selection
    setSelectedCardId(null);
    setSelectedTargetId(null);
  };

  const handleDiscardAction = () => {
    onDiscardCards(discardSelections);
    setDiscardSelections([]);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-5 min-h-[85vh]">
      
      {/* 1. STATE PANEL: Turn Info & Active action banner */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Lượt chơi hiện tại
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">
                {turnPlayer ? (turnPlayer.id === myPlayerId ? '🔥 LƯỢT CỦA BẠN' : `Lượt của: ${turnPlayer.name}`) : 'Đang chờ'}
              </span>
              {turnPlayer && room.turnPhase && (
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${PHASE_COLORS[room.turnPhase] || 'bg-slate-500/20 text-slate-400'}`}>
                  {PHASE_LABELS[room.turnPhase] || room.turnPhase}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Deck and Discard count metrics */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-slate-500" />
            <div className="text-xs">
              <p className="text-[9px] text-slate-600 font-bold uppercase">BÀI RÚT</p>
              <p className="font-mono font-bold text-slate-200">{room.deckCount} lá</p>
            </div>
          </div>
          <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-slate-500" />
            <div className="text-xs">
              <p className="text-[9px] text-slate-600 font-bold uppercase">BÀI BỎ</p>
              <p className="font-mono font-bold text-slate-200">{room.discardPileCount} lá</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN BATTLE ARENA GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        
        {/* LEFT & CENTER: Battlefield layout */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          
          {/* Active Action Resolution Banner */}
          <AnimatePresence>
            {room.activeAction && (
              <motion.div
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden"
              >
                {/* Glowing border accent */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse" />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  
                  <div className="flex items-start gap-3.5">
                    <span className="text-3xl p-1.5 bg-indigo-500/10 rounded-xl">{room.activeAction.card?.emoji || '🔮'}</span>
                    <div>
                      <span className="text-[10px] font-extrabold text-indigo-400 tracking-wider uppercase block">
                        ĐANG GIẢI QUYẾT CHIẾN THUẬT
                      </span>
                      <h4 className="text-base font-extrabold text-slate-100">
                        {room.players.find(p => p.id === room.activeAction?.sourcePlayerId)?.name} 
                        {` dùng [${room.activeAction.card?.name}] `}
                        nhắm vào {room.players.find(p => p.id === room.activeAction?.targetPlayerId)?.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-md">
                        {room.activeAction.type === 'waiting_for_dodge' && 'Yêu cầu mục tiêu tung lá ĐỠ (dodge) để chặn đòn.'}
                        {room.activeAction.type === 'waiting_for_duel_strike' && `QUYẾT ĐẤU kịch tính! Đến lượt ${room.players.find(p => p.id === room.activeAction?.duelTurnPlayerId)?.name} phải phóng lá ĐÁNH (strike).`}
                        {room.activeAction.type === 'waiting_for_volt_strike' && '⚡ VOLT có thể dùng ngay một lá ĐÁNH để phản công, hoặc bỏ qua.'}
                        {room.activeAction.type === 'waiting_for_axe_discard' && '🪓 Người tấn công có thể bỏ 1 lá để Rìu vẫn gây sát thương.'}
                        {room.activeAction.type === 'waiting_for_long_sword_discard' && '⚔️ Hãy chọn 1 lá trên tay để bỏ cho hiệu ứng Trường Kiếm.'}
                        {room.activeAction.type === 'select_destroy_equipment' && '🌪️ Hãy chọn một trang bị của mục tiêu để phá hủy.'}
                        {room.activeAction.type === 'waiting_for_trial_choice' && '🔥 Mục tiêu phải lật nhân vật hoặc nhận 1 sát thương.'}
                        {room.activeAction.type === 'waiting_for_provoke_choice' && '⚔️ Mục tiêu phải lật nhân vật hoặc bỏ ngẫu nhiên 2 lá.'}
                        {room.activeAction.type === 'waiting_for_dying_heal' && '🔥 CỨU NGUY ĐỒNG ĐỘI! Thân chủ đang cận kề tử thần. Cần hồi sức gấp bằng lá HỒI (heal).'}
                        {room.activeAction.type === 'select_steal' && 'Đang lựa chọn lá bài/trang bị để cướp đoạt.'}
                        {room.activeAction.type === 'view_hand_result' && 'Đang hiển thị lá bài xem lén.'}
                      </p>
                    </div>
                  </div>

                  {/* Reactive controls depending on role */}
                  <div className="shrink-0 flex items-center gap-2">
                    {/* If I need to respond to a Strike/Fire with Dodge */}
                    {room.activeAction.type === 'waiting_for_dodge' && room.activeAction.targetPlayerId === myPlayerId && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const dCard = me?.cards.find(c => c.type === 'dodge');
                            if (dCard) {
                              onRespondAction('dodge', dCard.id);
                            }
                          }}
                          disabled={!canUseDodge}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Đỡ đòn
                        </button>
                        <button
                          onClick={() => onRespondAction('pass')}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Bỏ qua
                        </button>
                      </div>
                    )}

                    {/* If I need to respond to a Duel with Strike */}
                    {room.activeAction.type === 'waiting_for_duel_strike' && room.activeAction.duelTurnPlayerId === myPlayerId && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const sCard = me?.cards.find(c => c.type === 'strike');
                            if (sCard) {
                              onRespondAction('strike', sCard.id);
                            }
                          }}
                          disabled={!me?.cards.some(c => c.type === 'strike')}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Đánh trả
                        </button>
                        <button
                          onClick={() => onRespondAction('pass')}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Chịu thua
                        </button>
                      </div>
                    )}

                    {room.activeAction.type === 'waiting_for_volt_strike' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className={'flex gap-2'}>
                        <button className={'px-4 py-2 bg-purple-600 hover:bg-purple-500 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('strike', me?.cards.find(item => item.type === 'strike')?.id)}>Volt phản công</button>
                        <button className={'px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('pass')}>Bỏ qua</button>
                      </div>
                    )}
                    {room.activeAction.type === 'waiting_for_axe_discard' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className={'flex gap-2 flex-wrap'}>
                        {me?.cards.map(card => <button key={card.id} className={'px-3 py-2 bg-orange-700 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('discard', card.id)}>Bỏ {card.emoji} {card.name}</button>)}
                        <button className={'px-4 py-2 bg-slate-800 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('pass')}>Bỏ qua</button>
                      </div>
                    )}
                    {room.activeAction.type === 'waiting_for_long_sword_discard' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className={'flex gap-2 flex-wrap'}>
                        {me?.cards.map(card => <button key={card.id} className={'px-3 py-2 bg-indigo-700 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('discard', card.id)}>Bỏ {card.emoji} {card.name}</button>)}
                      </div>
                    )}
                    {room.activeAction.type === 'waiting_for_trial_choice' && room.activeAction.targetPlayerId === myPlayerId && (
                      <div className={'flex gap-2'}>
                        <button className={'px-4 py-2 bg-amber-600 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('reveal')}>Lật nhân vật</button>
                        <button className={'px-4 py-2 bg-red-700 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('pass')}>Nhận sát thương</button>
                      </div>
                    )}
                    {room.activeAction.type === 'waiting_for_provoke_choice' && room.activeAction.targetPlayerId === myPlayerId && (
                      <div className={'flex gap-2'}>
                        <button className={'px-4 py-2 bg-amber-600 font-bold text-xs rounded-xl'} onClick={() => onRespondAction('reveal')}>Lật nhân vật</button>
                        <button className={'px-4 py-2 bg-rose-700 font-bold text-xs rounded-xl'} disabled={responseSelections.length !== 2} onClick={() => onRespondAction('discard', undefined, responseSelections)}>Bỏ 2 lá ({responseSelections.length}/2)</button>
                      </div>
                    )}
                    {/* If someone is dying, let players (including themselves) save them */}
                    {room.activeAction.type === 'waiting_for_dying_heal' && (
                      <div className="flex items-center gap-2.5">
                        <span className="text-red-500 animate-pulse font-mono font-black text-sm">Hấp hối!</span>
                        <button
                          onClick={() => {
                            const hCard = me?.cards.find(c => c.type === 'heal');
                            if (hCard) {
                              onRespondAction('heal', hCard.id);
                            }
                          }}
                          disabled={!me?.cards.some(c => c.type === 'heal')}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 font-black text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Dùng HỒI cứu mạng
                        </button>
                      </div>
                    )}

                    {room.activeAction.type === 'select_destroy_equipment' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className={'flex gap-2 flex-wrap'}>
                        {room.players.find(player => player.id === room.activeAction?.targetPlayerId)?.equipments.map(equipment => (
                          <button key={equipment.id} className={'px-3 py-2 bg-rose-700 font-bold text-xs rounded-xl'} onClick={() => onDestroySelect(equipment.id)}>Phá {equipment.emoji} {equipment.name}</button>
                        ))}
                      </div>
                    )}

                    {/* Steal Select Screen for Stealer */}
                    {room.activeAction.type === 'select_steal' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className="flex flex-col gap-2 p-1 border border-slate-800 rounded-xl bg-slate-900">
                        <p className="text-[10px] text-slate-400 px-2 font-bold uppercase">CHỌN VẬT CẦN CƯỚP</p>
                        <div className="flex gap-2 p-1">
                          {/* Option to steal random hand card */}
                          <button
                            onClick={() => onStealSelect('hand')}
                            className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Bài trên tay ({room.players.find(p => p.id === room.activeAction?.targetPlayerId)?.cardsCount})
                          </button>
                          
                          {/* Equipped cards to steal */}
                          {room.players.find(p => p.id === room.activeAction?.targetPlayerId)?.equipments.map(eq => (
                            <button
                              key={eq.id}
                              onClick={() => onStealSelect('equip', eq.id)}
                              className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <span>{eq.emoji}</span> {eq.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* View Hand Result for Viewer */}
                    {room.activeAction.type === 'view_hand_result' && room.activeAction.sourcePlayerId === myPlayerId && (
                      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center gap-3">
                        <div className="text-xs">
                          <p className="text-[9px] text-slate-400 font-bold uppercase">LÁ BÀI XEM LÉN</p>
                          <p className="font-extrabold text-indigo-400">{room.activeAction.viewedCard?.emoji} {room.activeAction.viewedCard?.name}</p>
                        </div>
                        <button
                          onClick={onCloseViewResult}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Opponents Grid: The Battlefield */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Sword className="w-3.5 h-3.5" /> Bản đồ chiến trường đối thủ
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {room.players.filter(p => p.id !== myPlayerId).map((player) => {
                const isTargetSelected = selectedTargetId === player.id;
                const canTargetThis = selectedCard && isValidTarget(player);
                const theme = player.kingdom ? KINGDOM_THEMES[player.kingdom as keyof typeof KINGDOM_THEMES] : null;

                // Connection indicator if they are revealed as teammate
                const isMyTeam = me && player.kingdom && me.revealedTeammates.includes(player.id);

                return (
                  <motion.div
                    key={player.id}
                    className={`relative border rounded-2xl p-4 flex flex-col justify-between h-[175px] transition-all overflow-hidden ${
                      player.isEliminated 
                        ? 'bg-slate-950/20 border-slate-900 opacity-65' 
                        : isTargetSelected 
                          ? 'bg-indigo-950/30 border-indigo-500 shadow-lg shadow-indigo-950/40' 
                          : theme 
                            ? `${theme.bg} ${theme.border} ${theme.glow}` 
                            : 'bg-slate-900/40 border-slate-800/80'
                    }`}
                  >
                    {/* Team tag banner if revealed teammate */}
                    {isMyTeam && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-indigo-500" />
                    )}

                    {/* Top Row: Name, element & locks */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="truncate">
                        <div className="flex items-center gap-1">
                          <span className="text-lg shrink-0">{player.avatar}</span>
                          <h4 className="font-bold text-xs truncate text-slate-100">{player.name}</h4>
                        </div>
                        
                        <div className="flex items-center gap-1 mt-1">
                          {player.isRevealed ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-extrabold uppercase bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300">
                                {player.hero}
                              </span>
                              {player.hero && HERO_MAP[player.hero] && (
                                <span className="text-[7px] text-slate-600 font-medium">{HERO_MAP[player.hero].role}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">
                              Ẩn Thân
                            </span>
                          )}

                          {player.isLocked && (
                            <span className="px-1.5 py-0.5 bg-red-950/50 border border-red-900 text-red-500 rounded text-[8px] font-black uppercase">
                              LOCKED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Kingdom elemental icon indicator */}
                      {player.kingdom && (
                        <div 
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                          style={{ backgroundColor: theme ? `${theme.accent}15` : '#1e293b' }}
                          title={theme?.name}
                        >
                          {theme?.emoji}
                        </div>
                      )}
                    </div>

                    {/* Middle info: HP Bar & status cards count */}
                    <div className="my-2.5 space-y-2">
                      {/* Health Points */}
                      <div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold mb-0.5">
                          <span>SINH MỆNH (HP)</span>
                          <span className="font-mono">
                            {player.isEliminated ? 'Đã gục' : player.hp !== undefined ? `${player.hp}/${player.maxHp}` : 'Ẩn HP'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 p-0.5">
                          {player.isEliminated ? (
                            <div className="h-full bg-slate-800 rounded-full w-0" />
                          ) : player.hp !== undefined && player.maxHp !== undefined ? (
                            <div 
                              className="h-full bg-gradient-to-r from-rose-600 to-red-500 rounded-full transition-all"
                              style={{ width: `${(player.hp / player.maxHp) * 100}%` }}
                            />
                          ) : (
                            <div className="h-full bg-slate-800 rounded-full w-full border-b-2 border-slate-700 border-dotted" />
                          )}
                        </div>
                      </div>

                      {/* Action status tags */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 bg-slate-950/50 border border-slate-800/60 px-2 py-0.5 rounded-lg">
                          <Layers className="w-3 h-3 text-slate-600" />
                          <span className="font-mono text-slate-300 font-black">{player.cardsCount}</span> lá tay
                        </span>

                        {player.protectedByPlayerId && (
                          <span className="text-[8px] text-indigo-400 font-bold border border-indigo-500/20 bg-indigo-505/10 px-1.5 py-0.5 rounded-md">
                            Che Chở
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom row: Equipment Slots or Select button */}
                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-2.5">
                      <div className="flex gap-1">
                        {(['weapon', 'armor', 'accessory'] as const).map((eqType) => {
                          const equipped = player.equipments.find(e => e.equipSlot === eqType);
                          return (
                            <div 
                              key={eqType}
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] ${
                                equipped ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-950 border border-slate-900 text-slate-800'
                              }`}
                              title={equipped ? `${equipped.name}: ${equipped.description}` : `Trống slot ${eqType}`}
                            >
                              {equipped ? equipped.emoji : (
                                eqType === 'weapon' ? '⚔️' : eqType === 'armor' ? '🛡️' : '🧭'
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Selection target handle */}
                      {canTargetThis && (
                        <button
                          onClick={() => setSelectedTargetId(player.id)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer uppercase transition-all ${
                            isTargetSelected 
                              ? 'bg-indigo-500 text-white' 
                              : 'bg-indigo-600/30 border border-indigo-500/30 hover:bg-indigo-600/50 text-indigo-400'
                          }`}
                        >
                          Mục Tiêu
                        </button>
                      )}
                    </div>

                    {/* Skull watermark if eliminated */}
                    {player.isEliminated && (
                      <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center pointer-events-none">
                        <span className="text-4xl text-slate-600 font-black tracking-widest uppercase origin-center rotate-12 select-none">
                          DIỆT VONG 💀
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Interactive Tabs (History logs, character lists, guidelines) */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-3xl p-5 flex flex-col h-[520px]">
          
          {/* Navigation Tab list */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl mb-4 text-xs font-bold text-slate-400">
            <button
              onClick={() => setActiveTab('battle')}
              className={`py-1.5 rounded-lg cursor-pointer transition-all ${
                activeTab === 'battle' ? 'bg-slate-850 text-white shadow' : 'hover:text-slate-300'
              }`}
            >
              Phái Chiến
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`py-1.5 rounded-lg cursor-pointer transition-all ${
                activeTab === 'rules' ? 'bg-slate-850 text-white shadow' : 'hover:text-slate-300'
              }`}
            >
              Kỹ Năng
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-1.5 rounded-lg cursor-pointer transition-all ${
                activeTab === 'history' ? 'bg-slate-850 text-white shadow' : 'hover:text-slate-300'
              }`}
            >
              Diễn Biến
            </button>
          </div>

          {/* Tab contents */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'battle' && (
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wide">
                  Tình hình lực lượng vương quốc
                </h4>
                
                {/* Kingdom state lists */}
                {['flame', 'ocean', 'forest', 'storm'].map((k) => {
                  const theme = KINGDOM_THEMES[k as keyof typeof KINGDOM_THEMES];
                  const playersInK = room.players.filter(p => p.kingdom === k);
                  if (playersInK.length === 0) return null;

                  const aliveCount = playersInK.filter(p => !p.isEliminated).length;

                  return (
                    <div 
                      key={k} 
                      className={`border p-3.5 rounded-xl space-y-2 ${theme.bg} ${theme.border}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                          <span>{theme.emoji}</span> {theme.name}
                        </span>
                        <span className="text-[10px] font-bold text-indigo-400">
                          Sống sót: {aliveCount}/{playersInK.length}
                        </span>
                      </div>

                      {/* mini players status lists */}
                      <div className="space-y-1">
                        {playersInK.map(p => (
                          <div key={p.id} className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-300 font-semibold">{p.name} {p.id === myPlayerId && '(Bạn)'}</span>
                            <span className={`font-mono text-[10px] ${p.isEliminated ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                              {p.isEliminated ? 'Đã hy sinh' : p.isRevealed ? `Đã Lộ: ${p.hero}` : 'Chưa Lộ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'rules' && (
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-1 text-indigo-400">
                  <Info className="w-3.5 h-3.5" /> Thống kê kỹ năng anh hùng
                </h4>
                <div className="space-y-2 text-xs">
                  {room.players.filter(p => p.hero).map((p, idx) => {
                    const heroData = p.hero ? HERO_MAP[p.hero] : null;
                    if (!heroData) return null;
                    return (
                      <div key={p.hero || idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl leading-relaxed">
                        <span className="font-extrabold text-indigo-400 block mb-0.5">{p.hero} <span className="text-[9px] text-slate-500 font-normal">({heroData.role})</span></span>
                        <span className="text-slate-400 text-[11px] block">{heroData.skillDesc}</span>
                        <span className="text-slate-600 text-[9px] italic mt-1 block">{heroData.flavorText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-1.5 font-mono text-[10px] text-emerald-500 p-1">
                {room.systemLogs.length === 0 ? (
                  <span className="text-slate-600 block text-center py-6">Đang lắng nghe lịch sử trận đánh...</span>
                ) : (
                  room.systemLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed border-b border-slate-950 pb-1 flex gap-1">
                      <span className="text-slate-700 shrink-0">❖</span>
                      <span>{log}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-850 pt-3 text-[11px] text-slate-500 text-center flex justify-center items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Kết nối đồng bộ thời gian thực siêu mượt</span>
          </div>

        </div>

      </div>

      {/* 3. FOOTER ZONE: My Player Status Panel, hand, and skills */}
      {me && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-stretch gap-6">
          
          {/* My Hero Profile card */}
          <div className="md:w-1/4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 pb-5 md:pb-0 md:pr-6 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-3xl"
                  style={{ backgroundColor: `${me.color}15`, border: `2px solid ${me.color}` }}
                >
                  {me.avatar}
                </div>
                <div>
                  <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block">Thông tin của bạn</span>
                  <h4 className="font-extrabold text-base text-white">{me.name}</h4>
                </div>
              </div>

              {/* Elemental theme if revealed or private */}
              <div className="mt-3 bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vương Quốc:</span>
                  <span className="font-bold text-slate-200">
                    {me.kingdom ? (
                      <span className="flex items-center gap-1">
                        <span>{KINGDOM_THEMES[me.kingdom as keyof typeof KINGDOM_THEMES]?.emoji}</span>
                        <span>{KINGDOM_THEMES[me.kingdom as keyof typeof KINGDOM_THEMES]?.name}</span>
                      </span>
                    ) : 'Chờ phân định'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Anh Hùng:</span>
                  <span className="font-extrabold text-indigo-400">{me.hero || 'Chờ phân định'}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                  <span className="text-slate-500">Trạng Thái Lộ:</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                    me.isRevealed ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {me.isRevealed ? 'Đã Lộ Nhân Vật' : 'Ẩn Danh Tính'}
                  </span>
                </div>
              </div>
            </div>

            {/* HP and Skill info */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
                  <span>SINH MỆNH (HP)</span>
                  <span className="font-mono font-black text-slate-200">{me.hp}/{me.maxHp} HP</span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-850 p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 rounded-full transition-all"
                    style={{ width: `${(me.hp / me.maxHp) * 100}%` }}
                  />
                </div>
              </div>

              {/* Reveal Hero action triggers */}
              {!me.isRevealed && !me.isEliminated && isMyTurn && room.turnPhase === 'action' && !room.activeAction && (
                <button
                  onClick={onRevealHero}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer transition-transform duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 fill-current text-amber-300 animate-spin" />
                  LẬT NHÂN VẬT (+1 LÁ)
                </button>
              )}

              {/* Skill Description */}
              {me.isRevealed && me.hero && (
                <div className="p-2.5 bg-indigo-950/20 border border-indigo-500/20 rounded-xl">
                  <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block">Kỹ năng đặc quyền [KÍCH HOẠT]</span>
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider block mb-1">Phase: {me.hero ? HERO_MAP[me.hero]?.skillPhase : ''}</span>
                  <p className="text-[10.5px] text-slate-300 mt-0.5 leading-relaxed">
                    {me.hero ? (HERO_MAP[me.hero]?.skillDesc || 'Chưa có dữ liệu') : ''}
                  </p>
                  {me.hero && HERO_MAP[me.hero]?.flavorText && (
                    <p className="text-[8px] text-slate-600 italic mt-1">"{HERO_MAP[me.hero].flavorText}"</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hand cards selection panel */}
          <div className="flex-1 flex flex-col justify-between gap-4">
            
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" /> Bài Trên Tay của bạn ({me.cards.length} Lá)
              </h4>

              {/* Turn phase indicators & End turn button */}
              {isMyTurn && (
                <div className="flex items-center gap-2">
                  {room.turnPhase === 'action' ? (
                    <button
                      onClick={onEndTurn}
                      disabled={Boolean(room.activeAction)}
                      className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-black text-xs rounded-xl cursor-pointer shadow transition-all flex items-center gap-1"
                    >
                      Kết thúc Hành Động <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : room.turnPhase === 'discard' ? (
                    <button
                      onClick={handleDiscardAction}
                      disabled={discardSelections.length !== (me.cards.length - me.hp)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 font-black text-xs rounded-xl cursor-pointer shadow transition-all flex items-center gap-1"
                    >
                      Bỏ bài ({discardSelections.length}/{me.cards.length - me.hp})
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {/* Cards view scroll list */}
            <div className="flex-1 overflow-x-auto min-h-[140px] flex items-center gap-2.5 pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {me.cards.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center text-slate-600 text-xs py-6">
                  <Layers className="w-8 h-8 opacity-25 mb-1.5" />
                  <span>Trống rỗng. Bạn không giữ bất kỳ lá bài nào.</span>
                </div>
              ) : (
                me.cards.map((card) => {
                  const isSelected = selectedCardId === card.id;
                  const isDiscardSelected = discardSelections.includes(card.id) || responseSelections.includes(card.id);
                  
                  return (
                    <motion.div
                      key={card.id}
                      onClick={() => handleCardClick(card.id)}
                      whileHover={{ y: -6, scale: 1.02 }}
                      className={`w-28 h-36 shrink-0 border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all select-none relative ${
                        isDiscardSelected
                          ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-950/50'
                          : isSelected
                            ? 'bg-indigo-950/40 border-indigo-500 shadow-xl shadow-indigo-950/60'
                            : card.category === 'basic'
                              ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                              : card.category === 'tactical'
                                ? 'bg-slate-900 border-indigo-950/80 hover:border-indigo-900'
                                : card.category === 'equip'
                                  ? 'bg-slate-950 border-amber-950 hover:border-amber-900'
                                  : 'bg-slate-950 border-emerald-950 hover:border-emerald-900'
                      }`}
                    >
                      {/* Top icon and label */}
                      <div className="flex justify-between items-start">
                        <span className="text-xl">{card.emoji}</span>
                        <span className={`px-1 rounded text-[7.5px] font-bold uppercase tracking-wider ${
                          card.category === 'basic' ? 'bg-slate-800 text-slate-400' :
                          card.category === 'tactical' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60' :
                          card.category === 'equip' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
                          'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                        }`}>
                          {card.category === 'basic' ? 'Cơ Bản' : card.category === 'tactical' ? 'K.Thuật' : card.category === 'equip' ? 'T.Bị' : 'Đồng Đội'}
                        </span>
                      </div>

                      {/* Title & description */}
                      <div className="space-y-0.5">
                        <p className="font-extrabold text-[11px] text-slate-200 truncate">{card.name}</p>
                        <p className="text-[7.5px] text-slate-500 leading-normal line-clamp-3">{card.description}</p>
                      </div>

                      {/* Selected dot indicator */}
                      {(isSelected || isDiscardSelected) && (
                        <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black ${
                          isDiscardSelected ? 'bg-rose-500' : 'bg-indigo-500'
                        }`}>
                          ✓
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Selected Card Action details */}
            <div className="min-h-[44px] flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl text-xs">
              <div className="text-slate-400 flex items-center gap-1">
                {selectedCard ? (
                  <>
                    <span className="font-extrabold text-white">[ {selectedCard.name} ]</span>
                    <span>-</span>
                    <span className="text-[11px]">{selectedCard.description}</span>
                    {cardNeedsTarget(selectedCard) && (
                      <span className="text-indigo-400 font-bold ml-1 flex items-center gap-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-bounce" /> Hãy bấm chọn đối thủ trên bản đồ!
                      </span>
                    )}
                  </>
                ) : (
                  <span>Hãy chọn 1 lá bài từ tay để xem chi tiết hoặc thực hiện hành động.</span>
                )}
              </div>

              {/* Action play triggers */}
              {selectedCard && isMyTurn && room.turnPhase === 'action' && !room.activeAction && (
                <button
                  onClick={handlePlayCardAction}
                  disabled={cardNeedsTarget(selectedCard) && !selectedTargetId}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer transition-all uppercase"
                >
                  {cardNeedsTarget(selectedCard) ? 'Sử Dụng Lên Mục Tiêu' : 'Kích Hoạt Thẻ Bài'}
                </button>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
