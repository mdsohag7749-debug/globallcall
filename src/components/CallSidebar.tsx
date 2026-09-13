import { useState, useMemo } from 'react';
import { 
  X, 
  Users, 
  MessageSquare, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Pin, 
  PinOff, 
  Shield, 
  Crown, 
  Monitor, 
  Search, 
  Copy, 
  Check, 
  UserMinus, 
  Volume2, 
  VolumeX,
  Radio,
  Share2,
  Ban,
  Flag,
  Clock
} from 'lucide-react';
import { 
  doc, 
  deleteDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { db, checkIsAdmin } from '../lib/firebase';
import { logAuditEvent } from '../lib/moderation';
import { Participant, UserProfile, ChatMessage, CallRoom as RoomType } from '../types';
import CallChat from './CallChat';

interface CallSidebarProps {
  room: RoomType;
  currentUser: UserProfile;
  participants: Participant[];
  isLocalSpeaking?: boolean;
  activeSpeakerId?: string | null;
  isAudioMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  pinnedUid?: string | null;
  onTogglePin?: (uid: string) => void;
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'participants' | 'chat';
  setActiveTab: (tab: 'participants' | 'chat') => void;
  onSendReaction: (emoji: string) => void;
  chatMessageCount?: number;
  onChatMessageCountChange?: (count: number) => void;
  onNewChatMessage?: (msg: ChatMessage) => void;
  onReportUser?: (p: Participant) => void;
}

const QUICK_EMOJIS = ['👋', '👏', '❤️', '🔥', '😂', '🎉', '👍', '🚀'];

export default function CallSidebar({
  room,
  currentUser,
  participants,
  isLocalSpeaking = false,
  activeSpeakerId = null,
  isAudioMuted = false,
  isVideoOff = false,
  isScreenSharing = false,
  pinnedUid = null,
  onTogglePin,
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  onSendReaction,
  chatMessageCount = 0,
  onChatMessageCountChange,
  onNewChatMessage
}: CallSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isCurrentUserAdmin = checkIsAdmin(currentUser);
  const isCurrentUserHost = room.createdBy === currentUser.uid;

  // Merge full connected users list (Ensures local user is always represented with up-to-date states)
  const allConnectedUsers = useMemo(() => {
    const list: Participant[] = [];

    // Local user always at the top
    list.push({
      uid: currentUser.uid,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      isAudioMuted,
      isVideoOff,
      isScreenSharing,
      isSpeaking: isLocalSpeaking,
      joinedAt: new Date().toISOString()
    });

    // Remote participants
    participants.forEach((p) => {
      if (p.uid !== currentUser.uid) {
        list.push({
          ...p,
          isSpeaking: activeSpeakerId === p.uid && !p.isAudioMuted
        });
      }
    });

    return list;
  }, [currentUser, participants, isAudioMuted, isVideoOff, isScreenSharing, isLocalSpeaking, activeSpeakerId]);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return allConnectedUsers;
    const q = searchQuery.toLowerCase().trim();
    return allConnectedUsers.filter((u) => 
      u.displayName.toLowerCase().includes(q) || 
      u.uid.toLowerCase().includes(q)
    );
  }, [allConnectedUsers, searchQuery]);

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/?room=${room.id}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleToggleHostMute = async (targetUser: Participant) => {
    try {
      const nextMuted = !targetUser.isMutedByHost;
      await setDoc(doc(db, 'rooms', room.id, 'participants', targetUser.uid), {
        isMutedByHost: nextMuted
      }, { merge: true });
      await logAuditEvent({
        action: 'mute',
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        targetId: targetUser.uid,
        targetName: targetUser.displayName,
        roomId: room.id,
        details: nextMuted ? 'Host remotely muted user' : 'Host unmuted user'
      });
      setActionNotice(`${targetUser.displayName} was ${nextMuted ? 'muted' : 'unmuted'} by host.`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    }
  };

  const handleBanParticipant = async (targetUser: Participant, durationMinutes?: number) => {
    if (targetUser.uid === currentUser.uid) return;
    const isTemp = typeof durationMinutes === 'number' && durationMinutes > 0;
    const confirmText = isTemp
      ? `Temporarily ban ${targetUser.displayName} for ${durationMinutes} minutes?`
      : `Permanently ban ${targetUser.displayName} from this room?`;

    if (!window.confirm(confirmText)) return;

    try {
      // 1. Add to room bannedUids
      await setDoc(doc(db, 'rooms', room.id), {
        bannedUids: arrayUnion(targetUser.uid)
      }, { merge: true });

      // 2. If temporary, set bannedUntil on user
      if (isTemp) {
        const bannedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        await setDoc(doc(db, 'users', targetUser.uid), {
          isBanned: true,
          bannedUntil,
          banReason: `Temp ban from room ${room.title} for ${durationMinutes}m`
        }, { merge: true });
      }

      // 3. Remove participant from active call
      await deleteDoc(doc(db, 'rooms', room.id, 'participants', targetUser.uid));

      // 4. Log audit event
      await logAuditEvent({
        action: isTemp ? 'temp_ban' : 'ban',
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        targetId: targetUser.uid,
        targetName: targetUser.displayName,
        roomId: room.id,
        details: isTemp ? `Temporary ban (${durationMinutes} mins)` : 'Permanent ban from room'
      });

      setActionNotice(`${targetUser.displayName} was banned ${isTemp ? `for ${durationMinutes}m` : 'from room'}.`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      console.error('Failed to ban participant:', err);
      setActionNotice(`Error: ${err.message}`);
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleRemoveParticipant = async (targetUser: Participant) => {
    if (targetUser.uid === currentUser.uid) return;
    
    if (!window.confirm(`Are you sure you want to disconnect ${targetUser.displayName} from this call?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'rooms', room.id, 'participants', targetUser.uid));
      await logAuditEvent({
        action: 'kick',
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        targetId: targetUser.uid,
        targetName: targetUser.displayName,
        roomId: room.id,
        details: 'User kicked from room'
      });
      setActionNotice(`${targetUser.displayName} was removed from the call.`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      console.error('Failed to remove participant:', err);
      setActionNotice(`Error: ${err.message}`);
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  return (
    <>
      {/* Backdrop overlay on mobile screens */}
      <div 
        id="call-sidebar-mobile-backdrop"
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Slide-out Sidebar Drawer */}
      <aside 
        id="call-sidebar-drawer"
        className={`fixed md:relative inset-y-0 right-0 z-40 w-full sm:w-88 md:w-96 bg-slate-900/95 border-l border-slate-800 flex flex-col h-[100dvh] md:h-full backdrop-blur-xl shadow-2xl transition-all duration-300 ease-in-out shrink-0 ${
          isOpen 
            ? 'translate-x-0 opacity-100 pointer-events-auto' 
            : 'translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-transparent pointer-events-none overflow-hidden'
        }`}
      >
        {/* Top Header & Tabs Bar */}
        <div className="p-3.5 border-b border-slate-800/90 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
            <button
              id="tab-participants-btn"
              onClick={() => setActiveTab('participants')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'participants'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Connected Users</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'participants' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {allConnectedUsers.length}
              </span>
            </button>
            <button
              id="tab-chat-btn"
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
              {chatMessageCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'chat' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  {chatMessageCount}
                </span>
              )}
            </button>
          </div>

          <button
            id="close-sidebar-drawer-btn"
            onClick={onClose}
            title="Close sidebar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action toast notification inside drawer */}
        {actionNotice && (
          <div className="mx-3 mt-3 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 animate-in fade-in duration-200 flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Connected Users Content */}
        {activeTab === 'participants' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Room Status Banner */}
            <div className="p-3.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-200">Active Call Room</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700/60">
                  ID: {room.id}
                </span>
              </div>

              {/* Search Bar for participants */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="search-participants-input"
                  type="text"
                  placeholder="Search connected callers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* List of Connected Users */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Callers in Room ({filteredUsers.length})</span>
                {pinnedUid && (
                  <button
                    onClick={() => onTogglePin && onTogglePin(pinnedUid)}
                    className="text-indigo-400 hover:text-indigo-300 lowercase font-normal flex items-center gap-1"
                  >
                    <PinOff className="w-3 h-3" /> unpin tile
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {filteredUsers.map((p) => {
                  const isMe = p.uid === currentUser.uid;
                  const isHost = room.createdBy === p.uid;
                  const isPinned = pinnedUid === p.uid;
                  const isSpeaking = p.isSpeaking;
                  const canModerate = (isCurrentUserAdmin || isCurrentUserHost) && !isMe;

                  return (
                    <div
                      key={p.uid}
                      className={`group p-3 rounded-2xl border transition-all ${
                        isSpeaking
                          ? 'bg-slate-800/80 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                          : isPinned
                            ? 'bg-slate-800/80 border-indigo-500/40'
                            : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        {/* Avatar & User Details */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            {p.photoURL ? (
                              <img
                                src={p.photoURL}
                                alt={p.displayName}
                                className={`w-9 h-9 rounded-full object-cover border ${
                                  isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-slate-700'
                                }`}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs border ${
                                isSpeaking ? 'bg-emerald-700 border-emerald-400 ring-2 ring-emerald-400/30' : 'bg-slate-800 border-slate-700'
                              }`}>
                                {p.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}

                            {/* Active pulse status ring */}
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                              isSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'
                            }`} />
                          </div>

                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-slate-200 truncate">
                                {p.displayName}
                              </p>
                              {isMe && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                  You
                                </span>
                              )}
                              {isHost && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                  <Crown className="w-2.5 h-2.5" /> Host
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              {isSpeaking ? (
                                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                                  <Radio className="w-2.5 h-2.5 animate-pulse" /> Speaking now
                                </span>
                              ) : p.raisedHand ? (
                                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                  <span>✋</span> Hand raised
                                </span>
                              ) : p.isScreenSharing ? (
                                <span className="text-[10px] text-blue-400 font-medium flex items-center gap-1">
                                  <Monitor className="w-2.5 h-2.5" /> Sharing screen
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  Connected
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Icons & Action Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Microphone indicator */}
                          <span
                            title={p.isAudioMuted ? 'Muted' : 'Microphone Active'}
                            className={`p-1.5 rounded-lg text-xs ${
                              p.isAudioMuted
                                ? 'text-rose-400 bg-rose-950/40 border border-rose-900/40'
                                : isSpeaking
                                  ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-700/50 animate-pulse'
                                  : 'text-emerald-400 bg-emerald-950/40 border border-emerald-900/40'
                            }`}
                          >
                            {p.isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                          </span>

                          {/* Camera indicator */}
                          <span
                            title={p.isVideoOff ? 'Camera Off' : 'Camera On'}
                            className={`p-1.5 rounded-lg text-xs ${
                              p.isVideoOff
                                ? 'text-rose-400 bg-rose-950/40 border border-rose-900/40'
                                : 'text-emerald-400 bg-emerald-950/40 border border-emerald-900/40'
                            }`}
                          >
                            {p.isVideoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                          </span>

                          {/* Pin / Spotlight action */}
                          {onTogglePin && (
                            <button
                              onClick={() => onTogglePin(p.uid)}
                              title={isPinned ? 'Unpin video' : 'Pin video to spotlight'}
                              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                                isPinned
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                            >
                              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {/* Report User action */}
                          {!isMe && onReportUser && (
                            <button
                              onClick={() => onReportUser(p)}
                              title={`Report ${p.displayName}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Host Moderation: Remote Mute */}
                          {canModerate && (
                            <button
                              onClick={() => handleToggleHostMute(p)}
                              title={p.isMutedByHost ? "Unmute user" : "Mute user remotely"}
                              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                                p.isMutedByHost
                                  ? 'bg-amber-600 text-white'
                                  : 'text-slate-400 hover:text-amber-400 hover:bg-amber-950/40'
                              }`}
                            >
                              {p.isMutedByHost ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {/* Host Moderation: Kick */}
                          {canModerate && (
                            <button
                              onClick={() => handleRemoveParticipant(p)}
                              title={`Kick ${p.displayName} from call`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Host Moderation: Ban (with temp options) */}
                          {canModerate && (
                            <button
                              onClick={() => {
                                const choice = window.prompt(
                                  `Ban ${p.displayName}?\nType '5' for 5 mins, '60' for 1 hour, or 'perm' for permanent ban:`,
                                  '5'
                                );
                                if (choice === '5') handleBanParticipant(p, 5);
                                else if (choice === '60') handleBanParticipant(p, 60);
                                else if (choice === 'perm') handleBanParticipant(p);
                              }}
                              title={`Ban ${p.displayName} from room`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-950/50 transition cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    <p>No participants match "{searchQuery}"</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-indigo-400 hover:text-indigo-300 font-medium underline"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Invite & Share Section */}
            <div className="p-3.5 bg-slate-950/60 border-t border-slate-800/80 shrink-0">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                    Invite Peers to this Room
                  </span>
                  <span className="text-[10px] text-slate-500">Live link</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400 font-mono truncate">
                    {window.location.origin}/?room={room.id}
                  </div>
                  <button
                    id="btn-copy-drawer-invite"
                    onClick={handleCopyInviteLink}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: In-Call Chat Content */}
        {activeTab === 'chat' && (
          <CallChat
            roomId={room.id}
            roomTitle={room.title}
            roomHostId={room.createdBy}
            currentUser={currentUser}
            isOpen={isOpen && activeTab === 'chat'}
            onSendReaction={onSendReaction}
            onClose={onClose}
            onMessageCountChange={onChatMessageCountChange}
            onNewMessage={onNewChatMessage}
          />
        )}
      </aside>
    </>
  );
}
