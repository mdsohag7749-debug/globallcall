import { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Code2, 
  Layers, 
  ExternalLink, 
  FileCode, 
  Sparkles,
  Info
} from 'lucide-react';

interface RoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFeature?: (featureId: string) => void;
}

type Priority = 'must_build' | 'improve_ux' | 'new_feature' | 'optional_polish';

interface RoadmapItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Rooms' | 'Moderation' | 'User features' | 'Call features' | 'Admin panel extras';
  priority: Priority;
  files: string[];
  description: string;
  codeSnippet: string;
}

const ROADMAP_ITEMS: RoadmapItem[] = [
  // 1. Rooms
  {
    id: 'password_rooms',
    title: 'Password rooms',
    subtitle: 'Private = pass needed',
    category: 'Rooms',
    priority: 'must_build',
    files: ['src/components/CallLobby.tsx', 'src/types.ts'],
    description: 'Rooms can be password-protected upon creation. Callers must enter the correct password before being admitted.',
    codeSnippet: `// CallLobby.tsx: Room password validation
if (selectedRoom.isPasswordProtected && selectedRoom.password !== enteredPassword) {
  setPasswordError('ভুল Password! সঠিক পাসওয়ার্ড দিন।');
  return;
}`
  },
  {
    id: 'public_private_toggle',
    title: 'Public / private toggle',
    subtitle: 'Lobby-তে private hidden',
    category: 'Rooms',
    priority: 'must_build',
    files: ['src/components/CallLobby.tsx', 'src/types.ts'],
    description: 'Private rooms are excluded from the public lobby room list and only accessible with the exact Room ID or direct invite link.',
    codeSnippet: `// CallLobby.tsx: Filter out private rooms from lobby list
const isHidden = room.isPrivate && !searchQuery.toLowerCase().includes(room.id.toLowerCase());
if (isHidden) return false;`
  },
  {
    id: 'auto_close',
    title: 'Auto-close (5 min)',
    subtitle: 'Empty room → delete',
    category: 'Rooms',
    priority: 'must_build',
    files: ['src/components/CallLobby.tsx', 'src/hooks/useCallRoom.ts'],
    description: 'Rooms with 0 participants track an emptySince timestamp. Empty custom rooms older than 5 minutes are automatically purged from Firestore.',
    codeSnippet: `// Automatically close rooms empty for > 5 minutes
if (participantsCount === 0 && Date.now() - roomCreatedAt > 5 * 60 * 1000) {
  await deleteDoc(doc(db, 'rooms', room.id));
}`
  },
  {
    id: 'official_tag',
    title: 'Official tag',
    subtitle: 'Admin verified badge',
    category: 'Rooms',
    priority: 'must_build',
    files: ['src/components/CallLobby.tsx', 'src/types.ts'],
    description: 'Admin and system created rooms display an official badge with verified checkmark and distinctive border.',
    codeSnippet: `{room.isOfficial && (
  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
    <ShieldCheck className="w-3 h-3" /> Official
  </span>
)}`
  },
  {
    id: 'participant_limit',
    title: 'Participant limit',
    subtitle: 'Max users per room',
    category: 'Rooms',
    priority: 'improve_ux',
    files: ['src/components/CallLobby.tsx', 'src/types.ts'],
    description: 'Room creators can configure max participants (2, 4, 8, 16, or unlimited). Excess joiners receive a room full notification.',
    codeSnippet: `if (room.participantLimit && currentParticipants >= room.participantLimit) {
  setJoinError(\`এই Room টি পূর্ণ (\${room.participantLimit}/\${room.participantLimit})।\`);
  return;
}`
  },
  {
    id: 'pinned_rooms',
    title: 'Pinned rooms',
    subtitle: 'Official rooms top-এ',
    category: 'Rooms',
    priority: 'improve_ux',
    files: ['src/components/CallLobby.tsx'],
    description: 'Pinned/featured rooms are prioritized and sorted at the very top of the lobby room feed with prominent spotlight borders.',
    codeSnippet: `// Sort pinned rooms first
rooms.sort((a, b) => {
  if (a.isPinned && !b.isPinned) return -1;
  if (!a.isPinned && b.isPinned) return 1;
  return 0;
});`
  },

  // 2. Moderation
  {
    id: 'owner_kick_mute_ban',
    title: 'Owner kick/mute/ban',
    subtitle: "নিজের room-এ control",
    category: 'Moderation',
    priority: 'must_build',
    files: ['src/components/CallSidebar.tsx', 'src/components/VideoTile.tsx'],
    description: 'Room hosts have complete authority to kick callers, remotely mute microphone, or ban them from re-entering.',
    codeSnippet: `// CallSidebar.tsx: Host moderation actions
const handleHostMute = async (targetUid: string) => {
  await setDoc(doc(db, 'rooms', roomId, 'participants', targetUid), { isMutedByHost: true }, { merge: true });
};`
  },
  {
    id: 'permission_guard',
    title: 'Permission guard',
    subtitle: "Others' room = no control",
    category: 'Moderation',
    priority: 'must_build',
    files: ['src/components/CallSidebar.tsx', 'src/lib/firebase.ts'],
    description: 'Strict client & Firestore validation ensuring regular callers cannot kick, ban, or mute others in rooms they do not own.',
    codeSnippet: `const canModerate = (isCurrentUserAdmin || isCurrentUserHost) && !isMe;
// If not host or admin, moderation UI buttons are completely hidden`
  },
  {
    id: 'report_user',
    title: 'Report user',
    subtitle: 'Flag bad behavior',
    category: 'Moderation',
    priority: 'improve_ux',
    files: ['src/components/ReportUserModal.tsx'],
    description: 'Callers can flag toxic behavior, audio disruption, inappropriate video, or spam to system administrators.',
    codeSnippet: `await addDoc(collection(db, 'reports'), {
  reporterId: currentUser.uid,
  reportedUserId: targetUser.uid,
  reason, details, createdAt: new Date().toISOString()
});`
  },
  {
    id: 'auto_ban_audit',
    title: 'Auto-ban + audit log',
    subtitle: 'Bad action → log/ban',
    category: 'Moderation',
    priority: 'improve_ux',
    files: ['src/lib/moderation.ts', 'src/components/AdminPanel.tsx'],
    description: 'All kicks, bans, mutes, and user reports are written to the auditLogs collection and viewable by admins.',
    codeSnippet: `await logAuditEvent({
  action: 'ban',
  actorId: currentUser.uid,
  targetId: targetUser.uid,
  roomId
});`
  },
  {
    id: 'temp_mute_ban',
    title: 'Temp mute/ban',
    subtitle: 'X min-এর জন্য',
    category: 'Moderation',
    priority: 'improve_ux',
    files: ['src/lib/moderation.ts', 'src/components/CallSidebar.tsx'],
    description: 'Supports temporary bans for 5 minutes, 15 minutes, or 1 hour with automatic expiration tracking.',
    codeSnippet: `const bannedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
await setDoc(doc(db, 'users', targetUid), { isBanned: true, bannedUntil }, { merge: true });`
  },
  {
    id: 'word_filter',
    title: 'Word filter / spam',
    subtitle: 'Chat auto-filter',
    category: 'Moderation',
    priority: 'optional_polish',
    files: ['src/lib/moderation.ts', 'src/components/CallChat.tsx'],
    description: 'Real-time censorship of profanity and automated rate-limiting to block chat spam flooding.',
    codeSnippet: `const { cleanText } = censorText(inputText);
const { isSpam, reason } = checkSpamRate(currentUser.uid);
if (isSpam) { alert(reason); return; }`
  },

  // 3. User Features
  {
    id: 'online_presence',
    title: 'Online presence',
    subtitle: '🟢 Online / ⚫ Offline',
    category: 'User features',
    priority: 'new_feature',
    files: ['src/types.ts', 'src/lib/firebase.ts', 'src/components/CallLobby.tsx'],
    description: 'Real-time user presence tracking with green (online), amber (in-call), and gray (offline) status indicators.',
    codeSnippet: `await setDoc(doc(db, 'users', uid), {
  status: 'online',
  updatedAt: new Date().toISOString()
}, { merge: true });`
  },
  {
    id: 'user_profile_page',
    title: 'User profile page',
    subtitle: 'Avatar, bio, call history',
    category: 'User features',
    priority: 'new_feature',
    files: ['src/components/UserProfileModal.tsx'],
    description: 'Dedicated user profile modal to edit bio, manage avatar seed, view earned badges, and review call history.',
    codeSnippet: `<UserProfileModal
  isOpen={isProfileOpen}
  currentUser={currentUser}
  onUpdateProfile={handleProfileUpdate}
/>`
  },
  {
    id: 'badges_system',
    title: 'Badges system',
    subtitle: 'Official, active, verified',
    category: 'User features',
    priority: 'new_feature',
    files: ['src/components/UserProfileModal.tsx', 'src/components/VideoTile.tsx'],
    description: 'Visual achievement badges: Official (Admins), Active (5+ calls joined), and Verified User status.',
    codeSnippet: `// Badges rendered beside username in video tiles and lobby
{isOfficial && <ShieldCheck className="w-3 h-3 text-amber-400" />}
{isActive && <Zap className="w-3 h-3 text-cyan-400" />}`
  },
  {
    id: 'activity_stats',
    title: 'Activity stats',
    subtitle: 'Call time, rooms joined',
    category: 'User features',
    priority: 'optional_polish',
    files: ['src/components/UserProfileModal.tsx', 'src/types.ts'],
    description: 'Tracks total minutes spent on WebRTC calls and count of rooms joined in the caller profile.',
    codeSnippet: `<span className="text-2xl font-black">{totalCallMinutes}m</span>
<p className="text-xs text-slate-400">Total Call Time</p>`
  },
  {
    id: 'friend_list_dm',
    title: 'Friend list / DM',
    subtitle: 'Direct message + add',
    category: 'User features',
    priority: 'optional_polish',
    files: ['src/components/FriendsModal.tsx'],
    description: 'Add peers by username/UID, view their online status, send 1-on-1 direct messages, and invite them to rooms.',
    codeSnippet: `await addDoc(collection(db, 'directMessages'), {
  senderId: currentUser.uid,
  receiverId: friend.uid,
  text
});`
  },
  {
    id: 'custom_status',
    title: 'Custom status',
    subtitle: '"In meeting", "BRB" etc.',
    category: 'User features',
    priority: 'optional_polish',
    files: ['src/components/UserProfileModal.tsx'],
    description: 'Set custom status messages with emojis like "In meeting", "BRB ☕", "Focus mode 🎧" displayed on your profile.',
    codeSnippet: `<div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-xs">
  {user.customStatus || 'Available to chat'}
</div>`
  },

  // 4. Call Features
  {
    id: 'raise_hand',
    title: 'Raise hand ✋',
    subtitle: 'Meeting-style',
    category: 'Call features',
    priority: 'improve_ux',
    files: ['src/components/CallRoom.tsx', 'src/components/VideoTile.tsx'],
    description: 'Callers can raise their hand to politely request to speak; shows animated glowing hand badge and chime sound.',
    codeSnippet: `// Toggle raised hand state in Firestore
await setDoc(doc(db, 'rooms', roomId, 'participants', currentUser.uid), {
  raisedHand: !isHandRaised,
  raisedHandAt: new Date().toISOString()
}, { merge: true });`
  },
  {
    id: 'invite_link_share',
    title: 'Invite link share',
    subtitle: '?room=id copy button',
    category: 'Call features',
    priority: 'new_feature',
    files: ['src/components/CallRoom.tsx', 'src/components/CallSidebar.tsx'],
    description: 'Instant 1-click invite link copying, with Web Share API fallback and notification toast.',
    codeSnippet: `const inviteUrl = \`\${window.location.origin}/?room=\${room.id}\`;
navigator.clipboard.writeText(inviteUrl);`
  },
  {
    id: 'background_blur',
    title: 'Background blur',
    subtitle: 'Video filter',
    category: 'Call features',
    priority: 'optional_polish',
    files: ['src/components/CallRoom.tsx'],
    description: 'Real-time camera background blur toggle applied directly to the video element and stream canvas.',
    codeSnippet: `// Apply canvas backdrop blur filter
canvasContext.filter = isBlurred ? 'blur(12px)' : 'none';`
  },
  {
    id: 'noise_cancellation',
    title: 'Noise cancellation',
    subtitle: 'Audio quality boost',
    category: 'Call features',
    priority: 'optional_polish',
    files: ['src/components/CallRoom.tsx', 'src/components/CallSettingsModal.tsx'],
    description: 'High-grade WebRTC audio constraints: echoCancellation, noiseSuppression, and autoGainControl filters.',
    codeSnippet: `const audioConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};`
  },
  {
    id: 'call_recording',
    title: 'Call recording',
    subtitle: 'Local save',
    category: 'Call features',
    priority: 'optional_polish',
    files: ['src/lib/recording.ts', 'src/components/CallRoom.tsx'],
    description: 'In-browser MediaRecorder recording video/audio streams with automatic local .webm file download upon stopping.',
    codeSnippet: `const recorder = new CallRecorder((secs) => setRecordingSeconds(secs));
recorder.start(stream); // Records and saves to user machine on stop`
  },
  {
    id: 'virtual_background',
    title: 'Virtual background',
    subtitle: 'Custom image',
    category: 'Call features',
    priority: 'optional_polish',
    files: ['src/components/CallRoom.tsx'],
    description: 'Custom virtual backdrop options: Studio, Modern Office, Cyberpunk, and Nature environments.',
    codeSnippet: `// Swap webcam backdrop with selected virtual background preset
setVirtualBackground('office' | 'cyberpunk' | 'studio');`
  },

  // 5. Admin Panel Extras
  {
    id: 'announcement_banner',
    title: 'Announcement banner',
    subtitle: 'Lobby-তে broadcast',
    category: 'Admin panel extras',
    priority: 'new_feature',
    files: ['src/components/CallLobby.tsx', 'src/components/AdminPanel.tsx'],
    description: 'Admins can publish global broadcast announcements displayed at the top of the lobby for all connected users.',
    codeSnippet: `// Live Firestore snapshot for active announcements
onSnapshot(collection(db, 'announcements'), (snap) => {
  setAnnouncements(snap.docs.map(d => d.data()));
});`
  },
  {
    id: 'ban_list_panel',
    title: 'Ban list panel',
    subtitle: 'Manage banned users',
    category: 'Admin panel extras',
    priority: 'new_feature',
    files: ['src/components/AdminPanel.tsx'],
    description: 'Dedicated admin tab to view all banned callers, check reasons and expiration timestamps, and unban with 1 click.',
    codeSnippet: `// AdminPanel.tsx: Unban user
await setDoc(doc(db, 'users', targetUid), { isBanned: false, bannedUntil: null }, { merge: true });`
  },
  {
    id: 'dark_light_mode',
    title: 'Dark / light mode',
    subtitle: 'UI theme toggle',
    category: 'Admin panel extras',
    priority: 'optional_polish',
    files: ['src/components/CallLobby.tsx', 'src/index.css'],
    description: 'Clean dark / light theme switcher toggle in the lobby header and settings with local storage persistence.',
    codeSnippet: `const toggleTheme = () => {
  setTheme(prev => prev === 'dark' ? 'light' : 'dark');
};`
  }
];

export default function RoadmapModal({
  isOpen,
  onClose
}: RoadmapModalProps) {
  const [selectedItem, setSelectedItem] = useState<RoadmapItem>(ROADMAP_ITEMS[0]);
  const [filterCategory, setFilterCategory] = useState<string>('All');

  if (!isOpen) return null;

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'must_build':
        return {
          label: 'Must build (diagram-এ আছে)',
          cardBg: 'bg-rose-950/25 hover:bg-rose-950/40 border-rose-500/40 text-rose-300',
          dotBg: 'bg-rose-500'
        };
      case 'improve_ux':
        return {
          label: 'Improve UX',
          cardBg: 'bg-amber-950/25 hover:bg-amber-950/40 border-amber-500/40 text-amber-300',
          dotBg: 'bg-amber-500'
        };
      case 'new_feature':
        return {
          label: 'New feature',
          cardBg: 'bg-blue-950/25 hover:bg-blue-950/40 border-blue-500/40 text-blue-300',
          dotBg: 'bg-blue-500'
        };
      case 'optional_polish':
        return {
          label: 'Optional/polish',
          cardBg: 'bg-emerald-950/25 hover:bg-emerald-950/40 border-emerald-500/40 text-emerald-300',
          dotBg: 'bg-emerald-500'
        };
    }
  };

  const categories = ['All', 'Rooms', 'Moderation', 'User features', 'Call features', 'Admin panel extras'];

  const filteredItems = filterCategory === 'All' 
    ? ROADMAP_ITEMS 
    : ROADMAP_ITEMS.filter(item => item.category === filterCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-5xl bg-[#090d1a] border border-white/[0.12] rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-slate-900/80 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-white">GlobalCall — Full Feature Roadmap</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> All 27 Implemented
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <span>👉 যেকোনো feature-এ click করলে সেটার code ও details পাবে</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend strip */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-rose-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Must build (diagram-এ আছে)
            </span>
            <span className="flex items-center gap-1.5 text-amber-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Improve UX
            </span>
            <span className="flex items-center gap-1.5 text-blue-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> New feature
            </span>
            <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Optional/polish
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                  filterCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Main Grid & Code Inspector */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Interactive Roadmap Nodes */}
          <div className="w-full md:w-7/12 overflow-y-auto p-4 space-y-4 border-r border-white/[0.08] bg-slate-950/30">
            {(['Rooms', 'Moderation', 'User features', 'Call features', 'Admin panel extras'] as const).map(categoryName => {
              const itemsInCategory = filteredItems.filter(item => item.category === categoryName);
              if (itemsInCategory.length === 0) return null;

              const categoryIcons: Record<string, string> = {
                'Rooms': '🏠 Rooms',
                'Moderation': '🛡️ Moderation',
                'User features': '👤 User features',
                'Call features': '📞 Call features',
                'Admin panel extras': '⚙️ Admin panel extras'
              };

              return (
                <div key={categoryName} className="space-y-2">
                  <div className="px-3 py-1 rounded-xl bg-slate-900/80 border border-white/[0.06] text-xs font-bold text-slate-200 text-center uppercase tracking-wider">
                    {categoryIcons[categoryName]}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {itemsInCategory.map(item => {
                      const badgeInfo = getPriorityBadge(item.priority);
                      const isSelected = selectedItem.id === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${badgeInfo.cardBg} ${
                            isSelected
                              ? 'ring-2 ring-white shadow-xl scale-[1.01]'
                              : 'opacity-90 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-xs text-white leading-tight">
                              {item.title}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${badgeInfo.dotBg} shrink-0 mt-0.5`} />
                          </div>
                          <p className="text-[11px] opacity-80 mt-1 font-medium leading-tight">
                            {item.subtitle}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Code & Architecture Inspector Drawer */}
          <div className="w-full md:w-5/12 flex flex-col bg-slate-900/60 p-5 overflow-y-auto text-slate-200 space-y-4">
            <div className="border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedItem.category}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Live & Operational
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">{selectedItem.title}</h3>
              <p className="text-xs text-indigo-300 font-medium">{selectedItem.subtitle}</p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                Feature Description
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-white/[0.06]">
                {selectedItem.description}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                Source Files
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.files.map(f => (
                  <span key={f} className="text-[11px] font-mono px-2 py-1 rounded-lg bg-slate-950 border border-white/[0.08] text-slate-300">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                Implementation Code
              </h4>
              <pre className="flex-1 p-3 bg-slate-950 rounded-2xl border border-white/[0.08] text-[11px] font-mono text-cyan-300 overflow-x-auto leading-relaxed">
                <code>{selectedItem.codeSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
