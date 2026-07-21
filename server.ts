import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Card, CardType, Player, Room, ActiveActionState } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3333;

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
  privateLogs: Record<string, string[]>;
  dyingTimer?: NodeJS.Timeout;
}

interface ServerPlayer extends Player {
  blazeFirstDmgActive?: boolean;
  hasTacticalFirstPlayed?: boolean;
}

// Global server state
const rooms: Record<string, ServerRoom> = {};
const wsMeta = new Map<WebSocket, { playerId: string; roomCode: string }>();
const roomTimers: Record<string, NodeJS.Timeout> = {};

// Card templates
interface CardTemplate {
  type: CardType;
  name: string;
  emoji: string;
  category: 'basic' | 'tactical' | 'equip' | 'teammate';
  description: string;
}

const CARD_TEMPLATES: CardTemplate[] = [
  { type: 'strike', name: 'Đánh', emoji: '⚔️', category: 'basic', description: 'Gây 1 sát thương lên đối thủ.' },
  { type: 'dodge', name: 'Đỡ', emoji: '🛡', category: 'basic', description: 'Chặn một lá Đánh.' },
  { type: 'heal', name: 'Hồi', emoji: '❤️', category: 'basic', description: 'Hồi 1 máu cho một người chơi.' },
  { type: 'fire', name: 'Lửa', emoji: '🔥', category: 'tactical', description: 'Tất cả người chơi khác phải dùng Đỡ, nếu không nhận 1 sát thương.' },
  { type: 'lightning', name: 'Sét', emoji: '⚡', category: 'tactical', description: 'Chọn một người chơi và gây 1 sát thương.' },
  { type: 'duel', name: 'Đấu', emoji: '⚔️', category: 'tactical', description: 'Hai người lần lượt dùng Đánh. Người không thể dùng nhận 1 sát thương.' },
  { type: 'draw', name: 'Rút', emoji: '🎁', category: 'tactical', description: 'Rút 2 lá bài.' },
  { type: 'exchange', name: 'Đổi', emoji: '🔄', category: 'tactical', description: 'Đổi ngẫu nhiên 1 lá bài trên tay với đối phương.' },
  { type: 'lock', name: 'Khóa', emoji: '🚫', category: 'tactical', description: 'Chọn một người chơi. Họ không được dùng kỹ năng đến hết lượt.' },
  { type: 'view', name: 'Xem', emoji: '👀', category: 'tactical', description: 'Xem ngẫu nhiên 1 lá bài trên tay của đối phương.' },
  { type: 'steal', name: 'Cướp', emoji: '🎯', category: 'tactical', description: 'Lấy 1 lá bài từ tay hoặc trang bị của đối phương.' },
  { type: 'sword', name: 'Kiếm', emoji: '🗡', category: 'equip', description: 'Trang bị: Tầm đánh +1.' },
  { type: 'shield', name: 'Khiên', emoji: '🛡', category: 'equip', description: 'Trang bị: Mỗi lượt, giảm 1 sát thương đầu tiên nhận vào.' },
  { type: 'boots', name: 'Giày', emoji: '👢', category: 'equip', description: 'Trang bị: Có thể Đỡ thêm một lần mỗi lượt.' },
  { type: 'ring', name: 'Nhẫn', emoji: '💍', category: 'equip', description: 'Trang bị: Lần đầu dùng thẻ Chiến thuật mỗi lượt, rút 1 lá.' },
  { type: 'connect', name: 'Kết Nối', emoji: '🤝', category: 'teammate', description: 'Chọn một người chơi. Nếu cùng phe, nhận ra nhau.' },
  { type: 'supply', name: 'Tiếp Tế', emoji: '🎁', category: 'teammate', description: 'Đối phương rút 2 lá. Nếu cùng phe, nhận ra nhau.' },
  { type: 'protect', name: 'Che Chở', emoji: '🛡', category: 'teammate', description: 'Gánh sát thương thay cho họ đến đầu lượt sau. Nếu cùng phe, nhận ra nhau.' },
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
      };
    })
  };
}

// Deck generator
function generateDeck() {
  const deck: Card[] = [];
  const distribution = {
    strike: 25,
    dodge: 18,
    heal: 12,
    fire: 5,
    lightning: 5,
    duel: 4,
    draw: 4,
    exchange: 3,
    lock: 3,
    view: 3,
    steal: 4,
    sword: 3,
    shield: 3,
    boots: 2,
    ring: 2,
    connect: 3,
    supply: 3,
    protect: 3,
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

  const heroPool: Record<'flame' | 'ocean' | 'forest' | 'storm', string[]> = {
    flame: ['Ember', 'Blaze', 'Pyro'],
    ocean: ['Aqua', 'Coral', 'Mist'],
    forest: ['Flora', 'Moss', 'Bloom'],
    storm: ['Bolt', 'Spark', 'Volt']
  };

  players.forEach((p, index) => {
    const kingdom = factions[index] || 'flame';
    p.kingdom = kingdom;

    const pool = heroPool[kingdom];
    const hero = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    p.hero = hero;

    let hp = 4;
    if (hero === 'Blaze' || hero === 'Coral' || hero === 'Moss') {
      hp = 5;
    } else if (hero === 'Spark') {
      hp = 3;
    }
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
  });
}

// Drawing cards helper
function drawCards(room: ServerRoom, player: ServerPlayer, count: number): Card[] {
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

  // Bloom skill trigger
  if (drawn.length > 0 && player.isRevealed && player.hero === 'Bloom' && !player.isLocked && room.turnPlayerId !== player.id) {
    const lowestHpTeammate = room.players
      .filter((p) => !p.isEliminated && p.kingdom === player.kingdom)
      .sort((a, b) => a.hp - b.hp)[0] || player;

    if (room.deck.length > 0) {
      const bCard = room.deck.pop();
      if (bCard) {
        lowestHpTeammate.cards.push(bCard);
        addSystemLog(room.code, `Kích hoạt [Bloom]: ${lowestHpTeammate.name} nhận thêm 1 lá tiếp tế.`);
      }
    }
  }

  return drawn;
}

// Deal damage core logic
function dealDamage(room: ServerRoom, targetId: string, amount: number, sourceId: string) {
  const target = room.players.find(p => p.id === targetId);
  if (!target || target.isEliminated) return;

  // 1. Protection Check (Che Chở)
  if (target.protectedByPlayerId) {
    const protector = room.players.find(p => p.id === target.protectedByPlayerId && !p.isEliminated);
    if (protector) {
      addSystemLog(room.code, `${protector.name} xả thân gánh chịu ${amount} sát thương thay cho ${target.name} (Che Chở)!`);
      dealDamage(room, protector.id, amount, sourceId);
      return;
    }
  }

  // 2. Shield (Khiên) armor check
  const hasShield = target.equipments.some(e => e.type === 'shield');
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

  target.hp -= amount;
  addSystemLog(room.code, `💥 ${target.name} nhận ${amount} sát thương!`);

  // 4. Coral skill draw
  if (target.isRevealed && target.hero === 'Coral' && !target.isLocked) {
    drawCards(room, target, 1);
    addSystemLog(room.code, `Kỹ năng [Coral]: ${target.name} rút 1 lá sau khi nhận sát thương.`);
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

  // Pyro skill trigger
  const killer = room.players.find(pl => pl.id === killerId);
  if (killer && killer.isRevealed && killer.hero === 'Pyro' && !killer.isLocked && !killer.isEliminated) {
    killer.hp = Math.min(killer.maxHp, killer.hp + 1);
    drawCards(room, killer, 2);
    addSystemLog(room.code, `Kỹ năng [Pyro]: Sát thủ ${killer.name} hồi 1 HP và rút 2 lá khi kết liễu kẻ thù.`);
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
  room.turnPhase = 'draw';

  const p = room.players.find(pl => pl.id === playerId);
  if (!p) return;

  room.players.forEach((player) => {
    player.shieldFirstBlockActive = true;
    player.blazeFirstDmgActive = true;
    player.dodgesUsedThisTurn = 0;
    player.isLocked = false;
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

  // Mist skill trigger
  if (p.isRevealed && p.hero === 'Mist' && !p.isLocked && p.hp < p.maxHp) {
    p.hp += 1;
    addSystemLog(room.code, `Kỹ năng [Mist]: ${p.name} hồi phục 1 HP khi bắt đầu lượt.`);
  }

  // Flora skill trigger
  let drawCount = 2;
  if (p.isRevealed && p.hero === 'Flora' && !p.isLocked) {
    drawCount = 3;
    addSystemLog(room.code, `Kỹ năng [Flora]: ${p.name} rút 3 lá bài.`);
  }

  drawCards(room, p, drawCount);
  room.turnPhase = 'action';
}

function advanceTurn(room: ServerRoom) {
  room.activeAction = null;
  room.pendingActions = [];
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

  const cardsCount = p.cards.length;
  if (cardsCount > p.hp) {
    room.turnPhase = 'discard';
    addSystemLog(room.code, `${p.name} cần bỏ bớt ${cardsCount - p.hp} lá bài để kết thúc lượt.`);
  } else {
    advanceTurn(room);
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
  room.activeAction = room.pendingActions.pop() || null;
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
) {
  const nextAction = getNextAction(room, completedAction);
  dealDamage(room, targetId, amount, sourceId);

  if (room.activeAction?.type === 'waiting_for_dying_heal') {
    if (nextAction) room.pendingActions.push(nextAction);
  } else if (nextAction) {
    room.activeAction = nextAction;
  } else {
    resumePendingAction(room);
  }
}

// Clean up player leave
function handlePlayerLeave(ws: WebSocket) {
  const meta = wsMeta.get(ws);
  if (!meta) return;

  const { playerId, roomCode } = meta;
  wsMeta.delete(ws);

  const room = rooms[roomCode];
  if (!room) return;

  const leavingPlayer = room.players.find(p => p.id === playerId);
  const leavingPlayerName = leavingPlayer ? leavingPlayer.name : 'Người chơi';

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
    if (room.status === 'playing') {
      // If leaving player was playing, mark them eliminated and verify victory
      if (leavingPlayer) {
        leavingPlayer.isEliminated = true;
      }
      checkVictoryConditions(room);
    }
    broadcastToRoom(roomCode);
  }
}

// WebSocket connection
wss.on('connection', (ws) => {
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
            privateLogs: { [newPlayer.id]: [] },
            winnerKingdom: null,
            deck: [],
            discardPile: []
          };

          wsMeta.set(ws, { playerId: newPlayer.id, roomCode });
          addSystemLog(roomCode, `${newPlayer.name} đã lập phòng ${roomCode}.`);

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            payload: {
              room: getSanitizedRoom(rooms[roomCode], newPlayer.id),
              myPlayerId: newPlayer.id
            }
          }));
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
          room.privateLogs[newPlayer.id] = [];
          wsMeta.set(ws, { playerId: newPlayer.id, roomCode: cleanCode });

          addSystemLog(cleanCode, `${newPlayer.name} đã gia nhập.`);

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            payload: {
              room: getSanitizedRoom(room, newPlayer.id),
              myPlayerId: newPlayer.id
            }
          }));

          broadcastToRoom(cleanCode);
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
            player.isRevealed = true;
            addSystemLog(meta.roomCode, `📢 ${player.name} đã LẬT NHÂN VẬT! [${player.kingdom?.toUpperCase()}] - Anh hùng: [${player.hero}]. HP: ${player.hp}/${player.maxHp}`);

            // Draw 1 card immediately upon reveal
            drawCards(room, player, 1);
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

          // Card type usage validation
          if (card.type === 'strike') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Vui lòng chọn mục tiêu hợp lệ để Đánh.' }));
              return;
            }

            // Check Strike Limit (Default 1 Strike per turn, except skills like Volt response)
            if (player.strikePlayedThisTurn >= 1) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Bạn đã đạt giới hạn dùng lá Đánh lượt này (1 lá).' }));
              return;
            }

            // Check Bolt skill for range check:
            // "Lá Đánh đầu tiên mỗi lượt không giới hạn tầm."
            const isFirstStrike = player.strikePlayedThisTurn === 0;
            const hasInfiniteRange = player.isRevealed && player.hero === 'Bolt' && !player.isLocked && isFirstStrike;

            if (!hasInfiniteRange) {
              // Standard range calculation: default range = 1, Sword equip adds 1
              const hasSword = player.equipments.some(e => e.type === 'sword');
              const maxRange = hasSword ? 2 : 1;

              // Simple range check by player array distance
              const playerIdx = room.players.findIndex(p => p.id === player.id);
              const targetIdx = room.players.findIndex(p => p.id === target.id);
              const distance = Math.min(
                Math.abs(playerIdx - targetIdx),
                room.players.length - Math.abs(playerIdx - targetIdx)
              );

              if (distance > maxRange) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Đối phương ngoài tầm đánh của bạn. Trang bị Kiếm để tăng tầm!' }));
                return;
              }
            }

            // Remove card from hand
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);
            player.strikePlayedThisTurn += 1;

            addSystemLog(meta.roomCode, `⚔️ ${player.name} dùng ĐÁNH nhắm vào ${target.name}.`);

            // Check Ember skill: "Sau khi dùng Đánh, rút 1 lá."
            if (player.isRevealed && player.hero === 'Ember' && !player.isLocked) {
              drawCards(room, player, 1);
              addSystemLog(meta.roomCode, `Kỹ năng [Ember]: ${player.name} rút 1 lá sau khi Đánh.`);
            }

            // Set waiting for dodge action state
            room.activeAction = {
              id: `act_${Math.random().toString(36).substring(2, 9)}`,
              type: 'waiting_for_dodge',
              card,
              sourcePlayerId: player.id,
              targetPlayerId: target.id,
              pendingDamage: 1
            };
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

            // Track Spark skill & Ring
            handleTacticalPlayExtras(room, player);

            // Get targets sequentially (all other living players)
            const otherLiving = room.players.filter(p => !p.isEliminated && p.id !== player.id);
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
            handleTacticalPlayExtras(room, player);

            // Deal 1 damage directly (cannot be standard-dodged unless special shield blocks it)
            dealDamage(room, target.id, 1, player.id);
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
            handleTacticalPlayExtras(room, player);

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

          else if (card.type === 'draw') {
            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🎁 ${player.name} dùng RÚT bài.`);
            drawCards(room, player, 2);
            handleTacticalPlayExtras(room, player);
          }

          else if (card.type === 'exchange') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để trao Đổi bài.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🔄 ${player.name} dùng ĐỔI bài với ${target.name}.`);
            handleTacticalPlayExtras(room, player);

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

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `🚫 ${player.name} dùng KHÓA pháp ấn lên ${target.name}.`);
            handleTacticalPlayExtras(room, player);

            target.isLocked = true;
          }

          else if (card.type === 'view') {
            if (!target || target.isEliminated || target.id === player.id) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Chọn mục tiêu để Xem tay.' }));
              return;
            }

            player.cards.splice(cardIndex, 1);
            room.discardPile.push(card);

            addSystemLog(meta.roomCode, `👀 ${player.name} lén lút XEM trộm bài của ${target.name}.`);
            handleTacticalPlayExtras(room, player);

            if (target.cards.length > 0) {
              const randCard = target.cards[Math.floor(Math.random() * target.cards.length)];
              room.activeAction = {
                id: `view_${Math.random().toString(36).substring(2, 9)}`,
                type: 'view_hand_result',
                card,
                sourcePlayerId: player.id,
                targetPlayerId: target.id,
                pendingDamage: 0,
                viewedCard: randCard
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
            handleTacticalPlayExtras(room, player);

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
            // Equip weapon/armor/boots/ring
            player.cards.splice(cardIndex, 1);

            // Replace existing equipment of same category
            const existingIdx = player.equipments.findIndex(e => e.type === card.type);
            if (existingIdx !== -1) {
              room.discardPile.push(player.equipments[existingIdx]);
              player.equipments.splice(existingIdx, 1);
            }

            player.equipments.push(card);
            addSystemLog(meta.roomCode, `🛡️ ${player.name} trang bị thành công [${card.name}].`);
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

            if (isSameFaction) {
              if (!player.revealedTeammates.includes(target.id)) {
                player.revealedTeammates.push(target.id);
              }
              if (!target.revealedTeammates.includes(player.id)) {
                target.revealedTeammates.push(player.id);
              }
              addPrivateLog(room, [player.id, target.id], `✨ ${player.name} và ${target.name} đã nhận ra nhau là đồng đội cùng phe!`);
            } else {
              addPrivateLog(room, [player.id, target.id], `Không có phản ứng đồng đội: ${player.name} và ${target.name} thuộc các phe khác nhau.`);
            }

            if (card.type === 'supply') {
              drawCards(room, target, 2);
              addSystemLog(meta.roomCode, `🎁 ${target.name} nhận được Tiếp Tế 2 lá bài từ ${player.name}.`);
            } else if (card.type === 'protect') {
              target.protectedByPlayerId = player.id;
              player.protectingPlayerId = target.id;
              addSystemLog(meta.roomCode, `🛡️ ${player.name} sẽ Che Chở, gánh chịu toàn bộ sát thương thay ${target.name} cho tới đầu lượt sau.`);
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

          const { action, cardId } = data.payload;

          if (room.activeAction.type === 'waiting_for_dodge') {
            if (player.id !== room.activeAction.targetPlayerId) return;
            const completedAction = room.activeAction;

            if (action === 'dodge') {
              const cardIdx = player.cards.findIndex(c => c.id === cardId && c.type === 'dodge');
              if (cardIdx === -1) return;

              const hasBoots = player.equipments.some(equipment => equipment.type === 'boots');
              const dodgeLimit = hasBoots ? 2 : 1;
              if (player.dodgesUsedThisTurn >= dodgeLimit) {
                ws.send(JSON.stringify({ type: 'ERROR', message: `Bạn chỉ có thể dùng Đỡ ${dodgeLimit} lần trong lượt này.` }));
                return;
              }

              const dodgeCard = player.cards[cardIdx];
              player.cards.splice(cardIdx, 1);
              room.discardPile.push(dodgeCard);
              player.dodgesUsedThisTurn += 1;

              addSystemLog(meta.roomCode, `🛡️ ${player.name} dùng ĐỠ né tránh đòn tấn công thành công.`);

              // Volt skill trigger: "Sau khi dùng Đỡ thành công, có thể dùng ngay 1 lá Đánh."
              const attacker = room.players.find(a => a.id === completedAction.sourcePlayerId && !a.isEliminated);
              const canVoltStrike = player.isRevealed && player.hero === 'Volt' && !player.isLocked &&
                attacker && player.cards.some(card => card.type === 'strike');
              if (canVoltStrike && attacker) {
                const nextAction = getNextAction(room, completedAction);
                if (nextAction) room.pendingActions.push(nextAction);
                room.activeAction = {
                  id: `volt_${Math.random().toString(36).substring(2, 9)}`,
                  type: 'waiting_for_volt_strike',
                  card: dodgeCard,
                  sourcePlayerId: player.id,
                  targetPlayerId: attacker.id,
                  pendingDamage: 0,
                };
                addSystemLog(meta.roomCode, `⚡ Kỹ năng [Volt]: ${player.name} có thể dùng ngay 1 lá Đánh phản công ${attacker.name}.`);
              } else {
                finishResolvedAction(room, completedAction);
              }
            } else {
              // Failed or decided to take damage
              addSystemLog(meta.roomCode, `💔 ${player.name} không thể Đỡ đòn tấn công.`);
              dealActionDamage(room, completedAction, player.id, completedAction.pendingDamage, completedAction.sourcePlayerId);
            }
          }

          else if (room.activeAction.type === 'waiting_for_duel_strike') {
            const expectedPlayerId = room.activeAction.duelTurnPlayerId;
            if (player.id !== expectedPlayerId) return;

            if (action === 'strike') {
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

                resumePendingAction(room);
              }
            }
          }

          broadcastToRoom(meta.roomCode);
          checkVictoryConditions(room);
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
          } else {
            // hand card random steal
            if (target.cards.length === 0) return;
            const randIdx = Math.floor(Math.random() * target.cards.length);
            const stolen = target.cards.splice(randIdx, 1)[0];
            source.cards.push(stolen);
            addSystemLog(meta.roomCode, `🎯 ${source.name} đã tước đoạt thành công 1 lá bài ẩn trên tay của ${target.name}.`);
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

          // Check again
          if (player.cards.length <= player.hp) {
            advanceTurn(room);
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
          break;
        }

        case 'LEAVE_ROOM': {
          handlePlayerLeave(ws);
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

// Extras for Spark skill & Ring
function handleTacticalPlayExtras(room: ServerRoom, player: ServerPlayer) {
  // Spark skill: "Sau khi dùng thẻ Chiến thuật, rút 1 lá."
  if (player.isRevealed && player.hero === 'Spark' && !player.isLocked) {
    drawCards(room, player, 1);
    addSystemLog(room.code, `Kỹ năng [Spark]: ${player.name} rút 1 lá sau khi dùng thẻ Chiến thuật.`);
  }

  // Ring equipment check: "Lần đầu dùng thẻ Chiến thuật mỗi lượt, rút 1 lá."
  const hasRing = player.equipments.some(e => e.type === 'ring');
  if (hasRing) {
    if (player.hasTacticalFirstPlayed === undefined) player.hasTacticalFirstPlayed = false;
    if (!player.hasTacticalFirstPlayed) {
      player.hasTacticalFirstPlayed = true;
      drawCards(room, player, 1);
      addSystemLog(room.code, `[Nhẫn] của ${player.name} được kích hoạt: Rút 1 lá.`);
    }
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
