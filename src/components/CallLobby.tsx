import { useState, useEffect, useRef, FormEvent } from 'react';
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
  Shield,
  Zap,
  Volume2,
  Download,
  FlipHorizontal
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDocs 
} from 'firebase/firestore';
import { db, logOut, syncUserProfile, checkIsAdmin } from '../lib/firebase';
import { UserProfile, CallRoom as RoomType } from '../types';
import { createPlaceholderVideoStream, createSilentAudioStream } from '../lib/webrtc';

interface CallLobbyProps {
  currentUser: UserProfile | null;
  onJoinRoom: (room: RoomType, options: { audioMuted: boolean; videoOff: boolean }) => void;
  onOpenAuth: () => void;
  onOpenAdminPanel?: () => void;
}

const DEFAULT_GLOBAL_ROOMS: RoomType[] = [
  {
    id: 'global-lounge-main',
    title: '🌐 Global Video & Audio Lounge',
    description: 'The main open room connecting callers worldwide 24/7. Jump right in and meet people.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-audio-cafe',
    title: '🎙️ Audio-Only Global Voice Cafe',
    description: 'Lightweight audio-only space for smooth, low-bandwidth voice conversations without cameras.',
    createdBy: 'system',
    callType: 'audio_only',
    isGlobal: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-hangout-chill',
    title: '☕ Casual Hangout & Community',
    description: 'Casual space to relax, talk, share stories, and make international friends.',
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
  const [customRoomId, setCustomRoomId] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);

  // Initialize preview stream
  useEffect(() => {
    let isCancelled = false;

    async function setupPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
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
        const dbRooms: RoomType[] = [];
        snapshot.forEach(docSnap => {
          dbRooms.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });

        // Merge defaults with created rooms
        const mergedMap = new Map<string, RoomType>();
        DEFAULT_GLOBAL_ROOMS.forEach(r => mergedMap.set(r.id, r));
        dbRooms.forEach(r => mergedMap.set(r.id, r));
        setRooms(Array.from(mergedMap.values()));
      },
      (err) => {
        console.warn('Rooms sync listener error:', err);
      }
    );

    return () => unsub();
  }, []);

  // Listen to participant counts per room
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    rooms.forEach(r => {
      const participantsCol = collection(db, 'rooms', r.id, 'participants');
      const u = onSnapshot(
        participantsCol, 
        (snap) => {
          setRoomParticipantsCount(prev => ({
            ...prev,
            [r.id]: snap.size
          }));
        },
        (err) => {
          console.warn(`Participants listener error for room ${r.id}:`, err);
        }
      );
      unsubs.push(u);
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
      console.warn('Lobby camera switch failed:', e);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const handleJoin = (room: RoomType) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    // Immediately stop hardware preview tracks so CallRoom can capture the real camera & mic without resource lock
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
      createdBy: room.createdBy || currentUser.uid,
      callType: room.callType || 'video_audio',
      isGlobal: !!room.isGlobal,
      createdAt: room.createdAt || new Date().toISOString()
    }, { merge: true }).catch(console.error);

    onJoinRoom(room, { audioMuted: micMuted, videoOff });
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
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'rooms', roomId), newRoom);
      setShowCreateModal(false);
      setNewRoomTitle('');
      handleJoin(newRoom);
    } catch (err) {
      console.error('Error creating room:', err);
    }
  };

  const handleJoinCustomId = (e: FormEvent) => {
    e.preventDefault();
    if (!customRoomId.trim()) return;
    const roomId = customRoomId.trim();
    const existing = rooms.find(r => r.id === roomId);
    if (existing) {
      handleJoin(existing);
    } else {
      const customRoom: RoomType = {
        id: roomId,
        title: `Room ${roomId.slice(0, 8)}`,
        description: 'Custom Call Room',
        createdBy: currentUser?.uid || 'guest',
        callType: 'video_audio',
        isGlobal: false,
        createdAt: new Date().toISOString()
      };
      handleJoin(customRoom);
    }
  };

  return (
    <div className="min-h-[100dvh] pb-safe bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-8 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Global Call
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                P2P Mesh
              </span>
            </h1>
            <p className="text-xs text-slate-400">Instant Global Video & Audio Connect</p>
          </div>
        </div>

        {/* User profile / Auth bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            id="btn-download-project-zip"
            href="/project-source.zip"
            download="global-call-source.zip"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 text-xs font-semibold transition cursor-pointer shadow-sm shadow-indigo-600/10"
            title="Download full project source code as a ZIP file"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Download ZIP</span>
            <span className="sm:hidden">ZIP</span>
          </a>

          {onOpenAdminPanel && (
            <button
              id="btn-open-admin-lobby"
              onClick={onOpenAdminPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isAdmin 
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30 shadow-sm shadow-amber-500/10' 
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700'
              }`}
              title="Administrator Control Panel"
            >
              <Shield className={`w-3.5 h-3.5 ${isAdmin ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="hidden xs:inline">Admin Panel</span>
              {isAdmin && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          )}

          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName}
                    className="w-7 h-7 rounded-full object-cover border border-slate-600"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-200 hidden sm:inline">
                  {currentUser.displayName}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>

              <button
                id="btn-logout"
                onClick={() => logOut(currentUser.uid)}
                title="Sign Out"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              id="btn-open-auth-nav"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Quick Join</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Hero Section with Live Camera Test and Big 1-Click Join */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Quick Action Hero */}
          <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-linear-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                <Globe className="w-3.5 h-3.5" />
                Worldwide Public Call Network
              </div>

              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Connect with the World in{' '}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 via-sky-300 to-emerald-400">
                  Real-Time Video & Audio
                </span>
              </h2>

              <p className="text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed">
                Just open an account or enter in 1-click to immediately join the global call. High-fidelity WebRTC audio, crisp camera streaming, and instant collaboration powered by Firebase.
              </p>

              {/* Big 1-Click Join Button */}
              <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  id="btn-hero-join-global"
                  onClick={() => handleJoin(DEFAULT_GLOBAL_ROOMS[0])}
                  className="px-6 py-4 rounded-2xl bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-base sm:text-lg transition-all duration-200 shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3"
                >
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                  <span>Join Global Call Now</span>
                  <ArrowRight className="w-5 h-5" />
                </button>

                <button
                  id="btn-hero-join-audio-cafe"
                  onClick={() => handleJoin(DEFAULT_GLOBAL_ROOMS[1])}
                  className="px-5 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm sm:text-base border border-slate-700 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Headphones className="w-4 h-4 text-indigo-400" />
                  <span>Audio-Only Cafe</span>
                </button>
              </div>
            </div>

            {/* Quick stats banner */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {roomParticipantsCount[DEFAULT_GLOBAL_ROOMS[0].id] || 1}
                </p>
                <p className="text-xs text-slate-400 font-medium">In Global Call</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-indigo-400">Zero</p>
                <p className="text-xs text-slate-400 font-medium">Download Needed</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-400">Instant</p>
                <p className="text-xs text-slate-400 font-medium">1-Click Join</p>
              </div>
            </div>
          </div>

          {/* Right Column: Pre-call Camera & Microphone Test */}
          <div className="lg:col-span-5 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Hardware Pre-Check
                </span>
                <span className="text-xs text-slate-400">Ready to join</span>
              </div>

              {/* Camera view element */}
              <div className="relative w-full aspect-video rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-200 ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  } ${
                    videoOff ? 'opacity-0' : 'opacity-100'
                  }`}
                />

                {videoOff && (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4">
                    <VideoOff className="w-12 h-12 text-slate-600 mb-2" />
                    <span className="text-xs font-medium">Camera is disabled</span>
                  </div>
                )}

                {/* Status chip */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${micMuted ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
                  {currentUser?.displayName || 'Preview User'}
                </div>

                {/* Camera facing indicator */}
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-slate-300 text-[10px] font-medium">
                  {facingMode === 'user' ? 'Front Cam' : 'Rear Cam'}
                </div>
              </div>

              {/* Mic volume bar */}
              <div className="mt-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                    Microphone Level
                  </span>
                  <span>{micMuted ? 'Muted' : `${audioLevel}%`}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-75 ${micMuted ? 'bg-rose-500 w-0' : 'bg-emerald-500'}`}
                    style={{ width: micMuted ? '0%' : `${Math.max(4, audioLevel)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Toggle controls */}
            <div className="pt-4 flex items-center justify-center gap-2 sm:gap-3">
              <button
                id="preview-toggle-mic"
                onClick={toggleMic}
                className={`flex-1 py-2.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  micMuted
                    ? 'bg-rose-600/20 text-rose-300 border border-rose-600/40 hover:bg-rose-600/30'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {micMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                <span>{micMuted ? 'Mic Off' : 'Mic On'}</span>
              </button>

              <button
                id="preview-toggle-video"
                onClick={toggleVideo}
                className={`flex-1 py-2.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  videoOff
                    ? 'bg-rose-600/20 text-rose-300 border border-rose-600/40 hover:bg-rose-600/30'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {videoOff ? <VideoOff className="w-4 h-4 text-rose-400" /> : <Video className="w-4 h-4 text-emerald-400" />}
                <span>{videoOff ? 'Cam Off' : 'Cam On'}</span>
              </button>

              <button
                id="preview-flip-camera"
                onClick={flipCamera}
                disabled={videoOff || isSwitchingCamera}
                title={facingMode === 'user' ? "Switch to Rear / Back Camera" : "Switch to Front Camera"}
                className={`py-2.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  videoOff
                    ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                    : isSwitchingCamera
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 active:scale-95'
                }`}
              >
                <FlipHorizontal className={`w-4 h-4 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
                <span>Flip</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Active Call Rooms */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                Active Global Rooms & Lounges
              </h3>
              <p className="text-xs text-slate-400">
                Choose any room to join other online participants
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                id="btn-create-room-modal"
                onClick={() => {
                  if (!currentUser) { onOpenAuth(); return; }
                  setShowCreateModal(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 text-indigo-400" />
                Create Room
              </button>
            </div>
          </div>

          {/* Rooms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => {
              const count = roomParticipantsCount[room.id] || 0;
              const isAudioOnly = room.callType === 'audio_only';

              return (
                <div
                  key={room.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 transition-all duration-200 flex flex-col justify-between group shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isAudioOnly 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {isAudioOnly ? <Headphones className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                        {isAudioOnly ? 'Audio Only' : 'Video & Audio'}
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-semibold text-slate-200">{count}</span> in call
                      </div>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {room.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {room.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      ID: {room.id.slice(0, 14)}...
                    </span>

                    <button
                      id={`btn-join-room-${room.id}`}
                      onClick={() => handleJoin(room)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Join Call</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Join by custom ID section */}
        <section className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Have a direct Room ID or link?</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste the room ID below to join your friends or colleagues privately
            </p>
          </div>

          <form onSubmit={handleJoinCustomId} className="flex items-center gap-2 w-full sm:w-auto">
            <input
              id="custom-room-id-input"
              type="text"
              placeholder="Paste Room ID..."
              value={customRoomId}
              onChange={(e) => setCustomRoomId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-60"
            />
            <button
              id="btn-join-custom-id"
              type="submit"
              disabled={!customRoomId.trim()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition disabled:opacity-40 cursor-pointer shrink-0"
            >
              Enter
            </button>
          </form>
        </section>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create New Call Room</h3>
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
                  Call Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRoomType('video_audio')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                      newRoomType === 'video_audio'
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    Video & Audio
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRoomType('audio_only')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                      newRoomType === 'audio_only'
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Headphones className="w-4 h-4" />
                    Audio Only
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-create-room"
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Create & Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
