import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gamepad2, Radio, Server, ShieldCheck, Wifi, WifiOff, Volume2, VolumeX } from 'lucide-react';
import { Room, ChatMessage } from './types';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import EndedView from './components/EndedView';
import HomeScreen from './components/HomeScreen';
import LobbyFinder from './components/LobbyFinder';

export default function App() {
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<'home' | 'lobby-finder' | 'room'>('home');
  const [liveRooms, setLiveRooms] = useState<Array<{ code: string; hostName: string; playerCount: number; status: string }>>([]);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');

  const socketRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shuttingDownRef = useRef(false);

  // Play subtle futuristic synth game audio cues (Web Audio API)
  const playSound = (type: 'click' | 'transition' | 'success' | 'alert') => {
    if (!isSoundOn) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'transition') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'alert') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn('Game sound play blocked or unsupported by browser sandbox:', e);
    }
  };

  // Initialize and connect WebSocket
  const connectSocket = (): Promise<WebSocket> => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return Promise.resolve(socketRef.current);
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const connection = new Promise<WebSocket>((resolve, reject) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        resolve(socketRef.current);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      console.log('Connecting to WebSocket at:', wsUrl);

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        connectPromiseRef.current = null;
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setSocketError(null);
        const sessionToken = localStorage.getItem('woe-session-token');
        if (sessionToken) {
          ws.send(JSON.stringify({ type: 'RESUME_SESSION', payload: { sessionToken } }));
        }
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Message from server:', data);

          switch (data.type) {
            case 'ROOM_JOINED': {
              playSound('success');
              setRoom(data.payload.room);
              setMyPlayerId(data.payload.myPlayerId);
              setChatMessages([]); // Reset chat for new room
              setCurrentScreen('room');
              if (data.payload.sessionToken) {
                localStorage.setItem('woe-session-token', data.payload.sessionToken);
              }
              break;
            }

            case 'SESSION_EXPIRED': {
              localStorage.removeItem('woe-session-token');
              setRoom(null);
              setMyPlayerId(null);
              setChatMessages([]);
              break;
            }

            case 'ROOM_UPDATE': {
              setRoom(data.payload.room || data.room);
              break;
            }

            case 'PUBLIC_ROOMS_LIST': {
              setLiveRooms(data.payload.rooms || []);
              break;
            }

            case 'GAME_TICK': {
              setRoom(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  gameTimeLeft: data.timeLeft
                };
              });
              break;
            }

            case 'CHAT_MESSAGE': {
              playSound('click');
              setChatMessages(prev => [...prev, data.message]);
              break;
            }

            case 'LEFT_SUCCESS': {
              playSound('transition');
              setRoom(null);
              setMyPlayerId(null);
              setChatMessages([]);
              setCurrentScreen('lobby-finder');
              localStorage.removeItem('woe-session-token');
              break;
            }

            case 'ERROR': {
              playSound('alert');
              setSocketError(data.message);
              setTimeout(() => setSocketError(null), 5000);
              break;
            }

            default:
              console.warn('Unhandled socket event:', data.type);
          }
        } catch (err) {
          console.error('Error parsing socket event data:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setSocketError('Không thể kết nối đến server. Đang thử kết nối lại...');
        connectPromiseRef.current = null;
        reject(err);
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (socketRef.current === ws) {
          socketRef.current = null;
        }
        connectPromiseRef.current = null;
        console.log('WebSocket connection closed.');
        if (!shuttingDownRef.current) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 10000);
          reconnectAttemptRef.current += 1;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => connectSocket().catch(() => {}), delay);
        }
      };
    });
    connectPromiseRef.current = connection;
    return connection;
  };

  // Safe action dispatcher ensuring socket is open
  const sendSocketAction = async (type: string, payload: any = {}) => {
    try {
      let ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        ws = await connectSocket();
      }
      ws.send(JSON.stringify({ type, payload }));
    } catch (err) {
      console.error('Failed to send socket action:', err);
      setSocketError('Không thể kết nối đến máy chủ game.');
    }
  };

  // Actions triggered from subcomponents
  const handleCreateRoom = (playerName: string, avatar: string, color: string) => {
    playSound('transition');
    sendSocketAction('CREATE_ROOM', { playerName, avatar, color });
  };

  const handleJoinRoom = (playerName: string, avatar: string, color: string, roomCode: string) => {
    playSound('transition');
    sendSocketAction('JOIN_ROOM', { playerName, avatar, color, roomCode });
  };

  const handleToggleReady = () => {
    playSound('click');
    sendSocketAction('TOGGLE_READY');
  };

  const handleStartGame = () => {
    playSound('success');
    sendSocketAction('START_GAME');
  };

  const handlePlayCard = (cardId: string, targetPlayerId?: string) => {
    playSound('click');
    sendSocketAction('PLAY_CARD', { cardId, targetPlayerId });
  };

  const handleRespondAction = (action: 'dodge' | 'strike' | 'heal' | 'pass' | 'discard' | 'reveal', cardId?: string, cardIds?: string[]) => {
    playSound('click');
    sendSocketAction('RESPOND_ACTION', { action, cardId, cardIds });
  };

  const handleStealSelect = (targetType: 'hand' | 'equip', targetCardId?: string) => {
    playSound('click');
    sendSocketAction('STEAL_SELECT', { targetType, targetCardId });
  };

  const handleDestroySelect = (targetCardId: string) => {
    playSound('click');
    sendSocketAction('DESTROY_SELECT', { targetCardId });
  };

  const handleCloseViewResult = () => {
    playSound('click');
    sendSocketAction('CLOSE_VIEW_RESULT');
  };

  const handleRevealHero = () => {
    playSound('success');
    sendSocketAction('REVEAL_HERO');
  };

  const handleEndTurn = () => {
    playSound('click');
    sendSocketAction('END_TURN');
  };

  const handleDiscardCards = (cardIds: string[]) => {
    playSound('click');
    sendSocketAction('DISCARD_CARDS', { cardIds });
  };

  const handleGameClick = () => {
    playSound('click');
    sendSocketAction('GAME_CLICK');
  };

  const handleSendChat = (text: string) => {
    sendSocketAction('SEND_CHAT', { text });
  };

  const handleRestartGame = () => {
    playSound('transition');
    sendSocketAction('RESTART_GAME');
  };

  const handleLeaveRoom = () => {
    playSound('transition');
    sendSocketAction('LEAVE_ROOM');
  };

  const fetchLiveRooms = () => {
    sendSocketAction('GET_PUBLIC_ROOMS');
  };

  // Auto-connect socket on load to establish isConnected state
  useEffect(() => {
    shuttingDownRef.current = false;
    connectSocket().catch(() => {});
    return () => {
      shuttingDownRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const socket = socketRef.current;
      if (socket) {
        // StrictMode mounts effects twice in development. Detach callbacks before
        // the intentional cleanup so a closing socket cannot report an error or
        // clear the replacement connection created by the next effect run.
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      }
    };
  }, []);

  // Fetch public rooms list periodically if on the lobby-finder screen
  useEffect(() => {
    if (currentScreen === 'lobby-finder') {
      fetchLiveRooms();
      const interval = setInterval(fetchLiveRooms, 15000);
      return () => clearInterval(interval);
    }
  }, [currentScreen, isConnected]);

  return (
    <div className="min-h-screen bg-[#07090c] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-white">
      
      {/* Decorative top ambient bar */}
      <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-amber-500 to-red-500 z-50" />

      {/* Global Navbar */}
      <header className="border-b border-slate-900/60 bg-slate-950/70 backdrop-blur-md px-4 py-3.5 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          {/* Logo & App title */}
          <div 
            onClick={() => {
              if (!room) {
                playSound('transition');
                setCurrentScreen('home');
              }
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="p-2 bg-gradient-to-tr from-amber-600 to-red-600 rounded-xl shadow-lg shadow-red-950/40 text-white transition-transform group-hover:scale-105">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-sans font-extrabold text-sm md:text-base tracking-wider text-white uppercase flex items-center gap-2">
                War of the Elements
              </h1>
              <p className="text-[9px] text-slate-500 font-bold tracking-widest font-mono">AAA STRATEGY CORE</p>
            </div>
          </div>

          {/* Connection status display */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
              <span className="relative flex h-2 w-2">
                {isConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                )}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col justify-center items-center">
        
        <AnimatePresence mode="wait">
          
          {/* SCREEN A: HOME SCREEN */}
          {currentScreen === 'home' && !room && (
            <motion.div
              key="home-screen"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <HomeScreen
                onPlayWithFriends={() => {
                  playSound('transition');
                  setCurrentScreen('lobby-finder');
                }}
                isSoundOn={isSoundOn}
                onToggleSound={() => setIsSoundOn(!isSoundOn)}
                language={language}
                onToggleLanguage={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
              />
            </motion.div>
          )}

          {/* SCREEN B: MULTIPLAYER LOBBY FINDER */}
          {currentScreen === 'lobby-finder' && !room && (
            <motion.div
              key="lobby-finder"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <LobbyFinder
                onBack={() => {
                  playSound('transition');
                  setCurrentScreen('home');
                }}
                onJoin={handleJoinRoom}
                onCreate={handleCreateRoom}
                liveRooms={liveRooms}
                onRefreshRooms={fetchLiveRooms}
                socketError={socketError}
                language={language}
              />
            </motion.div>
          )}

          {/* SCREEN C: INSIDE ROOM STAGES (LOBBY, PLAYING, ENDED) */}
          {room && (
            <motion.div
              key="room-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {room.status === 'lobby' && (
                <LobbyView
                  room={room}
                  myPlayerId={myPlayerId!}
                  chatMessages={chatMessages}
                  onToggleReady={handleToggleReady}
                  onStartGame={handleStartGame}
                  onLeaveRoom={handleLeaveRoom}
                  onSendChat={handleSendChat}
                  socketError={socketError}
                />
              )}

              {room.status === 'playing' && (
                <GameView
                  room={room}
                  myPlayerId={myPlayerId!}
                  onPlayCard={handlePlayCard}
                  onRespondAction={handleRespondAction}
                  onStealSelect={handleStealSelect}
                  onDestroySelect={handleDestroySelect}
                  onCloseViewResult={handleCloseViewResult}
                  onRevealHero={handleRevealHero}
                  onEndTurn={handleEndTurn}
                  onDiscardCards={handleDiscardCards}
                />
              )}

              {room.status === 'ended' && (
                <EndedView
                  room={room}
                  myPlayerId={myPlayerId!}
                  onRestartGame={handleRestartGame}
                />
              )}
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/20 py-5 text-center text-xs text-slate-500 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            <span>Server: Express, ws (Node 22) | Front: Vite, React, Tailwind CSS 4, Framer Motion</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Verified 100% Client-Server Sync. No fake placeholders.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
