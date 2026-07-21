export type CardType =
  | 'strike'    // Đánh
  | 'dodge'     // Đỡ
  | 'heal'      // Hồi
  | 'fire'      // Lửa
  | 'lightning' // Sét
  | 'duel'      // Đấu
  | 'draw'      // Rút
  | 'exchange'  // Đổi
  | 'lock'      // Khóa
  | 'view'      // Xem
  | 'steal'     // Cướp
  | 'sword'     // Kiếm
  | 'shield'    // Khiên
  | 'boots'     // Giày
  | 'ring'      // Nhẫn
  | 'connect'   // Kết Nối
  | 'supply'    // Tiếp Tế
  | 'protect';  // Che Chở

export interface Card {
  id: string;
  type: CardType;
  name: string;
  emoji: string;
  category: 'basic' | 'tactical' | 'equip' | 'teammate';
  description: string;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
  score: number; // Keep score for backward compatibility or display

  // Card Game Fields
  kingdom?: 'flame' | 'ocean' | 'forest' | 'storm';
  hero?: string; // Ember, Blaze, Pyro, Aqua, Coral, Mist, Flora, Moss, Bloom, Bolt, Spark, Volt
  hp: number;
  maxHp: number;
  isRevealed: boolean;
  isEliminated: boolean;
  cards: Card[];
  cardsCount?: number; // Count of hand cards (sent to other clients for hidden hands)
  equipments: Card[];
  revealedTeammates: string[]; // List of other player IDs known to be teammates
  isLocked: boolean; // Locked skill due to 'Khóa' card
  shieldFirstBlockActive: boolean; // Tracks if the Shield armor item's first-damage block is active this turn
  protectingPlayerId: string | null; // ID of player this player is protecting (Che Chở)
  protectedByPlayerId: string | null; // ID of player who is protecting this player
  strikePlayedThisTurn: number; // Strike counts
  dodgesUsedThisTurn: number; // Dodge responses used during the current turn
}

export interface ActiveActionState {
  id: string;
  type: 'waiting_for_dodge' | 'waiting_for_duel_strike' | 'waiting_for_dying_heal' | 'waiting_for_volt_strike' | 'view_hand_result' | 'select_steal' | 'select_exchange';
  card: Card;
  sourcePlayerId: string;
  targetPlayerId: string;
  pendingDamage: number;
  duelTurnPlayerId?: string; // Player ID whose turn it is to throw Strike
  dyingPlayerId?: string; // Player at 0 HP
  viewedCard?: Card; // Card currently viewed (if any)
}

export interface Room {
  code: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'ended';
  clickGoal: number; // Backward compatibility
  clickProgress: number; // Backward compatibility
  gameTimeLeft: number; // General countdown or phase timer
  systemLogs: string[];

  // Game Engine State
  turnPlayerId: string | null;
  turnPhase: 'draw' | 'action' | 'discard' | null;
  deckCount: number;
  discardPileCount: number;
  activeAction: ActiveActionState | null;
  winnerKingdom: string | null;
}

export interface ChatMessage {
  sender: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
}
