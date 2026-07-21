export type CardType =
  | 'strike'    // Đánh
  | 'dodge'     // Đỡ
  | 'heal'      // Hồi
  | 'fire'      // Lửa
  | 'lightning' // Sét
  | 'duel'      // Đấu
  | 'explosion'
  | 'assassinate'
  | 'pursuit'
  | 'draw'      // Rút
  | 'exchange'  // Đổi
  | 'lock'      // Khóa
  | 'stun'
  | 'freeze'
  | 'whirlwind'
  | 'bind'
  | 'view'      // Xem
  | 'steal'     // Cướp
  | 'dagger'
  | 'axe'
  | 'hammer'
  | 'long_sword'
  | 'dual_swords'
  | 'bow'
  | 'dart'
  | 'cannon'
  | 'wooden_shield'
  | 'stone_armor'
  | 'water_armor'
  | 'fire_armor'
  | 'thorn_armor'
  | 'cloak'
  | 'crystal_shield'
  | 'tower_shield'
  | 'wind_boots'
  | 'wind_wings'
  | 'compass'
  | 'mist_screen'
  | 'magnet'
  | 'telescope'
  | 'iron_anchor'
  | 'connect'   // Kết Nối
  | 'supply'    // Tiếp Tế
  | 'protect'   // Che Chở
  | 'rescue'
  | 'resonance'
  | 'pact'
  | 'investigate'
  | 'track'
  | 'trial'
  | 'provoke'
  | 'expose';

export interface Card {
  id: string;
  type: CardType;
  name: string;
  emoji: string;
  category: 'basic' | 'tactical' | 'equip' | 'teammate';
  description: string;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  range?: number;
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
  magnetTargetId?: string | null;
}

export interface ActiveActionState {
  id: string;
  type: 'waiting_for_dodge' | 'waiting_for_duel_strike' | 'waiting_for_dying_heal' | 'waiting_for_volt_strike' | 'waiting_for_axe_discard' | 'waiting_for_long_sword_discard' | 'waiting_for_trial_choice' | 'waiting_for_provoke_choice' | 'view_hand_result' | 'select_steal' | 'select_destroy_equipment' | 'select_exchange';
  card: Card;
  sourcePlayerId: string;
  targetPlayerId: string;
  pendingDamage: number;
  duelTurnPlayerId?: string; // Player ID whose turn it is to throw Strike
  dyingPlayerId?: string; // Player at 0 HP
  viewedCard?: Card; // Card currently viewed (if any)
  viewedCards?: Card[];
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
