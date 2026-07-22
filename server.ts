import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Card, CardType, Player, Room, ActiveActionState } from './src/types.js';
import { ALL_HEROES, getHeroesByKingdom, getHeroByName, HeroData, Kingdom } from './src/heroes.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const responsiveSockets = new WeakSet<WebSocket>();

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach(client => {
    if (!responsiveSockets.has(client)) {
      client.terminate();
      return;
    }
    responsiveSockets.delete(client);
    client.ping();
  });
}, 15_000);
wss.on('close', () => clearInterval(heartbeatTimer));

const PORT = Number(process.env.PORT) || 3333;

// Internal Room state extending client Room types
interface ServerActiveAction extends ActiveActionState {
  remainingTargets?: string[];
}

interface ServerRoom extends Omit<Room, 'players' | 'activeAction'> {
  players: ServerPlayer[];
  deck: Card[];
  discardPile: Card[];
  activeAction: ServerActiveAction | null;
  pendingActions: ServerActiveAction[];
  pendingDamages: PendingDamage[];
  pacts: PactState[];
  trackers: TrackerState[];
  privateLogs: Record<string, string[]>;
  dyingTimer?: NodeJS.Timeout;
}

interface ServerPlayer extends Player {
  isConnected?: boolean;
  blazeFirstDmgActive?: boolean;
  glacierFirstDmgActive?: boolean;
  hasTacticalFirstPlayed?: boolean;
  isStunned?: boolean;
  isFrozen?: boolean;
  isBoundNextTurn?: boolean;
  isEquipBlocked?: boolean;
  stoneArmorTriggered?: boolean;
  towerShieldTriggered?: boolean;
  magnetTargetId?: string | null;
  // Skill state tracking flags
  ashenOnceUsed?: boolean;
  dewOnceUsed?: boolean;
  phoenixOnceUsed?: boolean;
  sealProtectionUsed?: boolean;
  emberUsedThisTurn?: boolean;
  flareUsedThisTurn?: boolean;
  scorchUsedThisTurn?: boolean;
  coralUsedThisTurn?: boolean;
  aquaUsedThisTurn?: boolean;
  cinderReady?: boolean;
  cinderBonusUsed?: boolean;
  cinderActivated?: boolean;
  gustTriggered?: boolean;
  stormCanSwap?: boolean;
  dealtDamageThisTurn?: boolean;
  monsoonUsedThisTurn?: boolean;
  springUsedThisTurn?: boolean;
  willowUsedThisTurn?: boolean;
  harborUsedThisTurn?: boolean;
  hazelUsedThisTurn?: boolean;
  pulseUsedThisTurn?: boolean;
  vineDrawReady?: boolean;
}

type DamageKind = 'strike' | 'fire' | 'lightning' | 'tactical' | 'other';

interface PendingDamage {
  targetId: string;
  amount: number;
  sourceId: string;
  kind: DamageKind;
}

interface PactState {
  playerIds: [string, string];
  expiresOnPlayerId: string;
}

interface TrackerState {
  trackerId: string;
  targetId: string;
}

// Global server state
const rooms: Record<string, ServerRoom> = {};
interface SocketMeta { playerId: string; roomCode: string; sessionToken: string }
interface PlayerSession extends SocketMeta { socket: WebSocket; disconnectTimer?: NodeJS.Timeout }
const wsMeta = new Map<WebSocket, SocketMeta>();
const playerSessions = new Map<string, PlayerSession>();
const roomTimers: Record<string, NodeJS.Timeout> = {};
const RECONNECT_GRACE_MS = 20_000;

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function sendPublicRooms(target?: WebSocket) {
  const message = JSON.stringify({ type: 'PUBLIC_ROOMS_LIST', payload: { rooms: Object.values(rooms).map(room => ({
    code: room.code,
    hostName: room.players.find(player => player.isHost)?.name || 'Anonymous',
    playerCount: room.players.length,
    status: room.status
  })) } });
  if (target) {
    if (target.readyState === WebSocket.OPEN) target.send(message);
    return;
  }
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function attachSession(ws: WebSocket, playerId: string, roomCode: string, sessionToken = makeId()) {
  const previous = playerSessions.get(sessionToken);
  if (previous?.disconnectTimer) clearTimeout(previous.disconnectTimer);
  if (previous?.socket !== ws && previous?.socket.readyState === WebSocket.OPEN) {
    previous.socket.close(4001, 'Session opened elsewhere');
  }
  const meta = { playerId, roomCode, sessionToken };
  wsMeta.set(ws, meta);
  playerSessions.set(sessionToken, { ...meta, socket: ws });
  return sessionToken;
}

// Card templates
interface CardTemplate {
  type: CardType;
  name: string;
  emoji: string;
  category: 'basic' | 'tactical' | 'equip' | 'teammate';
  description: string;
  equipSlot?: 'weapon' | 'armor' | 'accessory';
  range?: number;
}

const CARD_TEMPLATES: CardTemplate[] = [
  { type: 'strike', name: 'Đánh', emoji: '⚔️', category: 'basic', description: 'Gây 1 sát thương cho một người chơi trong tầm đánh. Mỗi lượt chỉ được dùng 1 lá Đánh.' },
  { type: 'dodge', name: 'Đỡ', emoji: '🛡', category: 'basic', description: 'Chặn một lá Đánh.' },
  { type: 'heal', name: 'Hồi', emoji: '❤️', category: 'basic', description: 'Hồi 1 máu. Có thể dùng để cứu người đang hấp hối.' },
  { type: 'fire', name: 'Lửa', emoji: '🔥', category: 'tactical', description: 'Tất cả người chơi khác phải dùng Đỡ, nếu không nhận 1 sát thương.' },
  { type: 'lightning', name: 'Sét', emoji: '⚡', category: 'tactical', description: 'Chọn một người chơi và gây 1 sát thương.' },
  { type: 'duel', name: 'Đấu', emoji: '⚔️', category: 'tactical', description: 'Hai người lần lượt dùng Đánh. Người không thể dùng nhận 1 sát thương.' },
  { type: 'explosion', name: 'Nổ', emoji: '💥', category: 'tactical', description: 'Mục tiêu và hai người ngồi liền kề mục tiêu nhận 1 sát thương.' },
  { type: 'assassinate', name: 'Ám Sát', emoji: '🗡️', category: 'tactical', description: 'Gây 1 sát thương, mục tiêu không được dùng Đỡ.' },
  { type: 'pursuit', name: 'Truy Đuổi', emoji: '🎯', category: 'tactical', description: 'Gây 1 sát thương. Nếu mục tiêu đã mất máu, gây thêm 1 sát thương.' },
  { type: 'draw', name: 'Rút', emoji: '🎁', category: 'tactical', description: 'Rút 2 lá bài.' },
  { type: 'exchange', name: 'Đổi', emoji: '🔄', category: 'tactical', description: 'Đổi ngẫu nhiên 1 lá bài trên tay với đối phương.' },
  { type: 'lock', name: 'Khóa', emoji: '🚫', category: 'tactical', description: 'Chọn một người chơi. Họ không được dùng kỹ năng đến hết lượt.' },
  { type: 'stun', name: 'Choáng', emoji: '😵', category: 'tactical', description: 'Mục tiêu bỏ qua giai đoạn rút bài ở lượt kế tiếp.' },
  { type: 'freeze', name: 'Đóng Băng', emoji: '❄️', category: 'tactical', description: 'Mục tiêu không được dùng Đánh đến hết lượt.' },
  { type: 'whirlwind', name: 'Cuốn Bay', emoji: '🌪️', category: 'tactical', description: 'Phá hủy một trang bị của mục tiêu.' },
  { type: 'bind', name: 'Trói', emoji: '⛓️', category: 'tactical', description: 'Mục tiêu không được trang bị vật phẩm trong lượt kế tiếp.' },
  { type: 'view', name: 'Xem', emoji: '👀', category: 'tactical', description: 'Xem ngẫu nhiên 2 lá bài trên tay của một người chơi.' },
  { type: 'steal', name: 'Cướp', emoji: '🎯', category: 'tactical', description: 'Lấy 1 lá bài từ tay hoặc trang bị của đối phương.' },
  { type: 'dagger', name: 'Dao Găm', emoji: '🔪', category: 'equip', equipSlot: 'weapon', range: 1, description: 'Sau khi gây sát thương, rút 1 lá.' },
  { type: 'axe', name: 'Rìu', emoji: '🪓', category: 'equip', equipSlot: 'weapon', range: 1, description: 'Nếu Đánh bị Đỡ, bỏ 1 lá để vẫn gây 1 sát thương.' },
  { type: 'hammer', name: 'Búa', emoji: '⚒️', category: 'equip', equipSlot: 'weapon', range: 1, description: 'Lá Đánh đầu tiên mỗi lượt gây thêm 1 sát thương.' },
  { type: 'long_sword', name: 'Trường Kiếm', emoji: '⚔️', category: 'equip', equipSlot: 'weapon', range: 2, description: 'Sau khi dùng Đánh, rút 1 lá rồi bỏ 1 lá.' },
  { type: 'dual_swords', name: 'Song Kiếm', emoji: '🗡️', category: 'equip', equipSlot: 'weapon', range: 2, description: 'Sau khi gây sát thương, xem ngẫu nhiên 1 lá trên tay mục tiêu.' },
  { type: 'bow', name: 'Cung', emoji: '🏹', category: 'equip', equipSlot: 'weapon', range: 3, description: 'Sau khi gây sát thương, mục tiêu bỏ ngẫu nhiên 1 lá.' },
  { type: 'dart', name: 'Phi Tiêu', emoji: '🎯', category: 'equip', equipSlot: 'weapon', range: 4, description: 'Lá Đánh đầu tiên mỗi lượt không bị giới hạn bởi tầm đánh.' },
  { type: 'cannon', name: 'Đại Pháo', emoji: '💣', category: 'equip', equipSlot: 'weapon', range: 5, description: 'Tầm đánh 5.' },
  { type: 'wooden_shield', name: 'Khiên Gỗ', emoji: '🛡️', category: 'equip', equipSlot: 'armor', description: 'Giảm 1 sát thương đầu tiên nhận mỗi lượt.' },
  { type: 'stone_armor', name: 'Giáp Đá', emoji: '🪨', category: 'equip', equipSlot: 'armor', description: 'Lần đầu bị Đánh mỗi lượt, rút 1 lá.' },
  { type: 'water_armor', name: 'Áo Nước', emoji: '🌊', category: 'equip', equipSlot: 'armor', description: 'Có thể dùng Đỡ để chặn Sét.' },
  { type: 'fire_armor', name: 'Áo Lửa', emoji: '🔥', category: 'equip', equipSlot: 'armor', description: 'Miễn nhiễm với Lửa.' },
  { type: 'thorn_armor', name: 'Giáp Gai', emoji: '🌿', category: 'equip', equipSlot: 'armor', description: 'Sau khi nhận sát thương từ Đánh, gây lại 1 sát thương cho kẻ tấn công.' },
  { type: 'cloak', name: 'Áo Choàng', emoji: '👻', category: 'equip', equipSlot: 'armor', description: 'Khoảng cách từ người khác đến bạn +1.' },
  { type: 'crystal_shield', name: 'Khiên Pha Lê', emoji: '💎', category: 'equip', equipSlot: 'armor', description: 'Sau khi Đỡ thành công, hồi 1 máu.' },
  { type: 'tower_shield', name: 'Đại Khiên', emoji: '🏰', category: 'equip', equipSlot: 'armor', description: 'Vô hiệu hóa lá Đánh đầu tiên nhắm vào bạn mỗi lượt.' },
  { type: 'wind_boots', name: 'Giày Gió', emoji: '👢', category: 'equip', equipSlot: 'accessory', description: 'Khoảng cách từ bạn đến người khác -1.' },
  { type: 'wind_wings', name: 'Cánh Gió', emoji: '🪽', category: 'equip', equipSlot: 'accessory', description: 'Khoảng cách từ người khác đến bạn +1.' },
  { type: 'compass', name: 'La Bàn', emoji: '🧭', category: 'equip', equipSlot: 'accessory', description: 'Khi tính khoảng cách, có thể bỏ qua 1 người chơi.' },
  { type: 'mist_screen', name: 'Màn Sương', emoji: '🌫️', category: 'equip', equipSlot: 'accessory', description: 'Người chơi cách bạn từ 3 trở lên không thể chọn bạn làm mục tiêu.' },
  { type: 'magnet', name: 'Nam Châm', emoji: '🧲', category: 'equip', equipSlot: 'accessory', description: 'Chọn một người, khoảng cách giữa hai người trở thành 1 đến hết lượt.' },
  { type: 'telescope', name: 'Ống Nhòm', emoji: '🔭', category: 'equip', equipSlot: 'accessory', description: 'Trong lượt của bạn, tầm đánh +2.' },
  { type: 'iron_anchor', name: 'Neo Sắt', emoji: '⚓', category: 'equip', equipSlot: 'accessory', description: 'Người khác không thể giảm khoảng cách đến bạn bằng kỹ năng hoặc trang bị.' },
  { type: 'connect', name: 'Kết Nối', emoji: '🤝', category: 'teammate', description: 'Chọn một người chơi. Nếu cùng phe, nhận ra nhau.' },
  { type: 'supply', name: 'Tiếp Tế', emoji: '🎁', category: 'teammate', description: 'Đối phương rút 2 lá. Nếu cùng phe, nhận ra nhau.' },
  { type: 'protect', name: 'Che Chở', emoji: '🛡', category: 'teammate', description: 'Gánh sát thương thay cho họ đến đầu lượt sau. Nếu cùng phe, nhận ra nhau.' },
  { type: 'rescue', name: 'Cứu Viện', emoji: '❤️', category: 'teammate', description: 'Hồi 1 máu. Nếu cùng phe, hai người nhận ra nhau.' },
  { type: 'resonance', name: 'Cộng Hưởng', emoji: '🌟', category: 'teammate', description: 'Hai người cùng rút 2 lá. Nếu cùng phe, hai người nhận ra nhau.' },
  { type: 'pact', name: 'Hiệp Ước', emoji: '🕊️', category: 'teammate', description: 'Hai người không thể gây sát thương cho nhau đến đầu lượt sau. Nếu cùng phe, hai người nhận ra nhau.' },
  { type: 'investigate', name: 'Điều Tra', emoji: '🔍', category: 'teammate', description: 'Xem ngẫu nhiên 2 lá bài trên tay mục tiêu.' },
  { type: 'track', name: 'Theo Dõi', emoji: '👁️', category: 'teammate', description: 'Nếu mục tiêu gây sát thương trước lượt kế tiếp của bạn, rút 2 lá.' },
  { type: 'trial', name: 'Thử Lòng', emoji: '🔥', category: 'teammate', description: 'Mục tiêu phải lật nhân vật hoặc nhận 1 sát thương.' },
  { type: 'provoke', name: 'Khiêu Khích', emoji: '⚔️', category: 'teammate', description: 'Mục tiêu phải lật nhân vật hoặc bỏ 2 lá bài.' },
  { type: 'expose', name: 'Vạch Mặt', emoji: '🎭', category: 'teammate', description: 'Nếu mục tiêu còn 2 máu hoặc ít hơn, họ phải lật nhân vật.' },
];

// Generates a 6-letter room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

// Broadcasts sanitized state to all sockets in a specific room
function broadcastToRoom(roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const meta = wsMeta.get(client);
      if (meta && meta.roomCode === roomCode) {
        client.send(JSON.stringify({
          type: 'ROOM_UPDATE',
          room: getSanitizedRoom(room, meta.playerId)
        }));
      }
    }
  });
}

// Add system log entry
function addSystemLog(roomCode: string, message: string) {
  const room = rooms[roomCode];
  if (room) {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    room.systemLogs.unshift(`[${timestamp}] ${message}`);
    if (room.systemLogs.length > 40) {
      room.systemLogs.pop();
    }
  }
}

function addPrivateLog(room: ServerRoom, playerIds: string[], message: string) {
  const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  playerIds.forEach((playerId) => {
    room.privateLogs[playerId] ??= [];
    room.privateLogs[playerId].unshift(`[${timestamp}] ${message}`);
    room.privateLogs[playerId] = room.privateLogs[playerId].slice(0, 40);
  });
}

// Sanitizes room data for specific player
function getSanitizedRoom(room: ServerRoom, playerId: string) {
  const myPlayer = room.players.find(p => p.id === playerId);
  return {
    code: room.code,
    status: room.status,
    gameTimeLeft: room.gameTimeLeft,
    systemLogs: [...(room.privateLogs[playerId] || []), ...room.systemLogs].slice(0, 40),
    turnPlayerId: room.turnPlayerId,
    turnPhase: room.turnPhase,
    deckCount: room.deck.length,
    discardPileCount: room.discardPile.length,
    activeAction: room.activeAction ? {
      id: room.activeAction.id,
      type: room.activeAction.type,
      card: room.activeAction.card,
      sourcePlayerId: room.activeAction.sourcePlayerId,
      targetPlayerId: room.activeAction.targetPlayerId,
      pendingDamage: room.activeAction.pendingDamage,
      duelTurnPlayerId: room.activeAction.duelTurnPlayerId,
      dyingPlayerId: room.activeAction.dyingPlayerId,
      viewedCard: (room.activeAction.targetPlayerId === playerId || room.activeAction.sourcePlayerId === playerId) ? room.activeAction.viewedCard : undefined,
      viewedCards: room.activeAction.sourcePlayerId === playerId ? room.activeAction.viewedCards : undefined,
    } : null,
    winnerKingdom: room.winnerKingdom,
    players: room.players.map((p) => {
      const isSelf = p.id === playerId;
      const isTeammate = myPlayer && p.kingdom && myPlayer.revealedTeammates.includes(p.id);

      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        isReady: p.isReady,
        isHost: p.isHost,
        score: p.score,

        kingdom: (isSelf || isTeammate || p.isRevealed || room.status === 'ended') ? p.kingdom : undefined,
        hero: (isSelf || p.isRevealed || room.status === 'ended') ? p.hero : undefined,
        hp: (p.isRevealed || isSelf || room.status === 'ended') ? p.hp : undefined,
        maxHp: (p.isRevealed || isSelf || room.status === 'ended') ? p.maxHp : undefined,
        isRevealed: p.isRevealed,
        isEliminated: p.isEliminated,
        cards: isSelf ? p.cards : [],
        cardsCount: p.cards.length,
        equipments: p.equipments,
        isLocked: p.isLocked,
        protectingPlayerId: p.protectingPlayerId,
        protectedByPlayerId: p.protectedByPlayerId,
        revealedTeammates: isSelf ? p.revealedTeammates : [],
        strikePlayedThisTurn: p.strikePlayedThisTurn,
        dodgesUsedThisTurn: p.dodgesUsedThisTurn,
        magnetTargetId: isSelf ? p.magnetTargetId : null,
      };
    })
  };
}

// Deck generator
function generateDeck() {
  const deck: Card[] = [];
  const distribution = {
    strike: 32,
    dodge: 16,
    heal: 8,
    fire: 4,
    lightning: 4,
    duel: 3,
    explosion: 3,
    assassinate: 2,
    pursuit: 2,
    lock: 3,
    stun: 3,
    freeze: 3,
    whirlwind: 3,
    bind: 2,
    draw: 4,
    exchange: 3,
    steal: 3,
    view: 2,
    dagger: 2,
    axe: 2,
    hammer: 2,
    long_sword: 2,
    dual_swords: 1,
    bow: 1,
    dart: 1,
    cannon: 1,
    wooden_shield: 2,
    stone_armor: 1,
    water_armor: 1,
    fire_armor: 1,
    thorn_armor: 1,
    cloak: 1,
    crystal_shield: 1,
    tower_shield: 1,
    wind_boots: 1,
    wind_wings: 1,
    compass: 1,
    mist_screen: 1,
    magnet: 1,
    telescope: 1,
    iron_anchor: 1,
    connect: 3,
    supply: 3,
    protect: 3,
    rescue: 2,
    resonance: 2,
    pact: 2,
    investigate: 2,
    track: 2,
    trial: 2,
    provoke: 2,
    expose: 1,
  };

  Object.entries(distribution).forEach(([type, count]) => {
    const template = CARD_TEMPLATES.find(t => t.type === type);
    if (template) {
      for (let i = 0; i < count; i++) {
        deck.push({
          id: `${type}_${Math.random().toString(36).substring(2, 9)}_${i}`,
          ...template
        });
      }
    }
  });

  deck.sort(() => Math.random() - 0.5);
  return deck;
}

// Factions and heroes allocator
function assignFactionsAndHeroes(players: ServerPlayer[]) {
  const count = players.length;
  const teamSizesByCount: Record<number, number[]> = {
    3: [1, 1, 1],
    4: [2, 2],
    5: [2, 3],
    6: [2, 2, 2],
    7: [2, 2, 3],
    8: [2, 2, 2, 2],
    9: [3, 3, 3],
    10: [2, 2, 3, 3],
    11: [2, 3, 3, 3],
    12: [3, 3, 3, 3],
  };
  const teamSizes = teamSizesByCount[count] || teamSizesByCount[12];
  const kingdoms = (['flame', 'ocean', 'forest', 'storm'] as const)
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, teamSizes.length);
  const factions = teamSizes.flatMap((size, index) =>
    Array.from({ length: size }, () => kingdoms[index])
  );

  // Shuffle factions
  factions.sort(() => Math.random() - 0.5);

  const heroPool: Record<string, string[]> = {
    flame: getHeroesByKingdom('flame').map(h => h.name),
    ocean: getHeroesByKingdom('ocean').map(h => h.name),
    forest: getHeroesByKingdom('forest').map(h => h.name),
    storm: getHeroesByKingdom('storm').map(h => h.name),
  };

  players.forEach((p, index) => {
    const kingdom = factions[index] || 'flame';
    p.kingdom = kingdom;

    const pool = heroPool[kingdom];
    const heroName = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    p.hero = heroName;

    const heroData = getHeroByName(heroName);
    const hp = heroData ? heroData.hp : 4;
    p.hp = hp;
    p.maxHp = hp;
    p.isRevealed = false;
    p.isEliminated = false;
    p.cards = [];
    p.equipments = [];
    p.revealedTeammates = [p.id];
    p.isLocked = false;
    p.shieldFirstBlockActive = true;
    p.blazeFirstDmgActive = true;
    p.protectingPlayerId = null;
    p.protectedByPlayerId = null;
    p.strikePlayedThisTurn = 0;
    p.dodgesUsedThisTurn = 0;
    p.hasTacticalFirstPlayed = false;
    p.isStunned = false;
    p.isFrozen = false;
    p.isBoundNextTurn = false;
    p.isEquipBlocked = false;
    p.stoneArmorTriggered = false;
    p.towerShieldTriggered = false;
    p.magnetTargetId = null;
  });
}

// Drawing cards helper
function drawCards(room: ServerRoom, player: ServerPlayer, count: number, isDrawPhase: boolean = false): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length === 0) {
        break;
      }
      room.deck = [...room.discardPile];
      room.discardPile = [];
      room.deck.sort(() => Math.random() - 0.5);
    }
    const card = room.deck.pop();
    if (card) {
      drawn.push(card);
      player.cards.push(card);
    }
  }

  if (drawn.length === 0) return drawn;

  const isOutOfTurn = room.turnPlayerId !== player.id && !isDrawPhase;

  // Bloom: Khi rút bài ngoài lượt, ban tặng 1 lá cho đồng đội yếu máu nhất
  if (drawn.length > 0 && player.isRevealed && player.hero === 'Bloom' && !player.isLocked && isOutOfTurn) {
    const lowestHpTeammate = room.players
      .filter((p) => !p.isEliminated && p.kingdom === player.kingdom)
      .sort((a, b) => a.hp - b.hp)[0] || player;

    if (room.deck.length > 0) {
      const bCard = room.deck.pop();
      if (bCard) {
        lowestHpTeammate.cards.push(bCard);
        addSystemLog(room.code, `Kỹ năng [Bloom]: ${lowestHpTeammate.name} nhận thêm 1 lá tiếp tế từ ${player.name}.`);
      }
    }
  }

  // Fern: Sau khi sử dụng thẻ Rút, rút thêm 1 lá
  if (player.isRevealed && player.hero === 'Fern' && !player.isLocked && count === 2 && !isDrawPhase && !isOutOfTurn) {
    // Triggered in the Rút card handler, not here
  }

  // Spring: Sau khi rút bài ngoài giai đoạn rút bài, có thể cho đồng đội rút 1 lá
  if (isOutOfTurn && player.isRevealed && player.hero === 'Spring' && !player.isLocked && !player.springUsedThisTurn) {
    player.springUsedThisTurn = true;
    const teammates = room.players.filter(p => !p.isEliminated && p.id !== player.id && p.kingdom === player.kingdom);
    if (teammates.length > 0 && room.deck.length > 0) {
      const target = teammates[Math.floor(Math.random() * teammates.length)];
      const giveCard = room.deck.pop();
      if (giveCard) {
        target.cards.push(giveCard);
        addSystemLog(room.code, `Kỹ năng [Spring]: ${player.name} cho ${target.name} rút 1 lá.`);
      }
    }
  }

  // Willow: Sau khi cho người khác rút bài, bạn cũng rút 1 lá
  if (player.isRevealed && player.hero === 'Willow' && !player.isLocked && !player.willowUsedThisTurn && isOutOfTurn) {
    player.willowUsedThisTurn = true;
    if (room.deck.length > 0) {
      const wCard = room.deck.pop();
      if (wCard) {
        player.cards.push(wCard);
        addSystemLog(room.code, `Kỹ năng [Willow]: ${player.name} rút 1 lá vì đã giúp đồng đội.`);
      }
    }
  }

  // Hazel: Sau khi đồng đội rút bài ngoài giai đoạn rút bài, bạn rút 1 lá
  room.players.forEach(p => {
    if (p.isRevealed && p.hero === 'Hazel' && !p.isLocked && !p.hazelUsedThisTurn && !p.isEliminated && p.id !== player.id) {
      if (p.revealedTeammates.includes(player.id) && isOutOfTurn) {
        p.hazelUsedThisTurn = true;
        if (room.deck.length > 0) {
          const hCard = room.deck.pop();
          if (hCard) {
            p.cards.push(hCard);
            addSystemLog(room.code, `Kỹ năng [Hazel]: ${p.name} rút 1 lá vì đồng đội ${player.name} rút bài.`);
          }
        }
      }
    }
  });

  // Pulse: Lần đầu rút bài ngoài giai đoạn rút bài, có thể dùng thêm 1 Đánh
  if (isOutOfTurn && player.isRevealed && player.hero === 'Pulse' && !player.isLocked && !player.pulseUsedThisTurn) {
    player.pulseUsedThisTurn = true;
    player.strikePlayedThisTurn = Math.max(0, player.strikePlayedThisTurn - 1);
    addSystemLog(room.code, `Kỹ năng [Pulse]: ${player.name} có thể dùng thêm 1 lá Đánh.`);
  }

  // Clover: Lần đầu rút đúng 1 lá ngoài giai đoạn rút bài, rút thêm 1
  if (drawn.length === 1 && isOutOfTurn && player.isRevealed && player.hero === 'Clover' && !player.isLocked) {
    if (room.deck.length > 0) {
      const cCard = room.deck.pop();
      if (cCard) {
        player.cards.push(cCard);
        addSystemLog(room.code, `Kỹ năng [Clover]: ${player.name} rút thêm 1 lá may mắn.`);
      }
    }
  }

  return drawn;
}

function revealHero(room: ServerRoom, player: ServerPlayer) {
  if (player.isRevealed || player.isEliminated) return false;
  player.isRevealed = true;
  drawCards(room, player, 1);

  // Ignis: Ngay sau khi lật nhân vật, gây 1 sát thương cho người trong tầm
  if (player.hero === 'Ignis' && !player.isLocked) {
    const targets = room.players.filter(p => !p.isEliminated && p.id !== player.id);
    if (targets.length > 0) {
      const weapon = player.equipments.find(e => e.equipSlot === 'weapon');
      const maxRange = (weapon?.range || 1);
      const inRange = targets.filter(t => calculateDistance(room, player, t) <= maxRange);
      if (inRange.length > 0) {
        const target = inRange[Math.floor(Math.random() * inRange.length)];
        // Deal damage without triggering further action
        target.hp -= 1;
        addSystemLog(room.code, `Kỹ năng [Ignis]: ${player.name} gây 1 sát thương cho ${target.name} khi lật nhân vật.`);
        if (target.hp <= 0) {
          target.hp = 0;
        }
      }
    }
  }

  // Pearl: Ngay sau khi lật nhân vật, hồi 1 máu
  if (player.hero === 'Pearl' && !player.isLocked) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    addSystemLog(room.code, `Kỹ năng [Pearl]: ${player.name} hồi 1 máu khi lật nhân vật.`);
  }

  // Sonic: Ngay sau khi lật nhân vật, rút 2 lá
  if (player.hero === 'Sonic' && !player.isLocked) {
    drawCards(room, player, 2);
    addSystemLog(room.code, `Kỹ năng [Sonic]: ${player.name} rút 2 lá khi lật nhân vật.`);
  }

  return true;
}

function hasEquipment(player: ServerPlayer, type: CardType) {
  return player.equipments.some(equipment => equipment.type === type);
}

function calculateDistance(room: ServerRoom, source: ServerPlayer, target: ServerPlayer) {
  const sourceIndex = room.players.findIndex(player => player.id === source.id);
  const targetIndex = room.players.findIndex(player => player.id === target.id);
  let distance = Math.min(
    Math.abs(sourceIndex - targetIndex),
    room.players.length - Math.abs(sourceIndex - targetIndex),
  );

  const anchored = hasEquipment(target, 'iron_anchor');
  if (!anchored && source.magnetTargetId === target.id) return 1;
  if (!anchored && hasEquipment(source, 'wind_boots')) distance -= 1;
  if (!anchored && hasEquipment(source, 'compass')) distance -= 1;
  if (hasEquipment(target, 'wind_wings')) distance += 1;
  if (hasEquipment(target, 'cloak')) distance += 1;

  // Wind: Khoảng cách từ bạn đến tất cả người chơi khác giảm 1
  if (source.isRevealed && source.hero === 'Wind' && !source.isLocked) {
    distance -= 1;
  }

  // Whirlpool: Người gây sát thương cho bạn có khoảng cách +1
  if (target.isRevealed && target.hero === 'Whirlpool' && !target.isLocked) {
    // This needs to be tracked - we add +1 when source just dealt damage to target
    // For simplicity, always add +1 when calculating distance to a Whirlpool player
    // But only when the source is the one who damaged them - tracking this precisely
    // is complex. For now, we always apply it when target is Whirlpool.
    distance += 1;
  }

  // Lava: Nếu đã gây sát thương trong lượt, khoảng cách đến mọi người giảm 1
  if (source.isRevealed && source.hero === 'Lava' && !source.isLocked && source.dealtDamageThisTurn) {
    distance -= 1;
  }

  // Bubble: Sau khi Đỡ thành công, khoảng cách từ người khác +1 (tracked via per-turn flag)
  // (Complex to track precisely, simplified: always +1 when target is Bubble)

  // Zephyr: Lần đầu mỗi lượt bị nhắm làm mục tiêu Đánh, khoảng cách +1
  // (handled in the strike targeting section)

  return Math.max(1, distance);
}

function canChooseTarget(room: ServerRoom, source: ServerPlayer, target: ServerPlayer) {
  return !(hasEquipment(target, 'mist_screen') && calculateDistance(room, source, target) >= 3);
}

// Deal damage core logic
function dealDamage(room: ServerRoom, targetId: string, amount: number, sourceId: string, kind: DamageKind = 'other') {
  const target = room.players.find(p => p.id === targetId);
  if (!target || target.isEliminated) return;

  const hasPact = room.pacts.some(pact =>
    pact.playerIds.includes(targetId) && pact.playerIds.includes(sourceId)
  );
  if (hasPact) {
    addSystemLog(room.code, `🕊️ Hiệp Ước ngăn sát thương giữa hai người chơi.`);
    return;
  }

  // 1. Protection Check (Che Chở)
  if (target.protectedByPlayerId) {
    const protector = room.players.find(p => p.id === target.protectedByPlayerId && !p.isEliminated);
    if (protector) {
      addSystemLog(room.code, `${protector.name} xả thân gánh chịu ${amount} sát thương thay cho ${target.name} (Che Chở)!`);
      dealDamage(room, protector.id, amount, sourceId, kind);
      return;
    }
  }

  if (kind === 'fire' && hasEquipment(target, 'fire_armor')) {
    addSystemLog(room.code, `🔥 Áo Lửa giúp ${target.name} miễn nhiễm sát thương từ Lửa.`);
    return;
  }

  // 2. Shield (Khiên) armor check
  const hasShield = hasEquipment(target, 'wooden_shield');
  if (hasShield && target.shieldFirstBlockActive) {
    target.shieldFirstBlockActive = false;
    amount = Math.max(0, amount - 1);
    addSystemLog(room.code, `[Khiên] của ${target.name} chặn bớt 1 sát thương.`);
    if (amount === 0) return;
  }

  // 3. Blaze skill reduction
  if (target.isRevealed && target.hero === 'Blaze' && !target.isLocked) {
    if (target.blazeFirstDmgActive) {
      target.blazeFirstDmgActive = false;
      amount = Math.max(0, amount - 1);
      addSystemLog(room.code, `Kỹ năng [Blaze] của ${target.name} giảm bớt 1 sát thương.`);
      if (amount === 0) return;
    }
  }

  // 3b. Glacier: Lần đầu nhận sát thương từ Đánh, giảm xuống còn 1 nếu > 1
  if (kind === 'strike' && target.isRevealed && target.hero === 'Glacier' && !target.isLocked) {
    if (target.glacierFirstDmgActive && amount > 1) {
      target.glacierFirstDmgActive = false;
      amount = Math.min(1, amount);
      addSystemLog(room.code, `Kỹ năng [Glacier] của ${target.name} giảm sát thương Đánh xuống 1.`);
    }
  }

  target.hp -= amount;
  addSystemLog(room.code, `💥 ${target.name} nhận ${amount} sát thương!`);

  // ===== DAMAGE SKILLS: SOURCE SIDE =====
  const source = room.players.find(player => player.id === sourceId && !player.isEliminated);
  if (source) {
    source.dealtDamageThisTurn = true;

    // Ember: Sau khi gây sát thương bằng Đánh, rút 1 lá (1 lần/lượt)
    if (kind === 'strike' && source.isRevealed && source.hero === 'Ember' && !source.isLocked && !source.emberUsedThisTurn) {
      source.emberUsedThisTurn = true;
      drawCards(room, source, 1);
      addSystemLog(room.code, `Kỹ năng [Ember]: ${source.name} rút 1 lá sau khi Đánh.`);
    }

    // Scorch: Sau khi gây sát thương, mục tiêu bỏ ngẫu nhiên 1 lá (1 lần/lượt)
    if (source.isRevealed && source.hero === 'Scorch' && !source.isLocked && !source.scorchUsedThisTurn && target.cards.length > 0) {
      source.scorchUsedThisTurn = true;
      const discarded = target.cards.splice(Math.floor(Math.random() * target.cards.length), 1)[0];
      room.discardPile.push(discarded);
      addSystemLog(room.code, `Kỹ năng [Scorch]: ${source.name} khiến ${target.name} bỏ [${discarded.name}].`);
    }

    // Burn: Sau khi gây sát thương, có thể phá 1 trang bị thay vì bỏ bài
    if (source.isRevealed && source.hero === 'Burn' && !source.isLocked && target.equipments.length > 0) {
      const destroyed = target.equipments.splice(0, 1)[0];
      room.discardPile.push(destroyed);
      addSystemLog(room.code, `Kỹ năng [Burn]: ${source.name} đốt cháy [${destroyed.name}] của ${target.name}.`);
    }

    // Thunder: Sau khi gây sát thương bằng Sét, rút 1 lá
    if (kind === 'lightning' && source.isRevealed && source.hero === 'Thunder' && !source.isLocked) {
      drawCards(room, source, 1);
      addSystemLog(room.code, `Kỹ năng [Thunder]: ${source.name} rút 1 lá sau khi giáng Sét.`);
    }

    // Flare: Lần đầu gây sát thương bằng Chiến thuật mỗi lượt, rút 1 lá
    if ((kind === 'tactical' || kind === 'fire' || kind === 'lightning') && source.isRevealed && source.hero === 'Flare' && !source.isLocked && !source.flareUsedThisTurn) {
      source.flareUsedThisTurn = true;
      drawCards(room, source, 1);
      addSystemLog(room.code, `Kỹ năng [Flare]: ${source.name} rút 1 lá sau khi dùng Chiến thuật gây sát thương.`);
    }

    // Lava: Sau khi gây sát thương, khoảng cách giảm (handled in calculateDistance via flag)
    if (source.isRevealed && source.hero === 'Lava' && !source.isLocked) {
      addSystemLog(room.code, `Kỹ năng [Lava]: ${source.name} kích hoạt càn lướt, giảm khoảng cách.`);
    }

    // Frost: Sau khi gây sát thương bằng Sét, mục tiêu không được dùng Đánh đến hết lượt kế tiếp
    if (kind === 'lightning' && source.isRevealed && source.hero === 'Frost' && !source.isLocked) {
      target.isFrozen = true;
      addSystemLog(room.code, `Kỹ năng [Frost]: ${target.name} bị đóng băng, không thể Đánh đến hết lượt sau.`);
    }

    // Static: Sau khi gây sát thương bằng Đánh, mục tiêu không dùng được kỹ năng đến hết lượt kế tiếp
    if (kind === 'strike' && source.isRevealed && source.hero === 'Static' && !source.isLocked) {
      target.isLocked = true;
      addSystemLog(room.code, `Kỹ năng [Static]: ${target.name} bị khóa kỹ năng đến hết lượt sau.`);
    }

    // Storm: Sau khi gây sát thương, có thể đổi chỗ với người liền kề
    if (source.isRevealed && source.hero === 'Storm' && !source.isLocked && source.stormCanSwap) {
      source.stormCanSwap = false;
      const sourceIdx = room.players.findIndex(p => p.id === source.id);
      const neighbors = [
        (sourceIdx - 1 + room.players.length) % room.players.length,
        (sourceIdx + 1) % room.players.length,
      ];
      const aliveNeighbor = neighbors.find(idx => !room.players[idx].isEliminated);
      if (aliveNeighbor !== undefined) {
        const temp = room.players[sourceIdx];
        room.players[sourceIdx] = room.players[aliveNeighbor];
        room.players[aliveNeighbor] = temp;
        addSystemLog(room.code, `Kỹ năng [Storm]: ${source.name} đổi vị trí với ${room.players[sourceIdx].name}.`);
      }
    }
  }

  // ===== DAMAGE SKILLS: TARGET SIDE =====
  if (target.isRevealed && target.hero === 'Coral' && !target.isLocked && !target.coralUsedThisTurn) {
    target.coralUsedThisTurn = true;
    drawCards(room, target, 1);
    addSystemLog(room.code, `Kỹ năng [Coral]: ${target.name} rút 1 lá sau khi nhận sát thương.`);
  }

  // Cinder: Sau khi mất máu, lá Đánh đầu tiên trước cuối lượt gây thêm 1 sát thương
  if (target.isRevealed && target.hero === 'Cinder' && !target.isLocked && !target.cinderActivated) {
    target.cinderActivated = true;
    addSystemLog(room.code, `Kỹ năng [Cinder]: ${target.name} chuẩn bị đòn báo thù (+1 sát thương).`);
  }

  // Iceberg: Sau khi mất máu, người gây sát thương bỏ 1 lá
  if (target.isRevealed && target.hero === 'Iceberg' && !target.isLocked && source && source.cards.length > 0) {
    const discarded = source.cards.splice(Math.floor(Math.random() * source.cards.length), 1)[0];
    room.discardPile.push(discarded);
    addSystemLog(room.code, `Kỹ năng [Iceberg]: ${target.name} khiến ${source.name} bỏ [${discarded.name}].`);
  }

  // Whirlpool: Người gây sát thương có khoảng cách +1 (handled in calculateDistance)
  if (target.isRevealed && target.hero === 'Whirlpool' && !target.isLocked && source) {
    addSystemLog(room.code, `Kỹ năng [Whirlpool]: ${source.name} bị đẩy xa ${target.name}.`);
  }

  // Bamboo: Sau khi mất máu, nếu <4 lá, rút đến đủ 4
  if (target.isRevealed && target.hero === 'Bamboo' && !target.isLocked && target.cards.length < 4) {
    const toDraw = 4 - target.cards.length;
    drawCards(room, target, toDraw);
    addSystemLog(room.code, `Kỹ năng [Bamboo]: ${target.name} rút ${toDraw} lá để có đủ 4 lá.`);
  }

  // Ashen: Khi máu giảm xuống còn đúng 2, hồi 1 máu (1 lần/ván)
  if (target.isRevealed && target.hero === 'Ashen' && !target.isLocked && target.hp === 2 && !target.ashenOnceUsed) {
    target.ashenOnceUsed = true;
    target.hp = Math.min(target.maxHp, target.hp + 1);
    addSystemLog(room.code, `Kỹ năng [Ashen]: ${target.name} hồi 1 máu khi xuống ngưỡng 2 HP.`);
  }

  // Dew: same as Ashen
  if (target.isRevealed && target.hero === 'Dew' && !target.isLocked && target.hp === 2 && !target.dewOnceUsed) {
    target.dewOnceUsed = true;
    target.hp = Math.min(target.maxHp, target.hp + 1);
    addSystemLog(room.code, `Kỹ năng [Dew]: ${target.name} hồi 1 máu khi xuống ngưỡng 2 HP.`);
  }

  // Volcano: Sau khi nhận sát thương từ Đánh, có thể đánh trả
  if (kind === 'strike' && target.isRevealed && target.hero === 'Volcano' && !target.isLocked && source && !source.isEliminated) {
    const canCounter = target.cards.some(c => c.type === 'strike');
    if (canCounter) {
      room.pendingActions.push({
        id: `volcano_${Math.random().toString(36).substring(2, 9)}`,
        type: 'waiting_for_volt_strike',
        card: { id: 'sys_volcano', type: 'strike', name: 'Đánh', emoji: '⚔️', category: 'basic', description: 'Phản công từ Volcano' },
        sourcePlayerId: target.id,
        targetPlayerId: source.id,
        pendingDamage: 0,
      });
      addSystemLog(room.code, `Kỹ năng [Volcano]: ${target.name} có thể phản công ${source.name}.`);
    }
  }

  // Harbor: Khi đồng đội trong tầm nhận sát thương, rút 1 lá (1 lần/lượt)
  room.players.forEach(p => {
    if (p.isRevealed && p.hero === 'Harbor' && !p.isLocked && !p.harborUsedThisTurn && !p.isEliminated && p.id !== target.id && p.id !== source?.id) {
      if (p.revealedTeammates.includes(target.id) && p.revealedTeammates.length > 0) {
        const dist = calculateDistance(room, p, target);
        const weapon = p.equipments.find(e => e.equipSlot === 'weapon');
        const maxRange = weapon?.range || 1;
        if (dist <= maxRange) {
          p.harborUsedThisTurn = true;
          drawCards(room, p, 1);
          addSystemLog(room.code, `Kỹ năng [Harbor]: ${p.name} rút 1 lá vì đồng đội ${target.name} bị thương.`);
        }
      }
    }
  });

  // === EQUIPMENT DAMAGE TRIGGERS ===
  if (source && kind === 'strike') {
    if (hasEquipment(source, 'dagger')) {
      drawCards(room, source, 1);
      addSystemLog(room.code, `🔪 Dao Găm giúp ${source.name} rút 1 lá sau khi gây sát thương.`);
    }
    if (hasEquipment(source, 'dual_swords') && target.cards.length > 0) {
      const viewed = target.cards[Math.floor(Math.random() * target.cards.length)];
      addPrivateLog(room, [source.id], `🗡️ Song Kiếm nhìn thấy [${viewed.name}] trên tay ${target.name}.`);
    }
    if (hasEquipment(source, 'bow') && target.cards.length > 0) {
      const discarded = target.cards.splice(Math.floor(Math.random() * target.cards.length), 1)[0];
      room.discardPile.push(discarded);
      addSystemLog(room.code, `🏹 Cung khiến ${target.name} bỏ ngẫu nhiên 1 lá.`);
    }
  }

  const triggeredTrackers = room.trackers.filter(tracker => tracker.targetId === sourceId);
  triggeredTrackers.forEach(tracker => {
    const trackingPlayer = room.players.find(player => player.id === tracker.trackerId && !player.isEliminated);
    if (trackingPlayer) {
      drawCards(room, trackingPlayer, 2);
      addPrivateLog(room, [trackingPlayer.id], `👁️ Theo Dõi kích hoạt: bạn rút 2 lá.`);
    }
  });
  if (triggeredTrackers.length > 0) {
    room.trackers = room.trackers.filter(tracker => tracker.targetId !== sourceId);
  }

  if (source && kind === 'strike' && hasEquipment(target, 'thorn_armor')) {
    addSystemLog(room.code, `🌿 Giáp Gai của ${target.name} phản lại 1 sát thương cho ${source.name}.`);
    room.pendingDamages.unshift({ targetId: source.id, amount: 1, sourceId: target.id, kind: 'other' });
  }

  // Phoenix: Lần đầu vào hấp hối, hồi ngay 1 máu
  if (target.hp <= 0 && target.isRevealed && target.hero === 'Phoenix' && !target.isLocked && !target.phoenixOnceUsed) {
    target.phoenixOnceUsed = true;
    target.hp = 1;
    addSystemLog(room.code, `Kỹ năng [Phoenix]: ${target.name} hồi sinh từ hấp hối!`);
    return;
  }

  // Dying state trigger
  if (target.hp <= 0) {
    target.hp = 0;
    addSystemLog(room.code, `⚠️ ${target.name} lâm vào trạng thái HẤP HỐI! Cần dùng lá Hồi (❤️) trong vòng 12 giây để cứu.`);

    room.activeAction = {
      id: `dying_${Math.random().toString(36).substring(2, 9)}`,
      type: 'waiting_for_dying_heal',
      card: { id: 'sys_heal', type: 'heal', name: 'Hồi', emoji: '❤️', category: 'basic', description: 'Cứu người chơi đang hấp hối' },
      sourcePlayerId: sourceId,
      targetPlayerId: targetId,
      pendingDamage: 0,
      dyingPlayerId: targetId
    };

    if (room.dyingTimer) clearTimeout(room.dyingTimer);
    room.dyingTimer = setTimeout(() => {
      const activeRoom = rooms[room.code];
      if (activeRoom && activeRoom.activeAction && activeRoom.activeAction.type === 'waiting_for_dying_heal' && activeRoom.activeAction.dyingPlayerId === targetId) {
        const turnPlayerBeforeElimination = activeRoom.turnPlayerId;
        eliminatePlayer(activeRoom, targetId, sourceId);
        checkVictoryConditions(activeRoom);
        if (activeRoom.status === 'playing' && activeRoom.turnPlayerId === turnPlayerBeforeElimination) {
          resumePendingAction(activeRoom);
        }
        broadcastToRoom(activeRoom.code);
      }
    }, 12000);
  }
}

// Eliminate player
function eliminatePlayer(room: ServerRoom, playerId: string, killerId: string) {
  const p = room.players.find(pl => pl.id === playerId);
  if (!p || p.isEliminated) return;

  p.isEliminated = true;
  p.hp = 0;
  p.isRevealed = true;

  room.discardPile.push(...p.cards);
  room.discardPile.push(...p.equipments);
  p.cards = [];
  p.equipments = [];

  addSystemLog(room.code, `💀 ${p.name} đã bị loại! Thân phận: [${p.kingdom?.toUpperCase()}] - Anh hùng: ${p.hero}.`);

  const killer = room.players.find(pl => pl.id === killerId && !pl.isEliminated);

  // Pyro skill trigger
  if (killer && killer.isRevealed && killer.hero === 'Pyro' && !killer.isLocked) {
    killer.hp = Math.min(killer.maxHp, killer.hp + 1);
    drawCards(room, killer, 2);
    addSystemLog(room.code, `Kỹ năng [Pyro]: ${killer.name} hồi 1 HP và rút 2 lá khi kết liễu kẻ thù.`);
  }

  // Torch: Sau khi hạ gục, có thể dùng thêm 1 lá Đánh trong lượt
  if (killer && killer.isRevealed && killer.hero === 'Torch' && !killer.isLocked) {
    killer.strikePlayedThisTurn = Math.max(0, killer.strikePlayedThisTurn - 1);
    addSystemLog(room.code, `Kỹ năng [Torch]: ${killer.name} có thể dùng thêm 1 lá Đánh.`);
  }

  // Ragnarok: Sau khi hạ gục, thực hiện thêm một giai đoạn Hành động
  if (killer && killer.isRevealed && killer.hero === 'Ragnarok' && !killer.isLocked) {
    killer.strikePlayedThisTurn = 0;
    killer.hasTacticalFirstPlayed = false;
    room.activeAction = null;
    room.pendingActions = [];
    addSystemLog(room.code, `Kỹ năng [Ragnarok]: ${killer.name} được thêm một giai đoạn Hành động!`);
  }

  if (room.turnPlayerId === playerId) {
    advanceTurn(room);
  }
}

// Check Victory conditions
function checkVictoryConditions(room: ServerRoom) {
  const alivePlayers = room.players.filter(p => !p.isEliminated);
  const aliveKingdoms = new Set(alivePlayers.map(p => p.kingdom));

  if (aliveKingdoms.size <= 1) {
    room.status = 'ended';
    const winningKingdom = Array.from(aliveKingdoms)[0] || 'Unknown';
    room.winnerKingdom = winningKingdom;
    addSystemLog(room.code, `🏆 TRẬN ĐẤU KẾT THÚC! Chiến thắng vinh quang dành cho vương quốc: ${winningKingdom.toUpperCase()}!`);

    if (room.dyingTimer) {
      clearTimeout(room.dyingTimer);
    }
  }
}

// Turn phases & transitions
function startTurn(room: ServerRoom, playerId: string) {
  room.turnPlayerId = playerId;
  room.turnPhase = 'start';

  const p = room.players.find(pl => pl.id === playerId);
  if (!p) return;

  room.pacts = room.pacts.filter(pact => pact.expiresOnPlayerId !== playerId);
  room.trackers = room.trackers.filter(tracker => tracker.trackerId !== playerId);
  p.isStunned = false;
  p.isEquipBlocked = Boolean(p.isBoundNextTurn);
  p.isBoundNextTurn = false;

  room.players.forEach((player) => {
    player.shieldFirstBlockActive = true;
    player.blazeFirstDmgActive = true;
    player.glacierFirstDmgActive = true;
    player.dodgesUsedThisTurn = 0;
    player.isLocked = false;
    player.isFrozen = false;
    player.stoneArmorTriggered = false;
    player.towerShieldTriggered = false;
    player.magnetTargetId = null;
    // Per-turn skill flags
    player.emberUsedThisTurn = false;
    player.flareUsedThisTurn = false;
    player.scorchUsedThisTurn = false;
    player.coralUsedThisTurn = false;
    player.aquaUsedThisTurn = false;
    player.cinderActivated = false;
    player.cinderBonusUsed = false;
    player.stormCanSwap = true;
    player.dealtDamageThisTurn = false;
    player.monsoonUsedThisTurn = false;
    player.springUsedThisTurn = false;
    player.willowUsedThisTurn = false;
    player.harborUsedThisTurn = false;
    player.hazelUsedThisTurn = false;
    player.pulseUsedThisTurn = false;
    player.sealProtectionUsed = false;
  });

  p.strikePlayedThisTurn = 0;
  p.hasTacticalFirstPlayed = false;

  // Che Chở lasts until the beginning of the protector's next turn.
  if (p.protectingPlayerId) {
    const protectedPlayer = room.players.find(other => other.id === p.protectingPlayerId);
    if (protectedPlayer?.protectedByPlayerId === p.id) {
      protectedPlayer.protectedByPlayerId = null;
    }
    p.protectingPlayerId = null;
  }

  addSystemLog(room.code, `⚡ Lượt mới của ${p.name}.`);

  // ===== START PHASE SKILLS =====
  // Mist: Đầu lượt, nếu đang bị thương, hồi 1 máu
  if (p.isRevealed && p.hero === 'Mist' && !p.isLocked && p.hp < p.maxHp) {
    p.hp += 1;
    addSystemLog(room.code, `Kỹ năng [Mist]: ${p.name} hồi phục 1 HP khi bắt đầu lượt.`);
  }

  // Seed: Nếu đầu lượt có số bài trên tay ít nhất bàn, rút thêm 1 lá
  if (p.isRevealed && p.hero === 'Seed' && !p.isLocked && !p.isEliminated) {
    const minHandSize = Math.min(...room.players.filter(pl => !pl.isEliminated).map(pl => pl.cards.length));
    if (p.cards.length <= minHandSize) {
      drawCards(room, p, 1);
      addSystemLog(room.code, `Kỹ năng [Seed]: ${p.name} rút thêm 1 lá vì có ít bài nhất.`);
    }
  }

  // Furnace: Có thể mất 1 máu để rút 2 lá
  if (p.isRevealed && p.hero === 'Furnace' && !p.isLocked && p.hp > 1) {
    p.hp -= 1;
    drawCards(room, p, 2);
    addSystemLog(room.code, `Kỹ năng [Furnace]: ${p.name} hy sinh 1 HP để rút 2 lá.`);
  }

  // Wind: Khoảng cách từ bạn đến tất cả người chơi khác giảm 1 (handled via calculateDistance)
  // (Wind's effect is passive, handled in calculateDistance)

  // Nimbus: Đầu lượt, chọn một người chơi. Khoảng cách trở thành 1
  if (p.isRevealed && p.hero === 'Nimbus' && !p.isLocked) {
    const targets = room.players.filter(pl => !pl.isEliminated && pl.id !== p.id);
    if (targets.length > 0) {
      // Auto-pick nearest opponent
      p.magnetTargetId = targets[0].id;
      addSystemLog(room.code, `Kỹ năng [Nimbus]: ${p.name} chọn ${targets[0].name} làm mục tiêu áp sát.`);
    }
  }

  // Orion: Đầu lượt, nếu không có ai trong tầm, tầm đánh +2 (handled in strike range check)
  if (p.isRevealed && p.hero === 'Orion' && !p.isLocked) {
    const hasTargetInRange = room.players.some(pl =>
      !pl.isEliminated && pl.id !== p.id && calculateDistance(room, p, pl) <= 1
    );
    if (!hasTargetInRange) {
      addSystemLog(room.code, `Kỹ năng [Orion]: ${p.name} kích hoạt tầm đánh +2 vì không có mục tiêu gần.`);
    }
  }

  // Ygg: Đầu lượt, nếu có nhiều bài nhất, hồi 1 máu hoặc rút 1 lá
  if (p.isRevealed && p.hero === 'Ygg' && !p.isLocked) {
    const maxHandSize = Math.max(...room.players.filter(pl => !pl.isEliminated).map(pl => pl.cards.length));
    if (p.cards.length >= maxHandSize && p.cards.length > 0) {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        addSystemLog(room.code, `Kỹ năng [Ygg]: ${p.name} hồi 1 máu vì có nhiều bài nhất.`);
      } else {
        drawCards(room, p, 1);
        addSystemLog(room.code, `Kỹ năng [Ygg]: ${p.name} rút 1 lá vì có nhiều bài nhất.`);
      }
    }
  }

  // Leviathan: Đầu lượt nếu có ít máu nhất, rút thêm 1 và hồi 1 máu
  if (p.isRevealed && p.hero === 'Leviathan' && !p.isLocked) {
    const minHp = Math.min(...room.players.filter(pl => !pl.isEliminated).map(pl => pl.hp));
    if (p.hp <= minHp) {
      drawCards(room, p, 1);
      p.hp = Math.min(p.maxHp, p.hp + 1);
      addSystemLog(room.code, `Kỹ năng [Leviathan]: ${p.name} hồi 1 máu và rút 1 lá vì yếu nhất bàn.`);
    }
  }

  // Acorn: Đầu lượt, nếu không có trang bị, tìm 1 trang bị từ 3 lá trên cùng
  if (p.isRevealed && p.hero === 'Acorn' && !p.isLocked && p.equipments.length === 0) {
    const top3 = room.deck.slice(-3);
    if (top3.length > 0) {
      const equipCard = top3.find(c => c.category === 'equip');
      if (equipCard) {
        const idx = room.deck.indexOf(equipCard);
        room.deck.splice(idx, 1);
        p.cards.push(equipCard);
        addSystemLog(room.code, `Kỹ năng [Acorn]: ${p.name} tìm được [${equipCard.name}] từ đáy bộ bài.`);
      } else {
        addSystemLog(room.code, `Kỹ năng [Acorn]: ${p.name} không tìm thấy trang bị trong 3 lá cuối.`);
      }
    }
  }

  // Magma: Kiểm tra nếu <= 2 máu, tầm +1 (handled in strike range)
  if (p.isRevealed && p.hero === 'Magma' && !p.isLocked && p.hp <= 2) {
    addSystemLog(room.code, `Kỹ năng [Magma]: ${p.name} ở ngưỡng 2 máu, tầm đánh +1.`);
  }

  // Blaze reset (done in the player forEach above)

  // ===== DRAW PHASE =====
  room.turnPhase = 'draw';
  const skipDraw = Boolean(p.isStunned);

  // Flora: Rút thêm 1 lá (3 thay vì 2)
  let drawCount = 2;
  if (!skipDraw && p.isRevealed && p.hero === 'Flora' && !p.isLocked) {
    drawCount = 3;
    addSystemLog(room.code, `Kỹ năng [Flora]: ${p.name} rút 3 lá bài.`);
  }

  if (skipDraw) {
    addSystemLog(room.code, `😵 ${p.name} bị Choáng và bỏ qua giai đoạn rút bài.`);
  } else {
    drawCards(room, p, drawCount);
  }
  room.turnPhase = 'action';
}

function startEndPhase(room: ServerRoom, playerId: string) {
  const p = room.players.find(pl => pl.id === playerId);
  if (!p) return;

  room.turnPhase = 'end';

  // Ocean: Cuối lượt, nếu không gây sát thương, rút 1 lá
  if (p.isRevealed && p.hero === 'Ocean' && !p.isLocked) {
    if (!p.dealtDamageThisTurn) {
      drawCards(room, p, 1);
      addSystemLog(room.code, `Kỹ năng [Ocean]: ${p.name} rút 1 lá vì không gây sát thương trong lượt.`);
    }
  }

  // Cedar: Nếu cuối lượt có >= 6 lá, hồi 1 máu
  if (p.isRevealed && p.hero === 'Cedar' && !p.isLocked && p.cards.length >= 6) {
    p.hp = Math.min(p.maxHp, p.hp + 1);
    addSystemLog(room.code, `Kỹ năng [Cedar]: ${p.name} hồi 1 máu vì có ${p.cards.length} lá trên tay.`);
  }

  // Bark: Giới hạn cầm bài cuối lượt +2 (handled in endTurn discard check)
  // Leaf: Sau khi bỏ bài, rút lại 1 lá (handled after discard)
  advanceTurn(room);
}

function advanceTurn(room: ServerRoom) {
  room.activeAction = null;
  room.pendingActions = [];
  room.pendingDamages = [];
  const alivePlayers = room.players.filter(p => !p.isEliminated);
  if (alivePlayers.length === 0) return;

  let nextIndex = 0;
  if (room.turnPlayerId) {
    const currentIndex = room.players.findIndex(p => p.id === room.turnPlayerId);
    nextIndex = (currentIndex + 1) % room.players.length;

    while (room.players[nextIndex].isEliminated) {
      nextIndex = (nextIndex + 1) % room.players.length;
    }
  }

  const nextPlayer = room.players[nextIndex];
  startTurn(room, nextPlayer.id);
}

function endTurn(room: ServerRoom, playerId: string) {
  const p = room.players.find(pl => pl.id === playerId);
  if (!p) return;

  // Bark: Giới hạn cầm bài cuối lượt tăng thêm 2
  const barkBonus = p.isRevealed && p.hero === 'Bark' && !p.isLocked ? 2 : 0;
  const handLimit = p.hp + barkBonus;
  const cardsCount = p.cards.length;

  if (cardsCount > handLimit) {
    room.turnPhase = 'discard';
    addSystemLog(room.code, `${p.name} cần bỏ bớt ${cardsCount - handLimit} lá bài (giới hạn: ${handLimit}).`);
  } else {
    startEndPhase(room, playerId);
  }
}

function getNextAction(room: ServerRoom, completedAction: ServerActiveAction): ServerActiveAction | null {
  if (completedAction.card.type !== 'fire' || !completedAction.remainingTargets?.length) {
    return null;
  }

  const remainingTargets = [...completedAction.remainingTargets];
  while (remainingTargets.length > 0) {
    const nextTargetId = remainingTargets.shift()!;
    const nextTarget = room.players.find(player => player.id === nextTargetId && !player.isEliminated);
    if (nextTarget) {
      return {
        id: completedAction.id,
        type: 'waiting_for_dodge',
        card: completedAction.card,
        sourcePlayerId: completedAction.sourcePlayerId,
        targetPlayerId: nextTargetId,
        pendingDamage: 1,
        remainingTargets,
      };
    }
  }

  return null;
}

function resumePendingAction(room: ServerRoom) {
  const pendingDamage = room.pendingDamages.shift();
  if (pendingDamage) {
    dealDamage(room, pendingDamage.targetId, pendingDamage.amount, pendingDamage.sourceId, pendingDamage.kind);
    if (room.activeAction?.type !== 'waiting_for_dying_heal') resumePendingAction(room);
    return;
  }
  room.activeAction = null;
  while (room.pendingActions.length > 0) {
    const candidate = room.pendingActions.pop()!;
    const sourceAlive = room.players.some(player => player.id === candidate.sourcePlayerId && !player.isEliminated);
    const targetAlive = room.players.some(player => player.id === candidate.targetPlayerId && !player.isEliminated);
    if (sourceAlive && targetAlive) {
      room.activeAction = candidate;
      break;
    }
  }
}

function dealDamageSequence(room: ServerRoom, damages: PendingDamage[]) {
  if (damages.length === 0) return;
  const [first, ...remaining] = damages;
  room.pendingDamages.unshift(...remaining);
  dealDamage(room, first.targetId, first.amount, first.sourceId, first.kind);
  if (room.activeAction?.type !== 'waiting_for_dying_heal') resumePendingAction(room);
}

function finishResolvedAction(room: ServerRoom, completedAction: ServerActiveAction) {
  const nextAction = getNextAction(room, completedAction);
  if (nextAction) {
    room.activeAction = nextAction;
  } else {
    resumePendingAction(room);
  }
}

function dealActionDamage(
  room: ServerRoom,
  completedAction: ServerActiveAction,
  targetId: string,
  amount: number,
  sourceId: string,
  kind: DamageKind = 'other',
) {
  const nextAction = getNextAction(room, completedAction);
  dealDamage(room, targetId, amount, sourceId, kind);

  if (room.activeAction?.type === 'waiting_for_dying_heal') {
    if (nextAction) room.pendingActions.push(nextAction);
  } else {
    if (nextAction) room.pendingActions.push(nextAction);
    resumePendingAction(room);
  }
}

// Clean up player leave
function handlePlayerLeave(ws: WebSocket, immediate = false) {
  const meta = wsMeta.get(ws);
  if (!meta) return;

  const { playerId, roomCode, sessionToken } = meta;
  wsMeta.delete(ws);

  const session = playerSessions.get(sessionToken);
  if (!session || session.socket !== ws) return;

  const room = rooms[roomCode];
  if (!room) {
    playerSessions.delete(sessionToken);
    return;
  }

  const leavingPlayer = room.players.find(p => p.id === playerId);
  if (!immediate) {
    if (leavingPlayer) leavingPlayer.isConnected = false;
    broadcastToRoom(roomCode);
    session.disconnectTimer = setTimeout(() => removePlayer(sessionToken), RECONNECT_GRACE_MS);
    return;
  }
  removePlayer(sessionToken);
}

function removePlayer(sessionToken: string) {
  const session = playerSessions.get(sessionToken);
  if (!session) return;
  const { playerId, roomCode } = session;
  if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
  playerSessions.delete(sessionToken);

  const room = rooms[roomCode];
  if (!room) return;

  const leavingPlayer = room.players.find(p => p.id === playerId);
  const leavingPlayerName = leavingPlayer ? leavingPlayer.name : 'Người chơi';

  if (room.status === 'playing' && leavingPlayer) {
    if (room.dyingTimer && room.activeAction?.dyingPlayerId === playerId) {
      clearTimeout(room.dyingTimer);
      room.dyingTimer = undefined;
    }
    room.pendingActions = room.pendingActions.filter(action =>
      action.sourcePlayerId !== playerId && action.targetPlayerId !== playerId &&
      action.duelTurnPlayerId !== playerId && action.dyingPlayerId !== playerId
    );
    room.pendingDamages = room.pendingDamages.filter(damage => damage.sourceId !== playerId && damage.targetId !== playerId);
    if (room.activeAction && (
      room.activeAction.sourcePlayerId === playerId || room.activeAction.targetPlayerId === playerId ||
      room.activeAction.duelTurnPlayerId === playerId || room.activeAction.dyingPlayerId === playerId
    )) room.activeAction = null;
    eliminatePlayer(room, playerId, playerId);
  }
  room.players = room.players.filter(p => p.id !== playerId);
  addSystemLog(roomCode, `${leavingPlayerName} đã rời phòng.`);

  if (room.players.length === 0) {
    delete rooms[roomCode];
    if (roomTimers[roomCode]) {
      clearInterval(roomTimers[roomCode]);
      delete roomTimers[roomCode];
    }
    console.log(`Room ${roomCode} deleted.`);
  } else {
    if (leavingPlayer?.isHost) {
      room.players[0].isHost = true;
      addSystemLog(roomCode, `${room.players[0].name} là chủ phòng mới.`);
    }
    if (room.status === 'playing') checkVictoryConditions(room);
    broadcastToRoom(roomCode);
  }
  sendPublicRooms();
}

// WebSocket connection
wss.on('connection', (ws) => {
  responsiveSockets.add(ws);
  ws.on('pong', () => responsiveSockets.add(ws));
  console.log('Client connected to War of elements engine.');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'GET_PUBLIC_ROOMS': {
          const publicRoomsList = Object.values(rooms).map(r => ({
            code: r.code,
            hostName: r.players.find(p => p.isHost)?.name || 'Ẩn danh',
            playerCount: r.players.length,
            status: r.status
          }));
          ws.send(JSON.stringify({ type: 'PUBLIC_ROOMS_LIST', payload: { rooms: publicRoomsList } }));
          break;
        }

        case 'RESUME_SESSION': {
          const token = String(data.payload?.sessionToken || '');
          const session = playerSessions.get(token);
          const room = session && rooms[session.roomCode];
          const player = room?.players.find(p => p.id === session?.playerId);
          if (!session || !room || !player) {
            ws.send(JSON.stringify({ type: 'SESSION_EXPIRED' }));
            break;
          }
          attachSession(ws, player.id, room.code, token);
          player.isConnected = true;
          ws.send(JSON.stringify({ type: 'ROOM_JOINED', payload: {
            room: getSanitizedRoom(room, player.id), myPlayerId: player.id,
            sessionToken: token, resumed: true
          } }));
          broadcastToRoom(room.code);
          break;
        }

        case 'CREATE_ROOM': {
          const { playerName, avatar, color } = data.payload;
          const roomCode = generateRoomCode();

          const newPlayer: ServerPlayer = {
            id: Math.random().toString(36).substring(2, 11),
            name: playerName || 'Chủ phòng',
            avatar: avatar || '🔥',
            color: color || '#ef4444',
            isReady: true,
            isHost: true,
            score: 0,
            hp: 4,
            maxHp: 4,
            isRevealed: false,
            isEliminated: false,
            cards: [],
            equipments: [],
            revealedTeammates: [],
            isLocked: false,
            shieldFirstBlockActive: true,
            protectingPlayerId: null,
            protectedByPlayerId: null,
            strikePlayedThisTurn: 0,
            dodgesUsedThisTurn: 0,
            isConnected: true,
          };

          rooms[roomCode] = {
            code: roomCode,
            players: [newPlayer],
            status: 'lobby',
            clickGoal: 100,
            clickProgress: 0,
            gameTimeLeft: 0,
            systemLogs: [],
            turnPlayerId: null,
            turnPhase: null,
            deckCount: 0,
            discardPileCount: 0,
            activeAction: null,
            pendingActions: [],
            pendingDamages: [],
            pacts: [],
            trackers: [],
            privateLogs: { [newPlayer.id]: [] },
            winnerKingdom: null,
            deck: [],
            discardPile: []
          };

          const sessionToken = attachSession(ws, newPlayer.id, roomCode);
          addSystemLog(roomCode, `${newPlayer.name} đã lập phòng ${roomCode}.`);

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            payload: {
              room: getSanitizedRoom(rooms[roomCode], newPlayer.id),
              myPlayerId: newPlayer.id,
              sessionToken
            }
          }));
          sendPublicRooms();
          break;
        }

        case 'JOIN_ROOM': {
          const { roomCode, playerName, avatar, color } = data.payload;
          const cleanCode = (roomCode || '').toUpperCase().trim();
          const room = rooms[cleanCode];

          if (!room) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Phòng không tồn tại. Vui lòng kiểm tra mã.' }));
            return;
          }

          if (room.status !== 'lobby') {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Trận đấu đang diễn ra.' }));
            return;
          }

          if (room.players.length >= 12) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Lobby đã đầy.' }));
            return;
          }

          const newPlayer: ServerPlayer = {
            id: Math.random().toString(36).substring(2, 11),
            name: playerName || `Anh hùng ${room.players.length + 1}`,
            avatar: avatar || '💧',
            color: color || '#3b82f6',
            isReady: false,
            isHost: false,
            score: 0,
            hp: 4,
            maxHp: 4,
            isRevealed: false,
            isEliminated: false,
            cards: [],
            equipments: [],
            revealedTeammates: [],
            isLocked: false,
            shieldFirstBlockActive: true,
            protectingPlayerId: null,
            protectedByPlayerId: null,
            strikePlayedThisTurn: 0,
            dodgesUsedThisTurn: 0,
          };

          room.players.push(newPlayer);
          newPlayer.isConnected = true;
          room.privateLogs[newPlayer.id] = [];
          const sessionToken = attachSession(ws, newPlayer.id, cleanCode);

          addSystemLog(cleanCode, `${newPlayer.name} đã gia nhập.`);

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            payload: {
              room: getSanitizedRoom(room, newPlayer.id),
              myPlayerId: newPlayer.id,
              sessionToken
            }
          }));

          broadcastToRoom(cleanCode);
          sendPublicRooms();
          break;
        }

        case 'TOGGLE_READY': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room) return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (player) {
            player.isReady = !player.isReady;
            addSystemLog(meta.roomCode, `${player.name} hiện tại đang ${player.isReady ? 'SẴN SÀNG' : 'CHỜ'}.`);
            broadcastToRoom(meta.roomCode);
          }
          break;
        }

        case 'START_GAME': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room) return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (!player || !player.isHost) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Chỉ chủ phòng mới được bắt đầu game.' }));
            return;
          }

          if (room.players.length < 3) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Trò chơi cần tối thiểu 3 người để bắt đầu.' }));
            return;
          }

          const unreadyPlayers = room.players.filter(p => !p.isReady);
          if (unreadyPlayers.length > 0) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: `Không thể bắt đầu. Vẫn còn người chưa sẵn sàng: ${unreadyPlayers.map(p => p.name).join(', ')}.`
            }));
            return;
          }

          // Initialize Card Game Engine State
          room.status = 'playing';
          room.winnerKingdom = null;
          room.activeAction = null;
          room.pendingActions = [];
          room.pendingDamages = [];
          room.pacts = [];
          room.trackers = [];
          room.systemLogs = [];
          room.privateLogs = Object.fromEntries(room.players.map(roomPlayer => [roomPlayer.id, []]));

          // Assign Factions & Heroes
          assignFactionsAndHeroes(room.players);

          // Build Shuffled Deck
          room.deck = generateDeck();
          room.discardPile = [];

          // Deal Starting Hands (5 Cards per player)
          room.players.forEach(p => {
            drawCards(room, p, 5);
          });

          // Pick random start player
          const startingPlayer = room.players[Math.floor(Math.random() * room.players.length)];
          addSystemLog(meta.roomCode, `⚔️ Trận chiến bắt đầu! Thẻ bài đã được chia.`);

          // Start the Turn
          startTurn(room, startingPlayer.id);
          broadcastToRoom(meta.roomCode);
          sendPublicRooms();
          break;
        }

        case 'REVEAL_HERO': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || room.status !== 'playing') return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (player && !player.isRevealed && !player.isEliminated &&
            room.turnPlayerId === player.id && room.turnPhase === 'action' && !room.activeAction) {
            revealHero(room, player);
            addSystemLog(meta.roomCode, `📢 ${player.name} đã LẬT NHÂN VẬT! [${player.kingdom?.toUpperCase()}] - Anh hùng: [${player.hero}]. HP: ${player.hp}/${player.maxHp}`);

            broadcastToRoom(meta.roomCode);
          }
          break;
        }

        case 'PLAY_CARD': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || room.status !== 'playing') return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (!player || player.isEliminated || room.turnPlayerId !== player.id || room.turnPhase !== 'action') return;
          if (room.activeAction) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Hãy giải quyết hành động hiện tại trước khi dùng lá bài khác.' }));
            return;
          }

          const { cardId, targetPlayerId } = data.payload;
          const cardIndex = player.cards.findIndex(c => c.id === cardId);
          if (cardIndex === -1) return;

          const card = player.cards[cardIndex];
          const target = room.players.find(p => p.id === targetPlayerId);

          if (target && target.id !== player.id && !canChooseTarget(room, player, target)) {
            ws.send(JSON.stringify({ type: 'ERROR', message: `Màn Sương khiến ${target.name} không thể bị chọn từ khoảng cách này.` }));
            return;
          }

          // Card type usage validation
          if (card.type === 'strike') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Vui lòng chọn mục tiêu hợp lệ để Đánh.' }));
              return;
            }

            if (player.isFrozen) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Bạn đang bị Đóng Băng và không thể dùng Đánh trong lượt này.' }));
              return;
            }

            // Hellfire: Strike on wounded target doesn't count toward limit
            const hellfireBonus = player.isRevealed && player.hero === 'Hellfire' && !player.isLocked && target.hp < target.maxHp;

            // Check Strike Limit
            if (player.strikePlayedThisTurn >= 1 && !hellfireBonus) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Bạn đã đạt giới hạn dùng lá Đánh lượt này (1 lá).' }));
              return;
            }

            // Calculate range
            const isFirstStrike = player.strikePlayedThisTurn === 0;

            // Bolt: First strike infinite range
            const hasDart = player.equipments.some(e => e.type === 'dart');
            const hasInfiniteRange = isFirstStrike &&
              ((player.isRevealed && player.hero === 'Bolt' && !player.isLocked) || hasDart);

            // Magma: +1 range if <= 2 HP
            const magmaBonus = player.isRevealed && player.hero === 'Magma' && !player.isLocked && player.hp <= 2 ? 1 : 0;

            // Orion: +2 range if no targets in range
            const orionBonus = player.isRevealed && player.hero === 'Orion' && !player.isLocked ? 2 : 0;

            // Flash: +1 range if no weapon
            const flashBonus = player.isRevealed && player.hero === 'Flash' && !player.isLocked && !player.equipments.some(e => e.equipSlot === 'weapon') ? 1 : 0;

            if (!hasInfiniteRange) {
              const weapon = player.equipments.find(e => e.equipSlot === 'weapon');
              const telescopeBonus = player.equipments.some(e => e.type === 'telescope') ? 2 : 0;
              const maxRange = (weapon?.range || 1) + telescopeBonus + magmaBonus + orionBonus + flashBonus;

              const distance = calculateDistance(room, player, target);

              if (distance > maxRange) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Đối phương ngoài tầm đánh của bạn. Trang bị Kiếm để tăng tầm!' }));
                return;
              }
            }

            // Remove card from hand
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            if (!hellfireBonus) player.strikePlayedThisTurn += 1;

            addSystemLog(meta.roomCode, `⚔️ ${player.name} dùng ĐÁNH nhắm vào ${target.name}.`);

            // Vulcan: First strike each turn cannot be dodged
            const vulcanUndodgeable = player.isRevealed && player.hero === 'Vulcan' && !player.isLocked && isFirstStrike;

            let needsLongSwordDiscard = hasEquipment(player, 'long_sword');
            if (needsLongSwordDiscard) {
              drawCards(room, player, 1);
              needsLongSwordDiscard = player.cards.length > 0;
              addSystemLog(meta.roomCode, `⚔️ Trường Kiếm: ${player.name} rút 1 lá và phải chọn bỏ 1 lá.`);
            }

            if (hasEquipment(target, 'stone_armor') && !target.stoneArmorTriggered) {
              target.stoneArmorTriggered = true;
              drawCards(room, target, 1);
              addSystemLog(meta.roomCode, `🪨 Giáp Đá giúp ${target.name} rút 1 lá.`);
            }

            if (hasEquipment(target, 'tower_shield') && !target.towerShieldTriggered) {
              target.towerShieldTriggered = true;
              addSystemLog(meta.roomCode, `🏰 Đại Khiên vô hiệu hóa lá Đánh đầu tiên nhắm vào ${target.name}.`);
              if (needsLongSwordDiscard) {
                room.activeAction = {
                  id: `long_sword_${Math.random().toString(36).substring(2, 9)}`,
                  type: 'waiting_for_long_sword_discard', card,
                  sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 0,
                };
              }
              broadcastToRoom(meta.roomCode);
              break;
            }

            // Cinder: +1 damage if activated
            const cinderBonus = player.isRevealed && player.hero === 'Cinder' && !player.isLocked && player.cinderActivated ? 1 : 0;
            if (cinderBonus) player.cinderActivated = false;

            // Solaris: +1 damage if only 1 card in hand
            const solarisBonus = player.isRevealed && player.hero === 'Solaris' && !player.isLocked && player.cards.length === 1 ? 1 : 0;

            // Gust: When distance to target is 1, next strike +1
            const gustBonus = player.isRevealed && player.hero === 'Gust' && !player.isLocked && calculateDistance(room, player, target) <= 1 ? 1 : 0;

            // Hammer bonus
            const hammerBonus = hasEquipment(player, 'hammer') && isFirstStrike ? 1 : 0;

            const strikeDamage = 1 + hammerBonus + cinderBonus + solarisBonus + gustBonus;

            // Tempest: After first strike, view random card
            if (isFirstStrike && player.isRevealed && player.hero === 'Tempest' && !player.isLocked && target.cards.length > 0) {
              const viewed = target.cards[Math.floor(Math.random() * target.cards.length)];
              addPrivateLog(room, [player.id], `Kỹ năng [Tempest]: Xem bài của ${target.name}: [${viewed.name}].`);
            }

            // Set waiting for dodge action state
            const strikeAction: ServerActiveAction = {
              id: `act_${Math.random().toString(36).substring(2, 9)}`,
              type: 'waiting_for_dodge',
              card,
              sourcePlayerId: player.id,
              targetPlayerId: target.id,
              pendingDamage: strikeDamage
            };

            // Vulcan: No dodge allowed - skip straight to damage
            if (vulcanUndodgeable) {
              addSystemLog(meta.roomCode, `Kỹ năng [Vulcan]: Đòn Đánh của ${player.name} không thể bị Đỡ!`);
              dealDamage(room, target.id, strikeDamage, player.id, 'strike');
              checkVictoryConditions(room);
              if (needsLongSwordDiscard) {
                room.activeAction = {
                  id: `long_sword_${Math.random().toString(36).substring(2, 9)}`,
                  type: 'waiting_for_long_sword_discard', card,
                  sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 0,
                };
              }
              broadcastToRoom(meta.roomCode);
              break;
            }
            if (needsLongSwordDiscard) {
              room.pendingActions.push(strikeAction);
              room.activeAction = {
                id: `long_sword_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_long_sword_discard', card,
                sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 0,
              };
            } else {
              room.activeAction = strikeAction;
            }
          }

          else if (card.type === 'dodge') {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Lá Đỡ chỉ có thể dùng để phản hồi đòn tấn công.' }));
            return;
          }

          else if (card.type === 'heal') {
            if (!target || target.isEliminated) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Vui lòng chọn mục tiêu hợp lệ để Hồi máu.' }));
              return;
            }

            if (target.hp >= target.maxHp) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Người chơi đã đầy máu.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            target.hp += 1;
            addSystemLog(meta.roomCode, `❤️ ${player.name} dùng HỒI phục hồi 1 HP cho ${target.id === player.id ? 'bản thân' : target.name}.`);

            // Tide: Lần đầu hồi máu cho người khác mỗi lượt, họ hồi thêm 1
            if (target.id !== player.id && player.isRevealed && player.hero === 'Tide' && !player.isLocked) {
              if (target.hp < target.maxHp) {
                target.hp += 1;
                addSystemLog(meta.roomCode, `Kỹ năng [Tide]: ${target.name} hồi thêm 1 máu nhờ ${player.name}.`);
              }
            }

            // Aqua skill check: "Sau khi hồi máu cho người khác, rút 1 lá."
            if (target.id !== player.id && player.isRevealed && player.hero === 'Aqua' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Aqua]: ${player.name} hồi máu cho người khác và rút 1 lá.`);
            }
          }

          else if (card.type === 'fire') {
            // "Tất cả người chơi khác phải dùng Đỡ, nếu không nhận 1 sát thương."
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🔥 ${player.name} phóng hỏa LỬA vạn trượng lên tất cả người chơi khác!`);

            // Inferno: Sau khi dùng Lửa, rút 1 lá
            if (player.isRevealed && player.hero === 'Inferno' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Inferno]: ${player.name} rút 1 lá sau khi dùng Lửa.`);
            }

            // Track Spark skill & Ring
            handleTacticalPlayExtras(room, player, card.type);

            // Get targets sequentially (all other living players)
            const otherLiving = room.players.filter(p =>
              !p.isEliminated && p.id !== player.id && !hasEquipment(p, 'fire_armor')
            );
            if (otherLiving.length > 0) {
              room.activeAction = {
                id: `fire_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_dodge',
                card,
                sourcePlayerId: player.id,
                targetPlayerId: otherLiving[0].id,
                pendingDamage: 1,
                remainingTargets: otherLiving.slice(1).map(p => p.id),
              };
            }
          }

          else if (card.type === 'lightning') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để phóng sét.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `⚡ ${player.name} giáng SÉT tàn khốc lên ${target.name}!`);
            handleTacticalPlayExtras(room, player, card.type);

            if (hasEquipment(target, 'water_armor')) {
              room.activeAction = {
                id: `lightning_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_dodge',
                card,
                sourcePlayerId: player.id,
                targetPlayerId: target.id,
                pendingDamage: 1,
              };
            } else {
              dealDamage(room, target.id, 1, player.id, 'lightning');
            }
            checkVictoryConditions(room);
          }

          else if (card.type === 'duel') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu hợp lệ để tỉ thí Quyết Đấu.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `⚔️ ${player.name} khiêu chiến QUYẾT ĐẤU tay đôi với ${target.name}!`);
            handleTacticalPlayExtras(room, player, card.type);

            room.activeAction = {
              id: `duel_${Math.random().toString(36).substring(2, 9)}`,
              type: 'waiting_for_duel_strike',
              card,
              sourcePlayerId: player.id,
              targetPlayerId: target.id,
              pendingDamage: 1,
              duelTurnPlayerId: target.id
            };
          }

          else if (card.type === 'explosion') {
            if (!target || target.isEliminated || target.id === player.id) return;
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            handleTacticalPlayExtras(room, player, card.type);

            const targetIndex = room.players.findIndex(roomPlayer => roomPlayer.id === target.id);
            const affectedIndexes = [
              (targetIndex - 1 + room.players.length) % room.players.length,
              targetIndex,
              (targetIndex + 1) % room.players.length,
            ];
            const affected = [...new Set(affectedIndexes)]
              .map(index => room.players[index])
              .filter(affectedPlayer => !affectedPlayer.isEliminated && affectedPlayer.id !== player.id);
            addSystemLog(meta.roomCode, `💥 ${player.name} gây Nổ tại vị trí của ${target.name}.`);
            dealDamageSequence(room, affected.map(affectedPlayer => ({
              targetId: affectedPlayer.id,
              amount: 1,
              sourceId: player.id,
              kind: 'tactical' as DamageKind,
            })));
            checkVictoryConditions(room);
          }

          else if (card.type === 'assassinate' || card.type === 'pursuit') {
            if (!target || target.isEliminated || target.id === player.id) return;
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            handleTacticalPlayExtras(room, player, card.type);
            const damage = card.type === 'pursuit' && target.hp < target.maxHp ? 2 : 1;
            addSystemLog(meta.roomCode, `${card.emoji} ${player.name} dùng ${card.name} lên ${target.name}.`);
            dealDamage(room, target.id, damage, player.id, 'tactical');
            checkVictoryConditions(room);
          }

          else if (card.type === 'draw') {
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🎁 ${player.name} dùng RÚT bài.`);
            drawCards(room, player, 2);

            // Fern: Sau khi dùng Rút, rút thêm 1 lá
            if (player.isRevealed && player.hero === 'Fern' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Fern]: ${player.name} rút thêm 1 lá nhờ Rút bài.`);
            }

            handleTacticalPlayExtras(room, player, card.type);
          }

          else if (card.type === 'exchange') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để trao Đổi bài.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🔄 ${player.name} dùng ĐỔI bài với ${target.name}.`);
            handleTacticalPlayExtras(room, player, card.type);

            // Echo: Sau khi dùng Đổi, rút 1 lá
            if (player.isRevealed && player.hero === 'Echo' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Echo]: ${player.name} rút 1 lá sau khi Đổi.`);
            }

            // Moss only protects equipment from Steal; Exchange still affects hand cards.
            if (player.cards.length > 0 && target.cards.length > 0) {
              const myRandIdx = Math.floor(Math.random() * player.cards.length);
              const targetRandIdx = Math.floor(Math.random() * target.cards.length);

              const myCard = player.cards.splice(myRandIdx, 1)[0];
              const targetCard = target.cards.splice(targetRandIdx, 1)[0];

              player.cards.push(targetCard);
              target.cards.push(myCard);

              addSystemLog(meta.roomCode, `Trao đổi thành công! Hai người nhận ngẫu nhiên 1 lá của nhau.`);
            } else {
              addSystemLog(meta.roomCode, `Không thành công do một trong hai người không có bài trên tay.`);
            }
          }

          else if (card.type === 'lock') {
            if (!target || target.isEliminated) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để Khóa kỹ năng.' }));
              return;
            }

            if ((target && target.isRevealed && target.hero === 'River' && !target.isLocked)) {
              addSystemLog(meta.roomCode, `Kỹ năng [River]: ${target.name} miễn nhiễm với Khóa.`);
              broadcastToRoom(meta.roomCode);
              break;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🚫 ${player.name} dùng KHÓA pháp ấn lên ${target.name}.`);
            handleTacticalPlayExtras(room, player, card.type);

            target.isLocked = true;
          }

          else if (card.type === 'stun' || card.type === 'freeze' || card.type === 'bind') {
            if (!target || target.isEliminated || target.id === player.id) return;

            if ((target && target.isRevealed && target.hero === 'River' && !target.isLocked)) {
              addSystemLog(meta.roomCode, `Kỹ năng [River]: ${target.name} miễn nhiễm với ${card.name}.`);
              broadcastToRoom(meta.roomCode);
              break;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            handleTacticalPlayExtras(room, player, card.type);
            if (card.type === 'stun') target.isStunned = true;
            if (card.type === 'freeze') target.isFrozen = true;
            if (card.type === 'bind') target.isBoundNextTurn = true;
            addSystemLog(meta.roomCode, `${card.emoji} ${player.name} dùng ${card.name} lên ${target.name}.`);
          }

          else if (card.type === 'whirlwind') {
            if (!target || target.isEliminated || target.id === player.id || target.equipments.length === 0) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Mục tiêu không có trang bị để Cuốn Bay.' }));
              return;
            }

            if ((target && target.isRevealed && target.hero === 'River' && !target.isLocked)) {
              addSystemLog(meta.roomCode, `Kỹ năng [River]: ${target.name} miễn nhiễm với Cuốn Bay.`);
              broadcastToRoom(meta.roomCode);
              break;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            handleTacticalPlayExtras(room, player, card.type);
            room.activeAction = {
              id: `destroy_${Math.random().toString(36).substring(2, 9)}`,
              type: 'select_destroy_equipment', card,
              sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 0,
            };
          }

          else if (card.type === 'view') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để Xem tay.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `👀 ${player.name} lén lút XEM trộm bài của ${target.name}.`);
            handleTacticalPlayExtras(room, player, card.type);

            if (target.cards.length > 0) {
              const viewedCards = [...target.cards].sort(() => Math.random() - 0.5).slice(0, 2);
              room.activeAction = {
                id: `view_${Math.random().toString(36).substring(2, 9)}`,
                type: 'view_hand_result',
                card,
                sourcePlayerId: player.id,
                targetPlayerId: target.id,
                pendingDamage: 0,
                viewedCard: viewedCards[0] ? {
                  ...viewedCards[0],
                  name: viewedCards.map(viewed => viewed.name).join(' • '),
                  emoji: viewedCards.map(viewed => viewed.emoji).join(' '),
                } : undefined,
                viewedCards,
              };
            } else {
              addSystemLog(meta.roomCode, `${target.name} không có bài trên tay để xem.`);
            }
          }

          else if (card.type === 'steal') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu hợp lệ để Cướp.' }));
              return;
            }

            const mossProtectsEquipment = target.isRevealed && target.hero === 'Moss' && !target.isLocked;
            if (target.cards.length === 0 && (target.equipments.length === 0 || mossProtectsEquipment)) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Mục tiêu không có bài hay trang bị nào có thể cướp.' }));
              return;
            }

            // Let client choose what to steal: hand or equipment
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🎯 ${player.name} bắt đầu hành vi CƯỚP đoạt của ${target.name}.`);
            handleTacticalPlayExtras(room, player, card.type);

            room.activeAction = {
              id: `steal_${Math.random().toString(36).substring(2, 9)}`,
              type: 'select_steal',
              card,
              sourcePlayerId: player.id,
              targetPlayerId: target.id,
              pendingDamage: 0
            };
          }

          else if (card.category === 'equip') {
            if (player.isEquipBlocked) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Bạn đang bị Trói và không thể trang bị trong lượt này.' }));
              return;
            }
            if (card.type === 'magnet' && (!target || target.isEliminated || target.id === player.id)) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Hãy chọn mục tiêu cho Nam Châm.' }));
              return;
            }
            // Equip one item per slot: weapon, armor, or accessory.
            player.cards.splice(cardIndex, 1);

            const existingIdx = player.equipments.findIndex(e =>
              card.equipSlot ? e.equipSlot === card.equipSlot : e.type === card.type
            );
            if (existingIdx !== -1) {
              room.discardPile.push(player.equipments[existingIdx]);
              player.equipments.splice(existingIdx, 1);
            }

            player.equipments.push(card);
            if (card.type === 'magnet' && target) player.magnetTargetId = target.id;
            addSystemLog(meta.roomCode, `🛡️ ${player.name} trang bị thành công [${card.name}].`);

            // Vine: Sau khi trang bị, rút 1 lá
            if (player.isRevealed && player.hero === 'Vine' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Vine]: ${player.name} rút 1 lá sau khi trang bị.`);
            }
          }

          else if (card.category === 'teammate') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu đồng đội.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🤝 ${player.name} sử dụng liên kết đồng đội [${card.name}] lên ${target.name}.`);

            const isSameFaction = player.kingdom === target.kingdom;
            const identifiesFaction = ['connect', 'supply', 'protect', 'rescue', 'resonance', 'pact'].includes(card.type);

            if (identifiesFaction && isSameFaction) {
              if (!player.revealedTeammates.includes(target.id)) {
                player.revealedTeammates.push(target.id);
              }
              if (!target.revealedTeammates.includes(player.id)) {
                target.revealedTeammates.push(player.id);
              }
              addPrivateLog(room, [player.id, target.id], `✨ ${player.name} và ${target.name} đã nhận ra nhau là đồng đội cùng phe!`);
            } else if (identifiesFaction) {
              addPrivateLog(room, [player.id, target.id], `Không có phản ứng đồng đội: ${player.name} và ${target.name} thuộc các phe khác nhau.`);
            }

            if (card.type === 'supply') {
              drawCards(room, target, 2);
              addSystemLog(meta.roomCode, `🎁 ${target.name} nhận được Tiếp Tế 2 lá bài từ ${player.name}.`);
            } else if (card.type === 'protect') {
              target.protectedByPlayerId = player.id;
              player.protectingPlayerId = target.id;
              addSystemLog(meta.roomCode, `🛡️ ${player.name} sẽ Che Chở, gánh chịu toàn bộ sát thương thay ${target.name} cho tới đầu lượt sau.`);
            } else if (card.type === 'rescue') {
              target.hp = Math.min(target.maxHp, target.hp + 1);
              addSystemLog(meta.roomCode, `❤️ ${player.name} Cứu Viện, hồi 1 máu cho ${target.name}.`);
              if (player.isRevealed && player.hero === 'Aqua' && !player.isLocked) {
                drawCards(room, player, 1);
                addSystemLog(meta.roomCode, `Kỹ năng Aqua giúp ${player.name} rút 1 lá.`);
              }
            } else if (card.type === 'resonance') {
              drawCards(room, player, 2);
              drawCards(room, target, 2);
              addSystemLog(meta.roomCode, `🌟 ${player.name} và ${target.name} cùng rút 2 lá nhờ Cộng Hưởng.`);
            } else if (card.type === 'pact') {
              room.pacts.push({ playerIds: [player.id, target.id], expiresOnPlayerId: player.id });
              addSystemLog(meta.roomCode, `🕊️ ${player.name} lập Hiệp Ước với ${target.name} đến đầu lượt sau.`);
            } else if (card.type === 'investigate') {
              const viewedCards = [...target.cards].sort(() => Math.random() - 0.5).slice(0, 2);
              room.activeAction = {
                id: `investigate_${Math.random().toString(36).substring(2, 9)}`,
                type: 'view_hand_result',
                card,
                sourcePlayerId: player.id,
                targetPlayerId: target.id,
                pendingDamage: 0,
                viewedCard: viewedCards[0] ? {
                  ...viewedCards[0],
                  name: viewedCards.map(viewed => viewed.name).join(' • '),
                  emoji: viewedCards.map(viewed => viewed.emoji).join(' '),
                } : undefined,
                viewedCards,
              };
            } else if (card.type === 'track') {
              room.trackers = room.trackers.filter(tracker => tracker.trackerId !== player.id);
              room.trackers.push({ trackerId: player.id, targetId: target.id });
              addSystemLog(meta.roomCode, `👁️ ${player.name} bắt đầu Theo Dõi ${target.name}.`);
            } else if (card.type === 'trial' && !target.isRevealed) {
              room.activeAction = {
                id: `trial_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_trial_choice', card,
                sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 1,
              };
            } else if (card.type === 'provoke' && !target.isRevealed) {
              room.activeAction = {
                id: `provoke_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_provoke_choice', card,
                sourcePlayerId: player.id, targetPlayerId: target.id, pendingDamage: 0,
              };
            } else if (card.type === 'expose' && target.hp <= 2 && !target.isRevealed) {
              revealHero(room, target);
              addSystemLog(meta.roomCode, `🎭 ${target.name} bị Vạch Mặt và buộc phải lật nhân vật.`);
            }
          }

          broadcastToRoom(meta.roomCode);
          break;
        }

        case 'RESPOND_ACTION': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || room.status !== 'playing' || !room.activeAction) return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (!player || player.isEliminated) return;

          const { action, cardId, cardIds } = data.payload;

          if (room.activeAction.type === 'waiting_for_dodge') {
            if (player.id !== room.activeAction.targetPlayerId) return;
            const completedAction = room.activeAction;

            if (action === 'dodge') {
              const cardIdx = player.cards.findIndex(c => c.id === cardId && c.type === 'dodge');
              if (cardIdx === -1) return;

              const dodgeCard = player.cards[cardIdx];
              player.cards.splice(cardIdx, 1);
              room.discardPile.push(dodgeCard);
              player.dodgesUsedThisTurn += 1;

              addSystemLog(meta.roomCode, `🛡️ ${player.name} dùng ĐỠ né tránh đòn tấn công thành công.`);

              if (hasEquipment(player, 'crystal_shield')) {
                player.hp = Math.min(player.maxHp, player.hp + 1);
                addSystemLog(meta.roomCode, `💎 Khiên Pha Lê hồi 1 máu cho ${player.name}.`);
              }

              // Wave: Sau khi Đỡ thành công, rút 1 lá
              if (player.isRevealed && player.hero === 'Wave' && !player.isLocked) {
                drawCards(room, player, 1);
                addSystemLog(meta.roomCode, `Kỹ năng [Wave]: ${player.name} rút 1 lá sau khi Đỡ thành công.`);
              }

              // Bubble: Sau khi Đỡ thành công, khoảng cách từ người khác +1 (handled in calculateDistance)
              if (player.isRevealed && player.hero === 'Bubble' && !player.isLocked) {
                addSystemLog(meta.roomCode, `Kỹ năng [Bubble]: ${player.name} tạo khoảng cách sau khi né đòn.`);
              }

              // Volt skill trigger: "Sau khi dùng Đỡ thành công, có thể dùng ngay 1 lá Đánh."
              const attacker = room.players.find(a => a.id === completedAction.sourcePlayerId && !a.isEliminated);
              const nextAction = getNextAction(room, completedAction);
              if (nextAction) room.pendingActions.push(nextAction);

              // Crimson: Khi Đánh không gây sát thương (bị Đỡ), rút 1 lá
              if (attacker && attacker.isRevealed && attacker.hero === 'Crimson' && !attacker.isLocked) {
                drawCards(room, attacker, 1);
                addSystemLog(meta.roomCode, `Kỹ năng [Crimson]: ${attacker.name} rút 1 lá vì Đánh không trúng.`);
              }

              // Cyclone: same as Crimson
              if (attacker && attacker.isRevealed && attacker.hero === 'Cyclone' && !attacker.isLocked) {
                drawCards(room, attacker, 1);
                addSystemLog(meta.roomCode, `Kỹ năng [Cyclone]: ${attacker.name} rút 1 lá vì Đánh không trúng.`);
              }
              const canVoltStrike = player.isRevealed && player.hero === 'Volt' && !player.isLocked &&
                !player.isFrozen && attacker && player.cards.some(card => card.type === 'strike');
              if (canVoltStrike && attacker) {
                room.pendingActions.push({
                  id: `volt_${Math.random().toString(36).substring(2, 9)}`,
                  type: 'waiting_for_volt_strike',
                  card: dodgeCard,
                  sourcePlayerId: player.id,
                  targetPlayerId: attacker.id,
                  pendingDamage: 0,
                });
                addSystemLog(meta.roomCode, `⚡ Kỹ năng [Volt]: ${player.name} có thể dùng ngay 1 lá Đánh phản công ${attacker.name}.`);
              }

              const canUseAxe = completedAction.card.type === 'strike' && attacker &&
                hasEquipment(attacker, 'axe') && attacker.cards.length > 0;
              if (canUseAxe && attacker) {
                room.activeAction = {
                  id: `axe_${Math.random().toString(36).substring(2, 9)}`,
                  type: 'waiting_for_axe_discard',
                  card: completedAction.card,
                  sourcePlayerId: attacker.id,
                  targetPlayerId: player.id,
                  pendingDamage: 1,
                };
              } else {
                resumePendingAction(room);
              }
            } else {
              // Failed or decided to take damage
              addSystemLog(meta.roomCode, `💔 ${player.name} không thể Đỡ đòn tấn công.`);
              const kind: DamageKind = completedAction.card.type === 'strike'
                ? 'strike'
                : completedAction.card.type === 'fire' ? 'fire' : 'lightning';
              dealActionDamage(room, completedAction, player.id, completedAction.pendingDamage, completedAction.sourcePlayerId, kind);
            }
          }

          else if (room.activeAction.type === 'waiting_for_duel_strike') {
            const expectedPlayerId = room.activeAction.duelTurnPlayerId;
            if (player.id !== expectedPlayerId) return;

            if (action === 'strike') {
              if (player.isFrozen) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Bạn đang bị Đóng Băng và không thể dùng Đánh.' }));
                return;
              }
              const cardIdx = player.cards.findIndex(c => c.id === cardId && c.type === 'strike');
              if (cardIdx === -1) return;

              const strikeCard = player.cards[cardIdx];
              player.cards.splice(cardIdx, 1);
              room.discardPile.push(strikeCard);

              addSystemLog(meta.roomCode, `⚔️ ${player.name} phóng Đánh trả đòn Quyết Đấu!`);

              // Alternate active turn inside duel
              const nextDuelPlayerId = room.activeAction.duelTurnPlayerId === room.activeAction.sourcePlayerId 
                ? room.activeAction.targetPlayerId 
                : room.activeAction.sourcePlayerId;

              room.activeAction.duelTurnPlayerId = nextDuelPlayerId;
            } else {
              // Duel loser takes damage
              const completedAction = room.activeAction;
              const damageSourceId = completedAction.sourcePlayerId === player.id
                ? completedAction.targetPlayerId
                : completedAction.sourcePlayerId;
              addSystemLog(meta.roomCode, `💔 ${player.name} kiệt sức chịu thua trận đấu tay đôi!`);
              dealActionDamage(room, completedAction, player.id, 1, damageSourceId);
            }
          }

          else if (room.activeAction.type === 'waiting_for_volt_strike') {
            if (player.id !== room.activeAction.sourcePlayerId) return;
            const voltAction = room.activeAction;

            if (action === 'strike') {
              const cardIdx = player.cards.findIndex(c => c.id === cardId && c.type === 'strike');
              if (cardIdx === -1) return;

              const strikeCard = player.cards.splice(cardIdx, 1)[0];
              room.discardPile.push(strikeCard);
              room.activeAction = {
                id: `volt_strike_${Math.random().toString(36).substring(2, 9)}`,
                type: 'waiting_for_dodge',
                card: strikeCard,
                sourcePlayerId: player.id,
                targetPlayerId: voltAction.targetPlayerId,
                pendingDamage: 1,
              };
              addSystemLog(meta.roomCode, `⚡ ${player.name} dùng một lá ĐÁNH để phản công bằng kỹ năng Volt.`);
            } else {
              resumePendingAction(room);
            }
          }

          else if (room.activeAction.type === 'waiting_for_axe_discard') {
            if (player.id !== room.activeAction.sourcePlayerId) return;
            const axeAction = room.activeAction;
            if (action === 'discard') {
              const discardIndex = cardId
                ? player.cards.findIndex(card => card.id === cardId)
                : (player.cards.length > 0 ? 0 : -1);
              if (discardIndex === -1) return;
              room.discardPile.push(player.cards.splice(discardIndex, 1)[0]);
              addSystemLog(meta.roomCode, `🪓 ${player.name} bỏ 1 lá để Rìu vẫn gây sát thương.`);
              dealDamage(room, axeAction.targetPlayerId, 1, player.id, 'strike');
              if ((room.activeAction as ServerActiveAction | null)?.type !== 'waiting_for_dying_heal') resumePendingAction(room);
            } else {
              resumePendingAction(room);
            }
          }

          else if (room.activeAction.type === 'waiting_for_long_sword_discard') {
            if (player.id !== room.activeAction.sourcePlayerId) return;
            const discardIndex = player.cards.findIndex(card => card.id === cardId);
            if (action !== 'discard' || discardIndex === -1) return;
            room.discardPile.push(player.cards.splice(discardIndex, 1)[0]);
            addSystemLog(meta.roomCode, `⚔️ ${player.name} hoàn tất hiệu ứng Trường Kiếm và bỏ 1 lá.`);
            resumePendingAction(room);
          }

          else if (room.activeAction.type === 'waiting_for_trial_choice') {
            if (player.id !== room.activeAction.targetPlayerId) return;
            const trialAction = room.activeAction;
            if (action === 'reveal') {
              revealHero(room, player);
              addSystemLog(meta.roomCode, `🔥 ${player.name} chọn lật nhân vật trước Thử Lòng.`);
              room.activeAction = null;
            } else {
              dealDamage(room, player.id, 1, trialAction.sourcePlayerId, 'tactical');
              if ((room.activeAction as ServerActiveAction | null)?.type !== 'waiting_for_dying_heal') room.activeAction = null;
            }
          }

          else if (room.activeAction.type === 'waiting_for_provoke_choice') {
            if (player.id !== room.activeAction.targetPlayerId) return;
            if (action === 'reveal' || player.cards.length < 2) {
              revealHero(room, player);
              addSystemLog(meta.roomCode, `⚔️ ${player.name} lật nhân vật trước Khiêu Khích.`);
            } else {
              const selectedIds = Array.isArray(cardIds) ? [...new Set(cardIds)] : [];
              if (selectedIds.length !== 2 || selectedIds.some(id => !player.cards.some(card => card.id === id))) return;
              selectedIds.forEach(id => {
                const index = player.cards.findIndex(card => card.id === id);
                room.discardPile.push(player.cards.splice(index, 1)[0]);
              });
              addSystemLog(meta.roomCode, `⚔️ ${player.name} bỏ 2 lá trước Khiêu Khích.`);
            }
            room.activeAction = null;
          }

          else if (room.activeAction.type === 'waiting_for_dying_heal') {
            // Rescue dying player using heal
            if (action === 'heal') {
              const cardIdx = player.cards.findIndex(c => c.id === cardId && c.type === 'heal');
              if (cardIdx === -1) return;

              const healCard = player.cards[cardIdx];
              player.cards.splice(cardIdx, 1);
              room.discardPile.push(healCard);

              const dyingPlayer = room.players.find(p => p.id === room.activeAction?.dyingPlayerId);
              if (dyingPlayer) {
                dyingPlayer.hp = 1;
                addSystemLog(meta.roomCode, `💖 Tuyệt vời! ${player.name} kịp thời cứu sống ${dyingPlayer.name} từ cõi chết hồi 1 HP!`);

                if (room.dyingTimer) {
                  clearTimeout(room.dyingTimer);
                }

                // Aqua skill check
                if (dyingPlayer.id !== player.id && player.isRevealed && player.hero === 'Aqua' && !player.isLocked) {
                  drawCards(room, player, 1);
                  addSystemLog(meta.roomCode, `Kỹ năng [Aqua]: ${player.name} cứu đồng đội và rút 1 lá.`);
                }

                // Rain: Sau khi cứu người hấp hối thành công, rút 2 lá
                if (player.isRevealed && player.hero === 'Rain' && !player.isLocked) {
                  drawCards(room, player, 2);
                  addSystemLog(meta.roomCode, `Kỹ năng [Rain]: ${player.name} rút 2 lá sau khi cứu người.`);
                }

                resumePendingAction(room);
              }
            }
          }

          broadcastToRoom(meta.roomCode);
          checkVictoryConditions(room);
          break;
        }

        case 'DESTROY_SELECT': {
          const meta = wsMeta.get(ws);
          if (!meta) return;
          const room = rooms[meta.roomCode];
          if (!room?.activeAction || room.activeAction.type !== 'select_destroy_equipment') return;
          const source = room.players.find(player => player.id === room.activeAction?.sourcePlayerId);
          const target = room.players.find(player => player.id === room.activeAction?.targetPlayerId);
          if (!source || !target || source.id !== meta.playerId) return;
          const equipmentIndex = target.equipments.findIndex(equipment => equipment.id === data.payload.targetCardId);
          if (equipmentIndex === -1) return;

          // Seal: Lần đầu mỗi lượt trang bị sắp bị phá hủy, bỏ qua
          if (target.isRevealed && target.hero === 'Seal' && !target.isLocked && !target.sealProtectionUsed) {
            target.sealProtectionUsed = true;
            addSystemLog(meta.roomCode, `Kỹ năng [Seal]: ${target.name} bảo vệ trang bị khỏi bị phá hủy.`);
            room.activeAction = null;
            broadcastToRoom(meta.roomCode);
            break;
          }

          const destroyed = target.equipments.splice(equipmentIndex, 1)[0];
          room.discardPile.push(destroyed);
          room.activeAction = null;
          addSystemLog(meta.roomCode, `🌪️ ${source.name} phá hủy [${destroyed.name}] của ${target.name}.`);

          // Arc: Sau khi phá hủy trang bị, rút 1 lá
          if (source.isRevealed && source.hero === 'Arc' && !source.isLocked) {
            drawCards(room, source, 1);
            addSystemLog(meta.roomCode, `Kỹ năng [Arc]: ${source.name} rút 1 lá sau khi phá hủy trang bị.`);
          }

          // Root: Khi trang bị rời khỏi khu vực trang bị, rút 2 lá
          if (target.isRevealed && target.hero === 'Root' && !target.isLocked) {
            drawCards(room, target, 2);
            addSystemLog(meta.roomCode, `Kỹ năng [Root]: ${target.name} rút 2 lá khi mất trang bị.`);
          }

          // Elder: Sau khi có người phá hủy trang bị, hồi 1 máu
          if (target.isRevealed && target.hero === 'Elder' && !target.isLocked) {
            target.hp = Math.min(target.maxHp, target.hp + 1);
            addSystemLog(meta.roomCode, `Kỹ năng [Elder]: ${target.name} hồi 1 máu sau khi mất trang bị.`);
          }

          // Maple: Sau khi bỏ bài của người khác, xem thêm 1 lá trên tay họ
          if (source.isRevealed && source.hero === 'Maple' && !source.isLocked && target.cards.length > 0) {
            const viewed = target.cards[Math.floor(Math.random() * target.cards.length)];
            addPrivateLog(room, [source.id], `Kỹ năng [Maple]: Xem bài của ${target.name}: [${viewed.name}].`);
          }

          broadcastToRoom(meta.roomCode);
          break;
        }

        case 'STEAL_SELECT': {
          // Execution of choice from steal
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || !room.activeAction || room.activeAction.type !== 'select_steal') return;

          const source = room.players.find(p => p.id === room.activeAction?.sourcePlayerId);
          const target = room.players.find(p => p.id === room.activeAction?.targetPlayerId);
          if (!source || !target || source.id !== meta.playerId) return;

          const { targetType, targetCardId } = data.payload; // 'hand' or 'equip'

          if (targetType === 'equip') {
            if (target.isRevealed && target.hero === 'Moss' && !target.isLocked) {
              ws.send(JSON.stringify({ type: 'ERROR', message: `Kỹ năng Moss bảo vệ trang bị của ${target.name}.` }));
              return;
            }
            const eqIdx = target.equipments.findIndex(e => e.id === targetCardId);
            if (eqIdx === -1) return;
            const stolen = target.equipments.splice(eqIdx, 1)[0];
            source.cards.push(stolen);
            addSystemLog(meta.roomCode, `🎯 ${source.name} đã giật lấy món đồ [${stolen.name}] từ trang bị của ${target.name}.`);

            // Root: Khi trang bị rời khỏi khu vực trang bị (bị cướp), rút 2 lá
            if (target.isRevealed && target.hero === 'Root' && !target.isLocked) {
              drawCards(room, target, 2);
              addSystemLog(meta.roomCode, `Kỹ năng [Root]: ${target.name} rút 2 lá khi bị cướp trang bị.`);
            }
          } else {
            // hand card random steal
            if (target.cards.length === 0) return;
            const randIdx = Math.floor(Math.random() * target.cards.length);
            const stolen = target.cards.splice(randIdx, 1)[0];
            source.cards.push(stolen);
            addSystemLog(meta.roomCode, `🎯 ${source.name} đã tước đoạt thành công 1 lá bài ẩn trên tay của ${target.name}.`);
          }

          // Ivy: Sau khi lấy được bài từ người khác, rút thêm 1 lá
          if (source.isRevealed && source.hero === 'Ivy' && !source.isLocked) {
            drawCards(room, source, 1);
            addSystemLog(meta.roomCode, `Kỹ năng [Ivy]: ${source.name} rút thêm 1 lá sau khi cướp bài.`);
          }

          room.activeAction = null;
          broadcastToRoom(meta.roomCode);
          break;
        }

        case 'CLOSE_VIEW_RESULT': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (room && room.activeAction && room.activeAction.type === 'view_hand_result' && room.activeAction.sourcePlayerId === meta.playerId) {
            room.activeAction = null;
            broadcastToRoom(meta.roomCode);
          }
          break;
        }

        case 'END_TURN': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || room.status !== 'playing' || room.turnPlayerId !== meta.playerId) return;

          if (room.activeAction) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Hãy giải quyết hành động hiện tại trước khi kết thúc lượt.' }));
            return;
          }

          endTurn(room, meta.playerId);
          broadcastToRoom(meta.roomCode);
          break;
        }

        case 'DISCARD_CARDS': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room || room.status !== 'playing' || room.turnPlayerId !== meta.playerId || room.turnPhase !== 'discard') return;

          const { cardIds } = data.payload;
          const player = room.players.find(p => p.id === meta.playerId);
          if (!player) return;

          // Discard requested card list
          cardIds.forEach((cid: string) => {
            const idx = player.cards.findIndex(c => c.id === cid);
            if (idx !== -1) {
              const discarded = player.cards.splice(idx, 1)[0];
              room.discardPile.push(discarded);
            }
          });

          addSystemLog(meta.roomCode, `${player.name} đã bỏ đi ${cardIds.length} lá bài dư thừa.`);

          // Bark: Giới hạn cầm bài cuối lượt tăng thêm 2
          const barkBonus = player.isRevealed && player.hero === 'Bark' && !player.isLocked ? 2 : 0;
          const handLimit = player.hp + barkBonus;

          // Check again
          if (player.cards.length <= handLimit) {
            // Leaf: Sau khi bỏ bài ở cuối lượt, rút lại 1 lá bài
            if (player.isRevealed && player.hero === 'Leaf' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Leaf]: ${player.name} rút lại 1 lá sau khi bỏ bài.`);
            }
            startEndPhase(room, meta.playerId);
          }
          broadcastToRoom(meta.roomCode);
          break;
        }

        case 'SEND_CHAT': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room) return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (player) {
            const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
            const messageObj = {
              sender: player.name,
              avatar: player.avatar,
              color: player.color,
              text: data.payload.text,
              time: timestamp
            };
            broadcastToRoom(meta.roomCode);
            // Broadcast standard chat message to all connected clients in that room
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                const cm = wsMeta.get(client);
                if (cm && cm.roomCode === meta.roomCode) {
                  client.send(JSON.stringify({ type: 'CHAT_MESSAGE', message: messageObj }));
                }
              }
            });
          }
          break;
        }

        case 'RESTART_GAME': {
          const meta = wsMeta.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomCode];
          if (!room) return;

          const player = room.players.find(p => p.id === meta.playerId);
          if (!player || !player.isHost) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Chỉ chủ phòng mới được cài lại game.' }));
            return;
          }

          if (room.dyingTimer) {
            clearTimeout(room.dyingTimer);
          }

          room.status = 'lobby';
          room.winnerKingdom = null;
          room.activeAction = null;
          room.pendingActions = [];
          room.pendingDamages = [];
          room.pacts = [];
          room.trackers = [];
          room.deck = [];
          room.discardPile = [];
          room.turnPlayerId = null;
          room.turnPhase = null;

          room.players.forEach(p => {
            p.score = 0;
            p.isReady = p.isHost;
            p.hp = 4;
            p.maxHp = 4;
            p.isRevealed = false;
            p.isEliminated = false;
            p.cards = [];
            p.equipments = [];
            p.revealedTeammates = [];
            p.isLocked = false;
            p.strikePlayedThisTurn = 0;
            p.dodgesUsedThisTurn = 0;
            p.hasTacticalFirstPlayed = false;
          });

          addSystemLog(meta.roomCode, `Phòng đấu được đưa về Chờ bởi ${player.name}.`);
          broadcastToRoom(meta.roomCode);
          sendPublicRooms();
          break;
        }

        case 'LEAVE_ROOM': {
          handlePlayerLeave(ws, true);
          ws.send(JSON.stringify({ type: 'LEFT_SUCCESS' }));
          break;
        }

        default:
          console.warn('Unknown engine request:', data.type);
      }
    } catch (err) {
      console.error('Server Engine Error:', err);
    }
  });

  ws.on('close', () => {
    handlePlayerLeave(ws);
  });
});

const NON_DAMAGE_TACTICALS = new Set(['draw', 'exchange', 'lock', 'stun', 'freeze', 'whirlwind', 'bind', 'view', 'steal']);

// Extras for tactical-card hero skills
function handleTacticalPlayExtras(room: ServerRoom, player: ServerPlayer, cardType?: string) {
  // Spark skill: "Sau khi dùng thẻ Chiến thuật, rút 1 lá."
  if (player.isRevealed && player.hero === 'Spark' && !player.isLocked) {
    drawCards(room, player, 1);
    addSystemLog(room.code, `Kỹ năng [Spark]: ${player.name} rút 1 lá sau khi dùng thẻ Chiến thuật.`);
  }

  // Monsoon: Sau khi dùng Chiến thuật không gây sát thương, rút 1 lá (1 lần/lượt)
  if (cardType && NON_DAMAGE_TACTICALS.has(cardType) && player.isRevealed && player.hero === 'Monsoon' && !player.isLocked && !player.monsoonUsedThisTurn) {
    player.monsoonUsedThisTurn = true;
    drawCards(room, player, 1);
    addSystemLog(room.code, `Kỹ năng [Monsoon]: ${player.name} rút 1 lá sau khi dùng Chiến thuật không sát thương.`);
  }
}

// Configure client routes and start
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
