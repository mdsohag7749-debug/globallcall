import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  Monitor, 
  ScreenShare,
  ScreenShareOff,
  Settings, 
  Users, 
  MessageSquare, 
  Smile, 
  Globe, 
  ShieldCheck,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  AlertCircle,
  X,
  FlipHorizontal,
  MoreHorizontal,
  CircleDot,
  Hand,
  Sparkles,
  Wand2,
  Radio,
  Flag,
  Image as ImageIcon
} from 'lucide-react';
import { useCallRoom } from '../hooks/useCallRoom';
import VideoTile from './VideoTile';
import CallSidebar from './CallSidebar';
import CallSettingsModal from './CallSettingsModal';
import FloatingReactions, { ReactionItem } from './FloatingReactions';
import ReactionMenu from './ReactionMenu';
import ReportUserModal from './ReportUserModal';
import { CallRecorder } from '../lib/recording';
import { UserProfile, CallRoom as RoomType, Participant } from '../types';
import { playChatChime } from '../lib/sound';
import { 
  addDoc, 
  collection, 
  serverTimestamp, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface CallRoomProps {
  room: RoomType;
  currentUser: UserProfile;
  onLeave: () => void;
  initialAudioMuted?: boolean;
  initialVideoOff?: boolean;
}

export default function CallRoom({
  room,
  currentUser,
  onLeave,
  initialAudioMuted = false,
  initialVideoOff = false,
}: CallRoomProps) {
  const [pinnedUid, setPinnedUid] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'participants' | 'chat'>('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<ReactionItem[]>([]);
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [screenShareNotice, setScreenShareNotice] = useState<string | null>(null);

  // Unread message tracking & incoming message notifications
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatMessageCount, setChatMessageCount] = useState(0);
  const [incomingChatToast, setIncomingChatToast] = useState<{
    id: string;
    senderName: string;
    text: string;
    senderPhoto?: string;
  } | null>(null);

  const isSidebarOpenRef = useRef(isSidebarOpen);
  isSidebarOpenRef.current = isSidebarOpen;
  const sidebarTabRef = useRef(sidebarTab);
  sidebarTabRef.current = sidebarTab;
  const toastTimeoutRef = useRef<any>(null);
  const seenChatMsgIds = useRef<Set<string>>(new Set());

  // Automatically reset unread count when chat is actively open
  useEffect(() => {
    if (isSidebarOpen && sidebarTab === 'chat') {
      setUnreadChatCount(0);
      setIncomingChatToast(null);
    }
  }, [isSidebarOpen, sidebarTab]);

  // Roadmap Features: Raise hand, Call recording, Background Blur, Virtual Background, Noise Cancellation, Moderation
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isBackgroundBlurred, setIsBackgroundBlurred] = useState(false);
  const [virtualBackground, setVirtualBackground] = useState<string>('none');
  const [isNoiseSuppression, setIsNoiseSuppression] = useState(true);
  const [reportingTarget, setReportingTarget] = useState<Participant | null>(null);
  const [hostMuteNotice, setHostMuteNotice] = useState<string | null>(null);
  const recorderRef = useRef<CallRecorder | null>(null);

  const {
    localStream,
    remoteStreams,
    participants,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isConnecting,
    isLocalSpeaking,
    activeSpeakerId,
    facingMode,
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
    unlockAudio,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leaveCall
  } = useCallRoom({
    roomId: room.id,
    currentUser,
    initialAudioMuted,
    initialVideoOff,
    onCallEnded: onLeave
  });

  // Ban check: If user is banned from room, exit automatically
  useEffect(() => {
    if (room.bannedUids && room.bannedUids.includes(currentUser.uid)) {
      alert('You have been banned from this room by the host.');
      onLeave();
    }
  }, [room.bannedUids, currentUser.uid, onLeave]);

  // Host remote mute listener: If host muted this participant, force mic mute
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'rooms', room.id, 'participants', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.isMutedByHost && !isAudioMuted) {
          toggleAudio();
          setHostMuteNotice('The room host muted your microphone.');
          setTimeout(() => setHostMuteNotice(null), 4000);
        }
        if (typeof data.raisedHand === 'boolean') {
          setIsHandRaised(data.raisedHand);
        }
      }
    });
    return () => unsub();
  }, [room.id, currentUser.uid, isAudioMuted, toggleAudio]);

  // Raise hand toggle handler
  const handleToggleRaiseHand = async () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    try {
      await setDoc(doc(db, 'rooms', room.id, 'participants', currentUser.uid), {
        raisedHand: nextState,
        raisedHandAt: nextState ? new Date().toISOString() : null
      }, { merge: true });
    } catch (e) {
      console.warn('Failed to update hand raise:', e);
    }
  };

  // Call recording toggle handler
  const handleToggleRecording = () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      setRecordingSeconds(0);
    } else {
      if (!localStream) {
        alert('Cannot record without active media stream.');
        return;
      }
      const recorder = new CallRecorder((secs) => {
        setRecordingSeconds(secs);
      });
      recorderRef.current = recorder;
      const started = recorder.start(localStream);
      if (started) {
        setIsRecording(true);
      }
    }
  };

  // Background Blur toggle handler
  const handleToggleBackgroundBlur = () => {
    setIsBackgroundBlurred(prev => !prev);
  };

  // Noise Suppression toggle with dynamic WebRTC audio constraint application
  const handleToggleNoiseSuppression = () => {
    setIsNoiseSuppression(prev => {
      const next = !prev;
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.applyConstraints({
            echoCancellation: next,
            noiseSuppression: next,
            autoGainControl: next
          }).catch(e => console.warn('Could not apply audio constraints', e));
        });
      }
      return next;
    });
  };

  // Mobile Audio Unlock on first touch/interaction
  useEffect(() => {
    const handleUnlock = () => {
      unlockAudio();
    };
    window.addEventListener('touchstart', handleUnlock, { passive: true, once: true });
    window.addEventListener('click', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('click', handleUnlock);
    };
  }, [unlockAudio]);

  // Screen share trigger using Screen Capture API with error notification
  const handleToggleScreenShare = async () => {
    setScreenShareNotice(null);
    try {
      await toggleScreenShare();
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        setScreenShareNotice('Screen share was cancelled or permission was not granted.');
      } else {
        setScreenShareNotice(err.message || 'Screen capture could not be started.');
      }
      setTimeout(() => setScreenShareNotice(null), 4000);
    }
  };

  // Call duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Keep track of already displayed reaction IDs and join time to prevent duplicate animations
  const seenReactionIds = useRef<Set<string>>(new Set());
  const roomJoinedAtRef = useRef<number>(Date.now() - 3000);

  // Listen to in-call reactions in real-time so all participants see them
  useEffect(() => {
    if (!room.id) return;

    const messagesCol = collection(db, 'rooms', room.id, 'messages');
    const q = query(messagesCol, orderBy('createdAt', 'desc'), limit(25));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'reaction') {
              const rxId = (data.clientReactionId as string) || change.doc.id;

              if (seenReactionIds.current.has(rxId)) {
                return;
              }
              seenReactionIds.current.add(rxId);

              // Skip stale reactions created before entering this call
              const createdAtMillis = data.createdAt?.toDate 
                ? data.createdAt.toDate().getTime() 
                : Date.now();
              if (createdAtMillis < roomJoinedAtRef.current) {
                return;
              }

              const isLocal = data.senderId === currentUser.uid;
              const newReaction: ReactionItem = {
                id: rxId,
                emoji: data.text,
                senderName: data.senderName || (isLocal ? 'You' : 'Participant'),
                isLocal,
                xPercent: 15 + Math.random() * 70,
                swayOffset: (Math.random() - 0.5) * 60,
                rotation: (Math.random() - 0.5) * 35
              };

              setFloatingReactions((prev) => [...prev.slice(-20), newReaction]);
            } else {
              // Real-time In-Call Text Chat Message
              const msgId = change.doc.id;
              if (seenChatMsgIds.current.has(msgId)) {
                return;
              }
              seenChatMsgIds.current.add(msgId);

              const createdAtMillis = data.createdAt?.toDate 
                ? data.createdAt.toDate().getTime() 
                : Date.now();

              // If message arrived after user joined and was sent by someone else
              if (createdAtMillis >= roomJoinedAtRef.current - 2000 && data.senderId !== currentUser.uid) {
                if (!isSidebarOpenRef.current || sidebarTabRef.current !== 'chat') {
                  playChatChime();
                  setUnreadChatCount((prev) => prev + 1);
                  setIncomingChatToast({
                    id: msgId,
                    senderName: data.senderName || 'Participant',
                    text: data.text || '',
                    senderPhoto: data.senderPhoto
                  });
                  if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                  toastTimeoutRef.current = setTimeout(() => {
                    setIncomingChatToast(null);
                  }, 5000);
                }
              }
            }
          }
        });
      },
      (err) => {
        console.warn('Real-time reactions listener notice:', err);
      }
    );

    return () => unsubscribe();
  }, [room.id, currentUser.uid]);

  // Remove finished reaction animations from state
  const handleReactionComplete = (id: string) => {
    setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
  };

  // Broadcast reaction to call chat and trigger floating effect
  const handleSendReaction = async (emoji: string) => {
    const clientReactionId = `rx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    seenReactionIds.current.add(clientReactionId);

    // Immediate zero-latency local floating reaction
    const reactionObj: ReactionItem = {
      id: clientReactionId,
      emoji,
      senderName: currentUser.displayName,
      isLocal: true,
      xPercent: 20 + Math.random() * 60,
      swayOffset: (Math.random() - 0.5) * 60,
      rotation: (Math.random() - 0.5) * 35
    };
    setFloatingReactions((prev) => [...prev.slice(-20), reactionObj]);

    // Send to Firestore so all remote participants receive and animate it
    try {
      await addDoc(collection(db, 'rooms', room.id, 'messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        text: emoji,
        type: 'reaction',
        clientReactionId,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Error broadcasting reaction:', e);
    }
  };

  // Build the list of all participants to render (local + remotes)
  const allTiles = useMemo(() => {
    const list: {
      participant: Participant;
      stream: MediaStream | null;
      isLocal: boolean;
      isSpeaking: boolean;
    }[] = [];

    // Local user first
    list.push({
      participant: {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        isAudioMuted,
        isVideoOff,
        isScreenSharing,
        joinedAt: new Date().toISOString()
      },
      stream: localStream,
      isLocal: true,
      isSpeaking: isLocalSpeaking
    });

    // Remote participants
    participants.forEach(p => {
      if (p.uid !== currentUser.uid) {
        list.push({
          participant: p,
          stream: remoteStreams[p.uid] || null,
          isLocal: false,
          isSpeaking: activeSpeakerId === p.uid && !p.isAudioMuted
        });
      }
    });

    return list;
  }, [currentUser, localStream, remoteStreams, participants, isAudioMuted, isVideoOff, isScreenSharing, isLocalSpeaking, activeSpeakerId]);

  // Determine grid template classes based on tile count with mobile portrait optimization
  const getGridClasses = (count: number) => {
    if (pinnedUid) return 'flex flex-col md:flex-row gap-3';
    if (count <= 1) return 'grid grid-cols-1 w-full h-full max-w-4xl mx-auto';
    // Mobile portrait: 2 rows, 1 col (stacked 50/50); Desktop: 2 cols side-by-side
    if (count === 2) return 'grid grid-cols-1 grid-rows-2 md:grid-rows-1 md:grid-cols-2 w-full h-full max-w-5xl mx-auto gap-2.5 sm:gap-4';
    if (count <= 4) return 'grid grid-cols-1 sm:grid-cols-2 w-full h-full max-w-6xl mx-auto gap-2.5 sm:gap-4';
    if (count <= 6) return 'grid grid-cols-2 md:grid-cols-3 w-full h-full max-w-7xl mx-auto gap-2.5 sm:gap-4';
    return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full h-full max-w-7xl mx-auto gap-2.5 sm:gap-4';
  };

  const handleToggleParticipants = () => {
    if (!isSidebarOpen) {
      setSidebarTab('participants');
      setIsSidebarOpen(true);
    } else if (sidebarTab === 'participants') {
      setIsSidebarOpen(false);
    } else {
      setSidebarTab('participants');
    }
  };

  const handleToggleChat = () => {
    if (!isSidebarOpen) {
      setSidebarTab('chat');
      setIsSidebarOpen(true);
      setUnreadChatCount(0);
      setIncomingChatToast(null);
    } else if (sidebarTab === 'chat') {
      setIsSidebarOpen(false);
    } else {
      setSidebarTab('chat');
      setUnreadChatCount(0);
      setIncomingChatToast(null);
    }
  };

  const copyRoomInvite = () => {
    const url = `${window.location.origin}/?room=${room.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div 
      id="call-room-container"
      className="relative w-full h-[100dvh] bg-[#060911] text-slate-100 flex flex-col overflow-hidden select-none"
    >
      {/* Ambient Backdrop Lights */}
      <div className="fixed inset-0 pointer-events-none glow-radial-indigo z-0" />
      <div className="fixed inset-0 pointer-events-none glow-radial-cyan z-0" />
      <div className="fixed inset-0 pointer-events-none mesh-grid-pattern opacity-40 z-0" />
      {/* Top Header Bar */}
      <header className="h-14 px-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="truncate">
            <h2 className="text-sm sm:text-base font-semibold text-slate-100 truncate flex items-center gap-2">
              {room.title}
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </h2>
          </div>
        </div>

        {/* Center: Call Timer & Status */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/60 text-xs font-mono font-medium text-slate-300">
            {formatDuration(callDuration)}
          </div>
          {isConnecting && (
            <span className="text-xs text-amber-400 animate-pulse">Connecting...</span>
          )}
        </div>

        {/* Right action icons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Header Screen Share Button (Desktop) */}
          <button
            id="header-screenshare-btn"
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? "Stop Presenting Screen" : "Share Screen (Screen Capture API)"}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isScreenSharing
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isScreenSharing ? (
              <>
                <ScreenShareOff className="w-3.5 h-3.5 text-white" />
                <span>Presenting</span>
              </>
            ) : (
              <>
                <ScreenShare className="w-3.5 h-3.5 text-slate-300" />
                <span>Share Screen</span>
              </>
            )}
          </button>

          {/* Header Quick React Button */}
          <button
            id="header-reactions-btn"
            onClick={() => setShowReactionMenu(prev => !prev)}
            title="Send Reaction (Thumbs Up, Heart, Party Popper...)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              showReactionMenu
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-300 font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <Smile className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">React</span>
          </button>

          <button
            id="copy-invite-header-btn"
            onClick={copyRoomInvite}
            title="Copy Invite Link"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            {copiedLink ? 'Copied' : 'Share Link'}
          </button>

          <button
            id="btn-open-participants"
            onClick={handleToggleParticipants}
            title="Connected Users"
            className={`p-2 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-medium ${
              isSidebarOpen && sidebarTab === 'participants'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-xs">{allTiles.length}</span>
          </button>

          <button
            id="btn-open-chat"
            onClick={handleToggleChat}
            title="Chat & Reactions"
            className={`p-2 rounded-lg transition cursor-pointer relative ${
              isSidebarOpen && sidebarTab === 'chat'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white ring-2 ring-slate-900 animate-pulse">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Call View Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Floating Animated Reactions Overlay across call stage */}
        <FloatingReactions 
          reactions={floatingReactions} 
          onReactionComplete={handleReactionComplete} 
        />

        {/* Floating Incoming Chat Message Banner */}
        {incomingChatToast && (!isSidebarOpen || sidebarTab !== 'chat') && (
          <div
            id="incoming-chat-toast"
            onClick={() => {
              setIsSidebarOpen(true);
              setSidebarTab('chat');
              setUnreadChatCount(0);
              setIncomingChatToast(null);
            }}
            className="absolute top-4 right-4 z-40 max-w-xs sm:max-w-sm bg-slate-900/95 border border-indigo-500/60 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-start gap-3 cursor-pointer hover:border-indigo-400 hover:bg-slate-850 transition-all animate-in fade-in slide-in-from-top-3 group"
          >
            {incomingChatToast.senderPhoto ? (
              <img
                src={incomingChatToast.senderPhoto}
                alt={incomingChatToast.senderName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500 shrink-0 mt-0.5"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                {incomingChatToast.senderName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-indigo-300 truncate">
                  {incomingChatToast.senderName}
                </span>
                <span className="text-[10px] text-slate-400">new</span>
              </div>
              <p className="text-xs text-slate-200 line-clamp-2 mt-0.5 break-words">
                {incomingChatToast.text}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIncomingChatToast(null);
              }}
              className="text-slate-400 hover:text-white p-1 rounded-md transition"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Active Screen Sharing Floating Bar */}
        {isScreenSharing && (
          <div 
            id="active-screenshare-banner"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-blue-950/90 border border-blue-500/70 text-blue-100 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md flex items-center gap-3 text-xs sm:text-sm font-medium animate-in fade-in slide-in-from-top-3"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />
              </span>
              <span>You are currently presenting your screen</span>
            </div>
            <button
              id="banner-stop-screenshare-btn"
              onClick={handleToggleScreenShare}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <ScreenShareOff className="w-3.5 h-3.5" />
              <span>Stop Sharing</span>
            </button>
          </div>
        )}

        {/* Screen Share Temporary Notification Toast */}
        {screenShareNotice && (
          <div 
            id="screenshare-notice-toast"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-medium animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{screenShareNotice}</span>
          </div>
        )}

        {/* Videos Container */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto flex flex-col justify-center items-center transition-all duration-300">
          {/* Pinned View Layout */}
          {pinnedUid ? (
            <div className="w-full h-full flex flex-col md:flex-row gap-4 max-w-7xl">
              {/* Main large pinned tile */}
              <div className="flex-1 h-full min-h-[300px]">
                {(() => {
                  const pinnedItem = allTiles.find(t => t.participant.uid === pinnedUid) || allTiles[0];
                  return (
                  <VideoTile
                      participant={pinnedItem.participant}
                      stream={pinnedItem.stream}
                      isLocal={pinnedItem.isLocal}
                      isSpeaking={pinnedItem.isSpeaking}
                      isPinned={true}
                      isHost={pinnedItem.participant.uid === room.createdBy}
                      facingMode={pinnedItem.isLocal ? facingMode : 'user'}
                      isBlurred={pinnedItem.isLocal ? isBackgroundBlurred : false}
                      virtualBackground={pinnedItem.isLocal ? virtualBackground : 'none'}
                      onTogglePin={() => setPinnedUid(null)}
                      onReport={(p) => setReportingTarget(p)}
                    />
                  );
                })()}
              </div>

              {/* Thumbnails rail for remaining participants */}
              <div className="w-full md:w-64 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto shrink-0">
                {allTiles
                  .filter(t => t.participant.uid !== pinnedUid)
                  .map(t => (
                    <div key={t.participant.uid} className="w-44 md:w-full h-32 md:h-40 shrink-0">
                      <VideoTile
                        participant={t.participant}
                        stream={t.stream}
                        isLocal={t.isLocal}
                        isSpeaking={t.isSpeaking}
                        isPinned={false}
                        isHost={t.participant.uid === room.createdBy}
                        facingMode={t.isLocal ? facingMode : 'user'}
                        isBlurred={t.isLocal ? isBackgroundBlurred : false}
                        virtualBackground={t.isLocal ? virtualBackground : 'none'}
                        onTogglePin={() => setPinnedUid(t.participant.uid)}
                        onReport={(p) => setReportingTarget(p)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            /* Dynamic Auto-Grid Layout */
            <div className={`w-full h-full gap-2 sm:gap-4 items-center justify-center ${getGridClasses(allTiles.length)}`}>
              {allTiles.map(t => (
                <VideoTile
                  key={t.participant.uid}
                  participant={t.participant}
                  stream={t.stream}
                  isLocal={t.isLocal}
                  isSpeaking={t.isSpeaking}
                  isPinned={false}
                  isHost={t.participant.uid === room.createdBy}
                  facingMode={t.isLocal ? facingMode : 'user'}
                  isBlurred={t.isLocal ? isBackgroundBlurred : false}
                  virtualBackground={t.isLocal ? virtualBackground : 'none'}
                  onTogglePin={() => setPinnedUid(t.participant.uid)}
                  onReport={(p) => setReportingTarget(p)}
                />
              ))}
            </div>
          )}
        </main>

        {/* Host Remote Mute Alert Toast */}
        {hostMuteNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
            <MicOff className="w-4 h-4 text-rose-400" />
            <span>{hostMuteNotice}</span>
          </div>
        )}

        {/* In-Call Slide-out Drawer / Sidebar (Connected Users & Chat) */}
        <CallSidebar
          room={room}
          currentUser={currentUser}
          participants={participants}
          isLocalSpeaking={isLocalSpeaking}
          activeSpeakerId={activeSpeakerId}
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          isScreenSharing={isScreenSharing}
          pinnedUid={pinnedUid}
          onTogglePin={(uid) => setPinnedUid(prev => prev === uid ? null : uid)}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeTab={sidebarTab}
          setActiveTab={setSidebarTab}
          onSendReaction={handleSendReaction}
          chatMessageCount={chatMessageCount}
          onChatMessageCountChange={setChatMessageCount}
          onReportUser={(p) => setReportingTarget(p)}
        />
      </div>

      {/* Mobile "More Actions" Slide-up Sheet */}
      {showMobileMore && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 sm:hidden animate-fade-in"
            onClick={() => setShowMobileMore(false)}
          />
          <div 
            id="mobile-more-actions-sheet"
            className="fixed inset-x-3 bottom-24 z-40 sm:hidden bg-slate-900/95 border border-slate-800 rounded-3xl p-4 shadow-2xl backdrop-blur-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 text-slate-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                Quick Reactions
              </span>
              <button 
                onClick={() => setShowMobileMore(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Reactions emoji row */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
              {['👍', '❤️', '🔥', '🎉', '👏', '😂', '🚀', '👋'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    handleSendReaction(emoji);
                    setShowMobileMore(false);
                  }}
                  className="w-10 h-10 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:scale-110 flex items-center justify-center text-xl transition shadow-sm cursor-pointer shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Grid of secondary actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                id="mobile-btn-raise-hand"
                onClick={() => {
                  handleToggleRaiseHand();
                  setShowMobileMore(false);
                }}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                  isHandRaised 
                    ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                }`}
              >
                <Hand className={`w-4 h-4 ${isHandRaised ? 'text-slate-950 animate-bounce' : 'text-amber-400'}`} />
                <span>{isHandRaised ? 'Lower Hand' : 'Raise Hand ✋'}</span>
              </button>

              <button
                id="mobile-btn-record"
                onClick={() => {
                  handleToggleRecording();
                  setShowMobileMore(false);
                }}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                  isRecording 
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                }`}
              >
                <CircleDot className={`w-4 h-4 ${isRecording ? 'text-white animate-spin' : 'text-rose-400'}`} />
                <span>{isRecording ? `REC ${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}` : 'Record Call'}</span>
              </button>

              <button
                id="mobile-btn-blur"
                onClick={() => {
                  handleToggleBackgroundBlur();
                  setShowMobileMore(false);
                }}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                  isBackgroundBlurred 
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>{isBackgroundBlurred ? 'Blur: ON' : 'Blur Video'}</span>
              </button>

              <button
                id="mobile-btn-virtual-bg"
                onClick={() => {
                  setShowMobileMore(false);
                  setIsSettingsOpen(true);
                }}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                  virtualBackground !== 'none'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                }`}
              >
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span>{virtualBackground !== 'none' ? 'Virtual BG: ON' : 'Virtual BG'}</span>
              </button>

              <button
                id="mobile-btn-participants"
                onClick={() => {
                  setShowMobileMore(false);
                  handleToggleParticipants();
                }}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center gap-2.5 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Participants ({allTiles.length})</span>
              </button>

              <button
                id="mobile-btn-screenshare"
                onClick={() => {
                  setShowMobileMore(false);
                  handleToggleScreenShare();
                }}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                  isScreenSharing
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                }`}
              >
                {isScreenSharing ? (
                  <ScreenShareOff className="w-4 h-4" />
                ) : (
                  <ScreenShare className="w-4 h-4 text-blue-400" />
                )}
                <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
              </button>

              <button
                id="mobile-btn-copy-link"
                onClick={() => {
                  copyRoomInvite();
                  setTimeout(() => setShowMobileMore(false), 1200);
                }}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center gap-2.5 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Invite'}</span>
              </button>

              <button
                id="mobile-btn-settings"
                onClick={() => {
                  setShowMobileMore(false);
                  setIsSettingsOpen(true);
                }}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center gap-2.5 text-xs font-semibold text-slate-200 cursor-pointer col-span-2"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Call Settings & Hardware</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Floating Bottom Control Bar */}
      <footer className="h-20 pb-safe bg-slate-900/90 backdrop-blur-xl border-t border-slate-800/90 px-3 sm:px-4 flex items-center justify-center z-20 shrink-0">
        {/* Mobile Compact Toolbar (< sm) */}
        <div className="flex sm:hidden items-center justify-between w-full max-w-sm px-1 gap-1.5">
          {/* Mic */}
          <button
            id="control-btn-mic"
            onClick={toggleAudio}
            title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`p-3 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isAudioMuted
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {isLocalSpeaking && !isAudioMuted && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* Camera Video Toggle */}
          <button
            id="control-btn-video"
            onClick={toggleVideo}
            title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
            className={`p-3 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isVideoOff
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Flip Camera (Front / Rear) for Mobile */}
          <button
            id="control-btn-flip-camera"
            onClick={switchCamera}
            disabled={isSwitchingCamera || isVideoOff}
            title={facingMode === 'user' ? "Switch to Back Camera" : "Switch to Front Camera"}
            className={`p-3 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isVideoOff
                ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-800'
                : isSwitchingCamera
                ? 'bg-indigo-600 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-95'
            }`}
          >
            <FlipHorizontal className={`w-5 h-5 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
          </button>

          {/* In-Call Chat Drawer Toggle */}
          <button
            id="control-btn-chat"
            onClick={handleToggleChat}
            title="In-Call Chat & Reactions"
            className={`p-3 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isSidebarOpen && sidebarTab === 'chat'
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white ring-2 ring-slate-900 animate-pulse">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>

          {/* Mobile "More" Menu Toggle */}
          <button
            id="control-btn-mobile-more"
            onClick={() => setShowMobileMore(prev => !prev)}
            title="More actions (Reactions, Users, Settings)"
            className={`p-3 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              showMobileMore
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {/* End / Leave Call */}
          <button
            id="control-btn-leave"
            onClick={leaveCall}
            title="Leave Call"
            className="p-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop Expanded Toolbar (>= sm) */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3.5">
          {/* Microphone Toggle */}
          <button
            id="control-btn-mic-desktop"
            onClick={toggleAudio}
            title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isAudioMuted
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {isLocalSpeaking && !isAudioMuted && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* Camera Toggle */}
          <button
            id="control-btn-video-desktop"
            onClick={toggleVideo}
            title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isVideoOff
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            }`}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Camera Flip (Desktop with multi-webcam or touch laptop) */}
          <button
            id="control-btn-flip-camera-desktop"
            onClick={switchCamera}
            disabled={isSwitchingCamera || isVideoOff}
            title={facingMode === 'user' ? "Switch to Environment / Back Camera" : "Switch to Front Camera"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isVideoOff
                ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500'
                : isSwitchingCamera
                ? 'bg-indigo-600 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-95'
            }`}
          >
            <FlipHorizontal className={`w-5 h-5 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
          </button>

          {/* Screen Capture API Button */}
          <button
            id="control-btn-screenshare"
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? "Stop Sharing Screen" : "Share Your Screen"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative group ${
              isScreenSharing
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/80'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
            }`}
          >
            {isScreenSharing ? (
              <ScreenShareOff className="w-5 h-5 text-white animate-pulse" />
            ) : (
              <ScreenShare className="w-5 h-5 text-slate-200 group-hover:text-white transition-colors" />
            )}
            {isScreenSharing && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 ring-2 ring-slate-900" />
              </span>
            )}
          </button>

          {/* Connected Users Slide-out Drawer Toggle */}
          <button
            id="control-btn-participants"
            onClick={handleToggleParticipants}
            title="Connected Users in Room"
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isSidebarOpen && sidebarTab === 'participants'
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500 text-white ring-2 ring-slate-900">
              {allTiles.length}
            </span>
          </button>

          {/* Raise Hand Button */}
          <button
            id="control-btn-raise-hand-desktop"
            onClick={handleToggleRaiseHand}
            title={isHandRaised ? "Lower Hand" : "Raise Hand to Speak"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isHandRaised
                ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30 ring-2 ring-amber-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <Hand className={`w-5 h-5 ${isHandRaised ? 'animate-bounce' : ''}`} />
            {isHandRaised && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping" />
            )}
          </button>

          {/* In-Browser Call Recording Button */}
          <button
            id="control-btn-record-desktop"
            onClick={handleToggleRecording}
            title={isRecording ? "Stop & Save Recording" : "Record Call (Local .webm file)"}
            className={`px-3.5 sm:px-4 py-3.5 sm:py-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center gap-2 ${
              isRecording
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-400 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <CircleDot className={`w-5 h-5 ${isRecording ? 'animate-spin' : 'text-rose-500'}`} />
            {isRecording ? (
              <span className="text-xs font-mono font-bold">
                REC {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            ) : (
              <span className="hidden xl:inline text-xs font-semibold">Record</span>
            )}
          </button>

          {/* Background Blur Video Filter Toggle */}
          <button
            id="control-btn-blur-desktop"
            onClick={handleToggleBackgroundBlur}
            title={isBackgroundBlurred ? "Disable Background Blur" : "Blur Video Background"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isBackgroundBlurred
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30 ring-2 ring-cyan-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </button>

          {/* Virtual Background Selector Button */}
          <button
            id="control-btn-virtual-bg-desktop"
            onClick={() => setIsSettingsOpen(true)}
            title={virtualBackground !== 'none' ? `Virtual Background Active (Click to Change)` : "Choose Virtual Background Backdrop"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              virtualBackground !== 'none'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Noise Cancellation / High Quality Audio Toggle */}
          <button
            id="control-btn-noise-suppression"
            onClick={handleToggleNoiseSuppression}
            title={isNoiseSuppression ? "Studio Noise Cancellation: Active" : "Noise Cancellation: Off"}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center ${
              isNoiseSuppression
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
            }`}
          >
            <Radio className="w-5 h-5" />
          </button>

          {/* In-Call Chat Drawer Toggle */}
          <button
            id="control-btn-chat-desktop"
            onClick={handleToggleChat}
            title="In-Call Chat & Reactions"
            className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
              isSidebarOpen && sidebarTab === 'chat'
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white ring-2 ring-slate-900 animate-pulse">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>

          {/* Floating Reaction Menu and Toggle Button */}
          <div className="relative">
            <button
              id="control-btn-reactions"
              onClick={() => setShowReactionMenu(!showReactionMenu)}
              title="Reactions (Thumbs Up, Heart, Party Popper...)"
              className={`p-3.5 sm:p-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center relative ${
                showReactionMenu
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 ring-2 ring-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-600'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>

            <ReactionMenu
              isOpen={showReactionMenu}
              onClose={() => setShowReactionMenu(false)}
              onSendReaction={handleSendReaction}
            />
          </div>

          {/* Call Settings */}
          <button
            id="control-btn-settings"
            onClick={() => setIsSettingsOpen(true)}
            title="Audio & Video Settings"
            className="p-3.5 sm:p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition shadow-md cursor-pointer flex items-center justify-center"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* End / Leave Call */}
          <button
            id="control-btn-leave-desktop"
            onClick={leaveCall}
            title="Leave Call"
            className="px-5 sm:px-6 py-3.5 sm:py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-all shadow-lg hover:shadow-rose-600/30 active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-semibold">Leave Call</span>
          </button>
        </div>
      </footer>

      {/* Call Settings Modal */}
      <CallSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        roomId={room.id}
        roomTitle={room.title}
        isBlurred={isBackgroundBlurred}
        onToggleBlur={handleToggleBackgroundBlur}
        virtualBackground={virtualBackground}
        onChangeVirtualBackground={(bg) => setVirtualBackground(bg)}
        isNoiseSuppression={isNoiseSuppression}
        onToggleNoiseSuppression={handleToggleNoiseSuppression}
      />

      {/* Report User Modal */}
      {reportingTarget && (
        <ReportUserModal
          isOpen={!!reportingTarget}
          onClose={() => setReportingTarget(null)}
          targetUser={reportingTarget}
          roomId={room.id}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
