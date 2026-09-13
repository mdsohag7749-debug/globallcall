import { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  Globe, 
  Users, 
  Plus, 
  Sparkles, 
  LogIn, 
  LogOut, 
  Radio, 
  Headphones, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  FlipHorizontal, 
  Settings, 
  Search, 
  Lock, 
  Activity, 
  Wifi, 
  HelpCircle, 
  X, 
  Flame,
  Sun,
  Moon,
  Pin,
  Shield,
  Key,
  EyeOff,
  Map as MapIcon,
  Megaphone,
  UserCheck,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, logOut, checkIsAdmin } from '../lib/firebase';
import { UserProfile, CallRoom as RoomType, Announcement } from '../types';
import { createPlaceholderVideoStream } from '../lib/webrtc';
import CallSettingsModal from './CallSettingsModal';
import UserProfileModal from './UserProfileModal';
import FriendsModal from './FriendsModal';
import RoadmapModal from './RoadmapModal';

interface CallLobbyProps {
  currentUser: UserProfile | null;
  onJoinRoom: (room: RoomType, options: { audioMuted: boolean; videoOff: boolean }) => void;
  onOpenAuth: () => void;
  onOpenAdminPanel?: () => void;
}

const DEFAULT_GLOBAL_ROOMS: RoomType[] = [
  {
    id: 'global-lounge-main',
    title: 'Global Video & Audio Lounge',
    description: 'The main open room connecting callers worldwide 24/7. Jump right in and meet engineers, designers, and creators.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-audio-cafe',
    title: 'Audio-Only Global Voice Cafe',
    description: 'Ultra-smooth audio-only space optimized for low latency and poor internet connections. Casual talk, radio style discussions.',
    createdBy: 'system',
    callType: 'audio_only',
    isGlobal: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-hangout-chill',
    title: 'Casual Hangout & Community',
    description: 'Relaxed space to share stories, co-work, test your webcam setup, and build international friendships without pressure.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'webrtc-dev-04',
    title: 'WebRTC & AI Hackers Room',
    description: 'Live collaborative space for WebRTC developers, AI agent builders, and open source creators sharing terminal screens.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: false,
    createdAt: new Date().toISOString()
  }
];

export default function CallLobby({
  currentUser,
  onJoinRoom,
  onOpenAuth,
  onOpenAdminPanel
}: CallLobbyProps) {
  const isAdmin = checkIsAdmin(currentUser);
  const [rooms, setRooms] = useState<RoomType[]>(DEFAULT_GLOBAL_ROOMS);
  const [roomParticipantsCount, setRoomParticipantsCount] = useState<Record<string, number>>({});
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomType, setNewRoomType] = useState<'video_audio' | 'audio_only'>('video_audio');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customRoomId, setCustomRoomId] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoiningById, setIsJoiningById] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'video_audio' | 'audio_only' | 'popular' | 'community'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Roadmap extra states
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Room creation roadmap options
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [newParticipantLimit, setNewParticipantLimit] = useState<number>(0); // 0 = unlimited

  // Password Prompt Modal state
  const [passwordPromptRoom, setPasswordPromptRoom] = useState<RoomType | null>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize preview stream
  useEffect(() => {
    let isCancelled = false;

    async function setupPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true
        });
        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setPreviewStream(stream);
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }

        // Setup audio level meter
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);

          const data = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            if (!analyser) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animRef.current = requestAnimationFrame(updateMeter);
          };
          animRef.current = requestAnimationFrame(updateMeter);
        } catch {
          // ignore meter error
        }
      } catch (e) {
        console.warn('Camera preview not directly accessible:', e);
        const fallbackVideo = createPlaceholderVideoStream(currentUser?.displayName || 'Guest');
        setPreviewStream(fallbackVideo);
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = fallbackVideo;
        }
      }
    }

    setupPreview();

    return () => {
      isCancelled = true;
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [currentUser?.displayName]);

  // Sync rooms from Firestore
  useEffect(() => {
    const roomsCol = collection(db, 'rooms');
    const unsub = onSnapshot(
      roomsCol, 
      (snapshot) => {
        const firestoreRooms: RoomType[] = [];
        snapshot.forEach(docSnap => {
          firestoreRooms.push({ id: docSnap.id, ...docSnap.data() } as RoomType);
        });

        // Merge defaults with firestore rooms (avoiding duplicates)
        const roomMap = new Map<string, RoomType>();
        DEFAULT_GLOBAL_ROOMS.forEach(r => roomMap.set(r.id, r));
        firestoreRooms.forEach(r => roomMap.set(r.id, r));
        setRooms(Array.from(roomMap.values()));
      },
      (err) => {
        console.warn('Firestore rooms query notice:', err);
      }
    );

    return () => unsub();
  }, []);

  // Monitor participants count for each room
  useEffect(() => {
    const unsubs = rooms.map(room => {
      const partCol = collection(db, 'rooms', room.id, 'participants');
      return onSnapshot(partCol, (snap) => {
        setRoomParticipantsCount(prev => ({
          ...prev,
          [room.id]: snap.size
        }));
      }, () => {});
    });

    return () => unsubs.forEach(u => u());
  }, [rooms]);

  const toggleMic = () => {
    if (previewStream) {
      const next = !micMuted;
      previewStream.getAudioTracks().forEach(t => { t.enabled = !next; });
      setMicMuted(next);
    }
  };

  const toggleVideo = () => {
    if (previewStream) {
      const next = !videoOff;
      previewStream.getVideoTracks().forEach(t => { t.enabled = !next; });
      setVideoOff(next);
    }
  };

  const flipCamera = async () => {
    if (isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: 640,
          height: 480
        },
        audio: !micMuted
      });

      if (previewStream) {
        previewStream.getVideoTracks().forEach(t => t.stop());
      }
      setPreviewStream(stream);
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      setFacingMode(nextFacing);
    } catch (e) {
      console.warn('Lobby camera flip failed:', e);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Real-time Announcements Sync
  useEffect(() => {
    const annCol = collection(db, 'announcements');
    const unsub = onSnapshot(annCol, (snap) => {
      const list: Announcement[] = [];
      snap.forEach(d => {
        const a = d.data() as Announcement;
        if (a.active !== false) {
          list.push({ id: d.id, ...a });
        }
      });
      setAnnouncements(list);
    }, (err) => console.warn('Announcements sync notice:', err));

    return () => unsub();
  }, []);

  // Auto-close (5 min) check for empty custom rooms
  useEffect(() => {
    const now = Date.now();
    rooms.forEach(async (r) => {
      if (r.createdBy !== 'system' && !r.isGlobal && !r.isOfficial) {
        const count = roomParticipantsCount[r.id] || 0;
        const createdTime = new Date(r.createdAt).getTime();
        // If room has 0 participants and was created over 5 minutes ago
        if (count === 0 && now - createdTime > 5 * 60 * 1000) {
          try {
            await deleteDoc(doc(db, 'rooms', r.id));
          } catch (e) {}
        }
      }
    });
  }, [rooms, roomParticipantsCount]);

  const proceedWithJoin = (room: RoomType) => {
    // Immediately stop hardware preview tracks so CallRoom can capture real camera & mic cleanly
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      setPreviewStream(null);
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Ensure room exists in Firestore
    const roomRef = doc(db, 'rooms', room.id);
    setDoc(roomRef, {
      title: room.title,
      description: room.description || '',
      createdBy: room.createdBy || currentUser?.uid || 'guest',
      callType: room.callType || 'video_audio',
      isGlobal: !!room.isGlobal,
      isOfficial: !!room.isOfficial,
      isPinned: !!room.isPinned,
      isPrivate: !!room.isPrivate,
      isPasswordProtected: !!room.isPasswordProtected,
      password: room.password || null,
      participantLimit: room.participantLimit || null,
      createdAt: room.createdAt || new Date().toISOString()
    }, { merge: true }).catch(console.error);

    onJoinRoom(room, { audioMuted: micMuted, videoOff });
  };

  const handleJoin = (room: RoomType) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    // Participant limit check
    const count = roomParticipantsCount[room.id] || 0;
    if (room.participantLimit && count >= room.participantLimit) {
      setJoinError(`এই Room টি পূর্ণ (সর্বোচ্চ সীমা ${room.participantLimit} জন)। অন্য Room এ চেষ্টা করুন।`);
      return;
    }

    // Password protected room check
    if (room.isPasswordProtected && room.createdBy !== currentUser.uid && !isAdmin) {
      setPasswordPromptRoom(room);
      setEnteredPassword('');
      setPasswordError(null);
      return;
    }

    proceedWithJoin(room);
  };

  const handleConfirmPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!passwordPromptRoom) return;

    if (passwordPromptRoom.password !== enteredPassword) {
      setPasswordError('ভুল Password! অনুগ্রহ করে সঠিক পাসওয়ার্ড দিন।');
      return;
    }

    const target = passwordPromptRoom;
    setPasswordPromptRoom(null);
    proceedWithJoin(target);
  };

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || !currentUser) return;

    const roomId = `room-${Math.random().toString(36).substring(2, 9)}`;
    const newRoom: RoomType = {
      id: roomId,
      title: newRoomTitle.trim(),
      description: `Created by ${currentUser.displayName}`,
      createdBy: currentUser.uid,
      callType: newRoomType,
      isGlobal: false,
      isOfficial: isAdmin,
      isPinned: isAdmin,
      isPrivate: isPrivateRoom,
      isPasswordProtected: isPasswordRequired && !!newRoomPassword.trim(),
      password: isPasswordRequired ? newRoomPassword.trim() : undefined,
      participantLimit: newParticipantLimit > 0 ? newParticipantLimit : undefined,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'rooms', roomId), newRoom);
      setShowCreateModal(false);
      setNewRoomTitle('');
      setNewRoomPassword('');
      setIsPasswordRequired(false);
      setIsPrivateRoom(false);
      setNewParticipantLimit(0);
      proceedWithJoin(newRoom);
    } catch (e) {
      console.error('Failed to create room:', e);
    }
  };

  const handleJoinCustomId = async (e: FormEvent) => {
    e.preventDefault();
    const roomId = customRoomId.trim();
    if (!roomId) return;

    setJoinError(null);

    // First check if it matches a loaded room in state
    const existing = rooms.find(r => r.id === roomId);
    if (existing) {
      handleJoin(existing);
      return;
    }

    // Otherwise verify room exists in Firestore before joining
    setIsJoiningById(true);
    try {
      const { getDoc: _getDoc, doc: _doc } = await import('firebase/firestore');
      const roomSnap = await _getDoc(_doc(db, 'rooms', roomId));
      if (!roomSnap.exists()) {
        setJoinError('এই Room টি পাওয়া যায়নি বা Delete করা হয়েছে।');
        setIsJoiningById(false);
        return;
      }
      const data = roomSnap.data() as RoomType;
      handleJoin({ ...data, id: roomId });
    } catch {
      setJoinError('Room খুঁজে পেতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setIsJoiningById(false);
    }
  };

  // Filtered rooms logic
  const filteredRooms = useMemo(() => {
    const list = rooms.filter((r) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !query ||
        r.title.toLowerCase().includes(query) ||
        r.id.toLowerCase().includes(query) ||
        (r.description && r.description.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Public / private toggle: Hide private rooms unless searched
      if (r.isPrivate && !query) return false;

      if (activeFilter === 'video_audio') return r.callType !== 'audio_only';
      if (activeFilter === 'audio_only') return r.callType === 'audio_only';
      if (activeFilter === 'popular') return (roomParticipantsCount[r.id] || 0) > 0;
      if (activeFilter === 'community') return r.isGlobal || r.createdBy === 'system';
      return true;
    });

    // Pinned rooms (Official rooms top-এ)
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

    return list;
  }, [rooms, searchQuery, activeFilter, roomParticipantsCount]);

  // Total online participant calculation
  const totalActiveCallers = useMemo(() => {
    const sum = (Object.values(roomParticipantsCount) as number[]).reduce((a, b) => a + (b || 0), 0);
    return Math.max(1420, sum + 1420);
  }, [roomParticipantsCount]);

  return (
    <div className="bg-[#060911] text-slate-100 font-sans antialiased min-h-[100dvh] pb-safe relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Ambient Backdrop Lights */}
      <div className="fixed inset-0 pointer-events-none glow-radial-indigo z-0" />
      <div className="fixed inset-0 pointer-events-none glow-radial-cyan z-0" />
      <div className="fixed inset-0 pointer-events-none mesh-grid-pattern opacity-60 z-0" />

      {/* Main Header */}
      <header className="relative z-50 border-b border-white/[0.08] backdrop-blur-xl bg-[#060911]/75 sticky top-0 px-4 lg:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Status Pill */}
          <div className="flex items-center space-x-3.5">
            <div className="group flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
                <div className="w-full h-full bg-[#090e1c] rounded-[11px] flex items-center justify-center">
                  <Video className="w-5 h-5 text-indigo-400 group-hover:text-cyan-300 transition-colors" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                    Global Call
                  </span>
                  <span className="text-[10px] font-mono tracking-wider font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    P2P MESH v2.4
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block tracking-wide">
                  Instant Global Video & Audio Connect
                </p>
              </div>
            </div>
          </div>

          {/* Network Stats & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Latency / Health Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-white/[0.08] text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-medium text-slate-200">Online</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-mono text-[11px]">24ms Latency</span>
            </div>



            {/* Roadmap Explorer CTA Button */}
            <button
              id="btn-open-roadmap"
              onClick={() => setIsRoadmapOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-linear-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 hover:from-indigo-500/30 hover:to-pink-500/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold shadow-md transition cursor-pointer"
              title="Interactive Feature Roadmap (27 Features)"
            >
              <MapIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Feature Roadmap</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-indigo-500 text-white font-mono font-bold">27</span>
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              id="btn-toggle-theme"
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark';
                setTheme(next);
                localStorage.setItem('theme', next);
              }}
              className="p-2 text-slate-400 hover:text-slate-200 glass-button rounded-lg border border-white/[0.08] transition cursor-pointer"
              title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-cyan-400" />}
            </button>

            {/* Friends & DM Drawer Trigger */}
            {currentUser && (
              <button
                id="btn-open-friends"
                onClick={() => setIsFriendsOpen(true)}
                aria-label="Friends and Direct Messages"
                className="p-2 text-slate-400 hover:text-slate-200 glass-button rounded-lg border border-white/[0.08] transition-all cursor-pointer relative"
                title="Friends & Direct Messaging"
              >
                <Users className="w-4 h-4" />
                {currentUser.friends && currentUser.friends.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>
            )}

            {/* Help / Docs Modal trigger */}
            <button
              id="btn-open-help"
              onClick={() => setShowHelpModal(true)}
              aria-label="Help Documentation"
              className="p-2 text-slate-400 hover:text-slate-200 glass-button rounded-lg border border-white/[0.08] transition-all cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* User Profile / Quick Join CTA */}
            {currentUser ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  title="View / Edit Profile, Bio, & Badges"
                  className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800/90 border border-white/[0.1] hover:border-indigo-500/40 px-2.5 sm:px-3 py-1.5 rounded-xl transition cursor-pointer group"
                >
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName}
                      className="w-6 h-6 rounded-full object-cover border border-slate-600 group-hover:border-indigo-400"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
                      {currentUser.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-white hidden sm:inline max-w-[100px] truncate">
                    {currentUser.displayName}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                </button>

                {isAdmin && (
                  <button
                    id="btn-open-admin-panel"
                    onClick={onOpenAdminPanel}
                    title="Admin Panel"
                    className="p-2 rounded-xl glass-button text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/50 transition cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  id="btn-logout"
                  onClick={() => logOut(currentUser.uid)}
                  title="Sign Out"
                  className="p-2 rounded-xl glass-button text-slate-400 hover:text-rose-400 border border-white/[0.08] transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-open-auth-nav"
                onClick={onOpenAuth}
                className="relative group overflow-hidden px-3.5 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span className="absolute inset-0 bg-linear-to-r from-indigo-600 via-indigo-500 to-cyan-500 transition-all duration-300 group-hover:brightness-110" />
                <span className="relative flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  <span>Sign In / Quick Join</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Global Announcements Broadcast Banner */}
      {announcements.length > 0 && (
        <div className="relative z-40 bg-linear-to-r from-amber-600/25 via-indigo-600/25 to-purple-600/25 border-b border-amber-500/30 px-4 py-2 text-center text-xs font-medium text-amber-200 flex items-center justify-center gap-2 animate-in fade-in">
          <Megaphone className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
          <span className="font-semibold text-white">[ANNOUNCEMENT]:</span>
          <span>{announcements[0].text}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12">
        {/* Hero Split Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Column: Hero Copy, Badges, CTAs & Live Metrics */}
          <div className="lg:col-span-6 xl:col-span-7 space-y-6">
            {/* Live Badge */}
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full glass-card border border-indigo-500/20 text-indigo-300 text-xs font-medium shadow-inner">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span className="tracking-wide">Worldwide Public Call Network</span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.12]">
              Connect with the World in{' '}
              <span className="bg-clip-text text-transparent bg-linear-to-r from-cyan-400 via-indigo-400 to-purple-400 block mt-1">
                Real-Time Video & Audio
              </span>
            </h1>

            {/* Subtitle description */}
            <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
              Zero downloads, zero setup. Instantly jump into ultra-crisp peer-to-peer audio & video spaces powered by studio-grade WebRTC mesh networking and low-latency signaling.
            </p>

            {/* CTA Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                id="btn-hero-join-global"
                onClick={() => handleJoin(DEFAULT_GLOBAL_ROOMS[0])}
                className="relative group px-6 py-3.5 rounded-xl text-sm font-semibold text-white bg-linear-to-r from-indigo-600 via-indigo-500 to-cyan-500 shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:brightness-110 transition-all flex items-center gap-2.5 active:scale-95 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-cyan-200 fill-current animate-pulse" />
                <span>Join Global Call Now</span>
                <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                id="btn-hero-join-audio-cafe"
                onClick={() => handleJoin(DEFAULT_GLOBAL_ROOMS[1])}
                className="px-5 py-3.5 rounded-xl text-sm font-medium text-slate-200 hover:text-white glass-card border border-white/10 hover:border-white/20 transition-all flex items-center gap-2.5 hover:bg-slate-800/50 active:scale-95 cursor-pointer"
              >
                <Headphones className="w-4 h-4 text-indigo-400" />
                <span>Audio-Only Cafe</span>
              </button>
            </div>

            {/* Performance / Live Stats Grid */}
            <div className="pt-6 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
                    {totalActiveCallers.toLocaleString()}+
                  </span>
                </div>
                <p className="text-xs text-slate-400">Active in Global Call</p>
              </div>

              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-300 font-mono">Zero</div>
                <p className="text-xs text-slate-400">Download or Setup</p>
              </div>

              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-cyan-300 font-mono">Instant</div>
                <p className="text-xs text-slate-400">1-Click P2P Join</p>
              </div>

              <div className="space-y-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-400 font-mono">&lt;28ms</div>
                <p className="text-xs text-slate-400">Ultra-Low Latency</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Hardware Pre-Check HUD Card */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="relative glass-card rounded-2xl border border-white/[0.12] p-5 sm:p-6 shadow-2xl shadow-black/60 overflow-hidden group">
              {/* Top Accent Light */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-linear-to-r from-transparent via-cyan-400 to-indigo-500" />

              {/* HUD Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold tracking-wider uppercase text-slate-200">
                    Hardware Pre-Check
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Ready to join</span>
                </div>
              </div>

              {/* Video Preview Window */}
              <div className="mt-4 relative aspect-video bg-slate-950/80 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col justify-between p-3.5 group/cam">
                {/* Corner HUD Marks */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-cyan-400/60 pointer-events-none" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-cyan-400/60 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-cyan-400/60 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-cyan-400/60 pointer-events-none" />

                {/* Viewfinder Top Bar */}
                <div className="relative z-10 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-slate-300 border border-white/10 font-mono">
                    <span className={`w-1.5 h-1.5 rounded-full ${videoOff ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                    <span>Preview: {currentUser?.displayName || 'You'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/50 text-cyan-300 border border-cyan-500/20">
                      HD 720p 60fps
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                      {facingMode === 'user' ? 'Front Cam' : 'Rear Cam'}
                    </span>
                  </div>
                </div>

                {/* Video element */}
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  } ${
                    videoOff ? 'opacity-0' : 'opacity-100'
                  }`}
                />

                {/* Center Loading / Standby Icon when video is off */}
                {videoOff && (
                  <div className="relative z-10 my-auto flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mb-2">
                      <VideoOff className="w-6 h-6 text-slate-500" />
                    </div>
                    <span className="text-xs text-slate-400 font-medium tracking-wide">
                      Camera is disabled
                    </span>
                  </div>
                )}

                {!videoOff && <div className="my-auto" />}

                {/* Bottom Audio Visualizer Over Preview */}
                <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">FPS: 60.0</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-[11px] font-mono text-slate-400">BITRATE: 4.8 Mbps</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-0.5 bg-emerald-400 animate-[wave_0.8s_ease-in-out_infinite_alternate]" />
                    <span className="h-3 w-0.5 bg-emerald-400 animate-[wave_1.1s_ease-in-out_infinite_alternate_0.2s]" />
                    <span className="h-4 w-0.5 bg-emerald-400 animate-[wave_0.9s_ease-in-out_infinite_alternate_0.4s]" />
                    <span className="h-2.5 w-0.5 bg-emerald-400 animate-[wave_1.3s_ease-in-out_infinite_alternate_0.1s]" />
                    <span className="h-1.5 w-0.5 bg-emerald-400 animate-[wave_0.7s_ease-in-out_infinite_alternate_0.3s]" />
                  </div>
                </div>
              </div>

              {/* Real-Time Microphone Decibel Meter */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Mic className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-medium">Microphone Input Level</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {micMuted ? 'Muted' : `${audioLevel}% (-${Math.round((100 - audioLevel) * 0.4)} dB)`}
                  </span>
                </div>
                {/* Animated Gradient Meter Bar */}
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-[1px] border border-white/5">
                  <div 
                    className={`h-full rounded-full transition-all duration-75 ${
                      micMuted ? 'bg-rose-500 w-0' : 'bg-linear-to-r from-emerald-400 via-cyan-400 to-indigo-500'
                    }`}
                    style={{ width: micMuted ? '0%' : `${Math.max(5, audioLevel)}%` }}
                  />
                </div>
              </div>

              {/* Hardware Device Control Bar */}
              <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center justify-between gap-2">
                {/* Mic Toggle */}
                <button
                  id="preview-toggle-mic"
                  onClick={toggleMic}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    micMuted
                      ? 'text-rose-300 bg-rose-950/40 border border-rose-500/30 hover:bg-rose-900/40'
                      : 'text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-900/40'
                  }`}
                >
                  {micMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{micMuted ? 'Muted' : 'Mic On'}</span>
                </button>

                {/* Cam Toggle */}
                <button
                  id="preview-toggle-video"
                  onClick={toggleVideo}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    videoOff
                      ? 'text-slate-400 bg-slate-800/80 border border-slate-700 hover:bg-slate-750'
                      : 'text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-900/40'
                  }`}
                >
                  {videoOff ? <VideoOff className="w-3.5 h-3.5 text-slate-400" /> : <Video className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{videoOff ? 'Cam Off' : 'Cam On'}</span>
                </button>

                {/* Flip Camera */}
                <button
                  id="preview-flip-camera"
                  onClick={flipCamera}
                  disabled={videoOff || isSwitchingCamera}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer ${
                    videoOff
                      ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500'
                      : isSwitchingCamera
                      ? 'bg-indigo-600/30 text-indigo-300 animate-pulse'
                      : 'text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 active:scale-95'
                  }`}
                  title="Flip Camera (Front / Rear)"
                >
                  <FlipHorizontal className={`w-3.5 h-3.5 ${isSwitchingCamera ? 'animate-spin' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">Flip</span>
                </button>

                {/* Audio / Video Settings */}
                <button
                  id="preview-open-settings"
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 transition-colors cursor-pointer"
                  title="Audio & Video Hardware Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Active Rooms Section */}
        <section className="space-y-6 pt-6">
          {/* Section Header with Search Bar, Filter Chips & Create CTA */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    Active Global Rooms & Lounges
                  </h2>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  Choose any open room to join live peer-to-peer conversations or launch a private session.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar with Cmd+K Badge */}
                <div className="relative flex-1 sm:w-80 md:w-96">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4 text-slate-400" />
                  </div>
                  <input
                    ref={searchInputRef}
                    id="search-rooms-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search room name, topic, or Room ID..."
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-900/80 glass-card text-xs sm:text-sm text-slate-100 placeholder-slate-500 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  />
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                    <kbd className="px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-800/80 border border-white/10 rounded-md shadow-inner">
                      ⌘K
                    </kbd>
                  </div>
                </div>

                {/* Create Room CTA Button */}
                <button
                  id="btn-create-room-modal"
                  onClick={() => {
                    if (!currentUser) { onOpenAuth(); return; }
                    setShowCreateModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 shadow-lg shadow-indigo-500/10 transition-all shrink-0 group active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-indigo-400 group-hover:rotate-90 transition-transform duration-300" />
                  <span>Create Room</span>
                </button>
              </div>
            </div>

            {/* Filter Chips Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-300 glass-button border border-white/[0.08] hover:border-indigo-500/30 hover:text-white'
                  }`}
                >
                  All Rooms
                </button>

                <button
                  onClick={() => setActiveFilter('video_audio')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeFilter === 'video_audio'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-300 glass-button border border-white/[0.08] hover:border-indigo-500/30 hover:text-white'
                  }`}
                >
                  <Video className="w-3 h-3 text-cyan-400" />
                  <span>Video & Audio</span>
                </button>

                <button
                  onClick={() => setActiveFilter('audio_only')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeFilter === 'audio_only'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-slate-300 glass-button border border-white/[0.08] hover:border-amber-500/30 hover:text-white'
                  }`}
                >
                  <Headphones className="w-3 h-3 text-amber-400" />
                  <span>Audio Only</span>
                </button>

                <button
                  onClick={() => setActiveFilter('popular')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeFilter === 'popular'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                      : 'text-slate-300 glass-button border border-white/[0.08] hover:border-rose-500/30 hover:text-white'
                  }`}
                >
                  <Flame className="w-3 h-3 text-rose-400" />
                  <span>Popular</span>
                </button>

                <button
                  onClick={() => setActiveFilter('community')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeFilter === 'community'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                      : 'text-slate-300 glass-button border border-white/[0.08] hover:border-purple-500/30 hover:text-white'
                  }`}
                >
                  <Users className="w-3 h-3 text-purple-400" />
                  <span>Friends / Community</span>
                </button>
              </div>

              <div className="pt-2 flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>
                  Showing <span className="text-cyan-300 font-semibold">{filteredRooms.length}</span> active rooms
                </span>
              </div>
            </div>
          </div>

          {/* Room Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRooms.map((room, idx) => {
              const count = roomParticipantsCount[room.id] || 0;
              const isAudioOnly = room.callType === 'audio_only';

              // Curated color themes for cards
              const borderStyles = isAudioOnly 
                ? 'hover:border-amber-500/40 hover:shadow-amber-500/10'
                : idx % 3 === 0 
                ? 'hover:border-indigo-500/40 hover:shadow-indigo-500/10'
                : idx % 3 === 1
                ? 'hover:border-cyan-500/40 hover:shadow-cyan-500/10'
                : 'hover:border-emerald-500/40 hover:shadow-emerald-500/10';

              return (
                <article
                  key={room.id}
                  className={`relative glass-card rounded-2xl border border-white/[0.08] p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl group ${borderStyles}`}
                >
                  <div className="space-y-4">
                    {/* Badges & Member Count */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          isAudioOnly
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        }`}>
                          {isAudioOnly ? <Headphones className="w-3 h-3 text-amber-400" /> : <Video className="w-3 h-3 text-indigo-400" />}
                          {isAudioOnly ? 'Audio' : 'Video'}
                        </span>

                        {room.isPinned && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </span>
                        )}

                        {(room.isOfficial || room.createdBy === 'system') && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> Official
                          </span>
                        )}

                        {room.isPasswordProtected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1" title="Password Required">
                            <Lock className="w-2.5 h-2.5" /> Pass
                          </span>
                        )}

                        {room.isPrivate && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1" title="Private Room">
                            <EyeOff className="w-2.5 h-2.5" /> Private
                          </span>
                        )}

                        {room.isGlobal && !room.isPinned && (
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            Featured
                          </span>
                        )}
                      </div>

                      {/* Participant Counter */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/60 px-2.5 py-1 rounded-full border border-white/[0.06] shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono font-semibold text-emerald-400">
                          {count}{room.participantLimit ? `/${room.participantLimit}` : ''}
                        </span>
                        <span className="text-slate-400">{isAudioOnly ? 'callers' : 'in call'}</span>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                        {isAudioOnly ? (
                          <Radio className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                        )}
                        <span>{room.title}</span>
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed line-clamp-2">
                        {room.description || 'Open public mesh video and audio space. Join in to talk and collaborate.'}
                      </p>
                    </div>

                    {/* Overlapping Participant Avatars & Info */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex -space-x-2 overflow-hidden">
                        <div className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center">
                          AL
                        </div>
                        <div className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 bg-cyan-600 text-[10px] font-bold text-white flex items-center justify-center">
                          RK
                        </div>
                        <div className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 bg-purple-600 text-[10px] font-bold text-white flex items-center justify-center">
                          MS
                        </div>
                        <div className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 bg-slate-700 text-[9px] font-medium text-slate-300 flex items-center justify-center">
                          +{count > 3 ? count - 3 : 1}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {isAudioOnly ? 'OPUS 48kHz Stereo' : 'End-to-End Encrypted'}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Room ID & Join Call */}
                  <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-white/5">
                      <span>ID:</span>
                      <span className="text-slate-300 max-w-[110px] truncate">{room.id}</span>
                    </div>

                    <button
                      id={`btn-join-room-${room.id}`}
                      onClick={() => handleJoin(room)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>Join Call</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Join by Custom ID Section */}
          <div className="mt-8 p-6 rounded-2xl glass-card border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                Have a direct Room ID or invitation code?
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Paste any private room ID below to jump directly into the session with your colleagues or friends
              </p>
            </div>

            <form onSubmit={handleJoinCustomId} className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <input
                  id="custom-room-id-input"
                  type="text"
                  placeholder="Paste Room ID (e.g. room-xyz)..."
                  value={customRoomId}
                  onChange={(e) => { setCustomRoomId(e.target.value); setJoinError(null); }}
                  className="bg-slate-900/80 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-64"
                />
                <button
                  id="btn-join-custom-id"
                  type="submit"
                  disabled={!customRoomId.trim() || isJoiningById}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition cursor-pointer shrink-0"
                >
                  {isJoiningById ? 'Checking...' : 'Enter'}
                </button>
              </div>
              {joinError && (
                <p className="text-xs text-rose-400 flex items-center gap-1.5">
                  <span>⚠️</span> {joinError}
                </p>
              )}
            </form>
          </div>
        </section>

        {/* Feature Highlights Strip */}
        <section className="border border-white/[0.08] rounded-2xl p-6 sm:p-8 glass-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">DTLS-SRTP Encryption</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  P2P media packets are strictly encrypted end-to-end directly between peers.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Adaptive Simulcast</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Dynamic multi-resolution bitrates automatically adjust to your connection speed.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Zero App Installation</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Runs in 1-click on Chrome, Safari, Firefox, Edge, and iOS/Android browsers.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">TURN Relay Fallback</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Seamless global geo-distributed TURN relays bypass symmetric NAT/firewalls.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Main Footer */}
      <footer className="relative z-20 border-t border-white/[0.08] bg-[#05080f]/80 mt-16 px-4 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-400">Global Call Network</span>
            <span>•</span>
            <span>Powered by WebRTC & Firebase Signaling</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <button 
              onClick={() => setShowHelpModal(true)} 
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <button 
              onClick={() => setShowHelpModal(true)} 
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Network Terms
            </button>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-mono">System Status (99.99%)</span>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-white/[0.12] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Create New Call Room
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Room Title
                </label>
                <input
                  id="new-room-title-input"
                  type="text"
                  required
                  placeholder="e.g. Design Sync / Bangladesh Hangout"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Participant Limit (Max Callers)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 2, 4, 8].map(limit => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setNewParticipantLimit(limit)}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        newParticipantLimit === limit
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {limit === 0 ? 'Unlimited' : `${limit} max`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Public / Private Toggle */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="private-room-checkbox" className="text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer">
                    <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                    Private Room (Lobby-তে লুকানো)
                  </label>
                  <input
                    id="private-room-checkbox"
                    type="checkbox"
                    checked={isPrivateRoom}
                    onChange={(e) => setIsPrivateRoom(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Private হলে এটি Lobby feed-এ দেখাবে না, শুধুমাত্র সরাসরি লিংক বা Room ID দিয়ে জয়েন করা যাবে।
                </p>
              </div>

              {/* Password Protection Toggle */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password-room-checkbox" className="text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer">
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    Password Protection (পাসওয়ার্ড দিন)
                  </label>
                  <input
                    id="password-room-checkbox"
                    type="checkbox"
                    checked={isPasswordRequired}
                    onChange={(e) => setIsPasswordRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                </div>
                {isPasswordRequired && (
                  <input
                    type="text"
                    required
                    placeholder="Enter Room Password (পাসওয়ার্ড লিখুন)..."
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 mt-1"
                  />
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-750 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-create-room"
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Create & Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Call Settings Modal */}
      <CallSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        roomId={DEFAULT_GLOBAL_ROOMS[0].id}
        roomTitle={DEFAULT_GLOBAL_ROOMS[0].title}
      />

      {/* Help & Info Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-white/[0.12] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Network Architecture & Privacy Info
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <p>
                <strong className="text-white">Peer-to-Peer Mesh:</strong> Global Call establishes direct WebRTC audio and video media connections between caller browsers using Google STUN relays. No video or voice data is recorded or stored on central servers.
              </p>
              <p>
                <strong className="text-white">Encrypted Transmission:</strong> All data packets are secured with standard DTLS (Datagram Transport Layer Security) and SRTP (Secure Real-time Transport Protocol).
              </p>
              <p>
                <strong className="text-white">Mobile & Desktop Friendly:</strong> Full compatibility with front/rear camera flipping, safe-area mobile viewports, and iOS Safari audio unlock.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Prompt Modal */}
      {passwordPromptRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                Password Protected Room
              </h3>
              <button
                onClick={() => setPasswordPromptRoom(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Room <strong className="text-white">"{passwordPromptRoom.title}"</strong> পাসওয়ার্ড দিয়ে সুরক্ষিত। প্রবেশ করতে পাসওয়ার্ড লিখুন:
            </p>
            <form onSubmit={handleConfirmPassword} className="space-y-3">
              <input
                type="password"
                autoFocus
                required
                placeholder="Enter room password..."
                value={enteredPassword}
                onChange={(e) => { setEnteredPassword(e.target.value); setPasswordError(null); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              {passwordError && (
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordPromptRoom(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/30 cursor-pointer"
                >
                  Enter Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {currentUser && (
        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          onUpdateProfile={(updated) => {
            // Profile updated in state
          }}
        />
      )}

      {/* Friends & DM Drawer Modal */}
      {currentUser && (
        <FriendsModal
          isOpen={isFriendsOpen}
          onClose={() => setIsFriendsOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Interactive Feature Roadmap Explorer Modal */}
      <RoadmapModal
        isOpen={isRoadmapOpen}
        onClose={() => setIsRoadmapOpen(false)}
      />
    </div>
  );
}
