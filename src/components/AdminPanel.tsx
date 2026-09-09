import { useState, useEffect, FormEvent } from 'react';
import { 
  Shield, 
  Users, 
  Video, 
  Trash2, 
  UserCheck, 
  UserX, 
  Search, 
  Radio, 
  Sparkles, 
  ArrowLeft, 
  Plus, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Mail,
  Clock,
  ExternalLink,
  Crown
} from 'lucide-react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, checkIsAdmin } from '../lib/firebase';
import { UserProfile, CallRoom as RoomType } from '../types';

interface AdminPanelProps {
  currentUser: UserProfile | null;
  onBackToLobby: () => void;
  onJoinRoom: (room: RoomType) => void;
  onOpenAuth: () => void;
}

export default function AdminPanel({
  currentUser,
  onBackToLobby,
  onJoinRoom,
  onOpenAuth
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rooms' | 'announcements'>('overview');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomType, setNewRoomType] = useState<'video_audio' | 'audio_only'>('video_audio');
  const [isGlobalFeatured, setIsGlobalFeatured] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementRoomId, setAnnouncementRoomId] = useState<string>('all');
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = checkIsAdmin(currentUser);

  // Sync users list from Firestore
  useEffect(() => {
    if (!isAdmin) return;

    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(
      usersCol,
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as UserProfile);
        });
        // Sort admins first, then newest
        list.sort((a, b) => {
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (b.role === 'admin' && a.role !== 'admin') return 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        setUsers(list);
      },
      (err) => {
        console.warn('Admin users sync error:', err);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  // Sync rooms list from Firestore
  useEffect(() => {
    if (!isAdmin) return;

    const roomsCol = collection(db, 'rooms');
    const unsub = onSnapshot(
      roomsCol,
      (snapshot) => {
        const list: RoomType[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        setRooms(list);
      },
      (err) => {
        console.warn('Admin rooms sync error:', err);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  // Listen to participant counts per room
  useEffect(() => {
    if (!isAdmin || rooms.length === 0) return;

    const unsubs: (() => void)[] = [];
    rooms.forEach((r) => {
      const participantsCol = collection(db, 'rooms', r.id, 'participants');
      const u = onSnapshot(
        participantsCol,
        (snap) => {
          setParticipantCounts((prev) => ({
            ...prev,
            [r.id]: snap.size
          }));
        },
        (err) => {
          console.warn(`Participant listener error for room ${r.id}:`, err);
        }
      );
      unsubs.push(u);
    });

    return () => unsubs.forEach((u) => u());
  }, [isAdmin, rooms]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => {
      setActionMessage(null);
    }, 4000);
  };

  const handleToggleUserRole = async (targetUser: UserProfile) => {
    try {
      const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
      await setDoc(doc(db, 'users', targetUser.uid), { role: newRole }, { merge: true });
      showNotification('success', `User ${targetUser.displayName} role updated to ${newRole.toUpperCase()}.`);
    } catch (err: any) {
      showNotification('error', `Failed to update role: ${err.message}`);
    }
  };

  const handleDeleteUser = async (targetUser: UserProfile) => {
    if (!window.confirm(`Are you sure you want to remove user "${targetUser.displayName}" from the database?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', targetUser.uid));
      showNotification('success', `User ${targetUser.displayName} removed.`);
    } catch (err: any) {
      showNotification('error', `Failed to delete user: ${err.message}`);
    }
  };

  const handleDeleteRoom = async (room: RoomType) => {
    if (!window.confirm(`Are you sure you want to close and delete room "${room.title}"?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'rooms', room.id));
      showNotification('success', `Room "${room.title}" closed and deleted.`);
    } catch (err: any) {
      showNotification('error', `Failed to delete room: ${err.message}`);
    }
  };

  const handleCreateAdminRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) return;

    try {
      const roomId = `admin-${Date.now().toString(36)}`;
      const roomData = {
        title: newRoomTitle.trim(),
        description: newRoomDesc.trim() || 'Official room created by Administrator',
        createdBy: currentUser?.uid || 'admin',
        createdByName: currentUser?.displayName || 'Admin',
        callType: newRoomType,
        isGlobal: isGlobalFeatured,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rooms', roomId), roomData);
      setNewRoomTitle('');
      setNewRoomDesc('');
      setIsCreatingRoom(false);
      showNotification('success', `Room "${roomData.title}" created successfully!`);
    } catch (err: any) {
      showNotification('error', `Failed to create room: ${err.message}`);
    }
  };

  const handleSendBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim()) return;

    try {
      const targetRooms = announcementRoomId === 'all' 
        ? rooms 
        : rooms.filter(r => r.id === announcementRoomId);

      const msgPromises = targetRooms.map(r => {
        return addDoc(collection(db, 'rooms', r.id, 'messages'), {
          senderId: currentUser?.uid || 'system-admin',
          senderName: `📢 ADMIN (${currentUser?.displayName || 'System'})`,
          text: `🔔 [ANNOUNCEMENT]: ${announcementText.trim()}`,
          type: 'text',
          createdAt: serverTimestamp()
        });
      });

      await Promise.all(msgPromises);
      setAnnouncementText('');
      setBroadcastSuccess(`Announcement sent to ${targetRooms.length} room(s)!`);
      setTimeout(() => setBroadcastSuccess(null), 4000);
      showNotification('success', 'Broadcast published to active rooms.');
    } catch (err: any) {
      showNotification('error', `Failed to broadcast: ${err.message}`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalOnlineParticipants = (Object.values(participantCounts) as number[]).reduce((a: number, b: number) => a + b, 0);

  // Non-Admin Screen
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Admin Panel Access</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            This area is restricted to administrators. The designated administrator email is{' '}
            <span className="text-indigo-400 font-mono font-semibold">mdsohag7749@gmail.com</span>.
          </p>

          {currentUser ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Signed in as:</p>
              <p className="text-sm font-medium text-white truncate">{currentUser.displayName}</p>
              <p className="text-xs text-slate-400 truncate">{currentUser.email || 'No email attached (Guest)'}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-3 h-3" /> Not an administrator
              </div>
            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 text-sm text-slate-400">
              You are not signed in. Please sign in with an administrator account to continue.
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              id="admin-switch-account-btn"
              onClick={onOpenAuth}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Sign in with mdsohag7749@gmail.com
            </button>
            <button
              id="admin-return-lobby-btn"
              onClick={onBackToLobby}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Call Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="admin-back-btn"
              onClick={onBackToLobby}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Back to Lobby"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-lg text-white">Administrator Control Panel</h1>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Admin Verified
                  </span>
                </div>
                <p className="text-xs text-slate-400">System management, users, active call rooms & broadcast</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">Logged in as:</span>
              <span className="font-semibold text-white">{currentUser?.email || currentUser?.displayName}</span>
            </div>
            <button
              id="admin-view-lobby-top-btn"
              onClick={onBackToLobby}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition flex items-center gap-1.5"
            >
              <Video className="w-4 h-4 text-indigo-400" />
              Open Call Lobby
            </button>
          </div>
        </div>
      </header>

      {/* Action notification toast */}
      {actionMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-medium border ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200' 
              : 'bg-rose-950/90 border-rose-800 text-rose-200'
          }`}>
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <button
              id="admin-tab-overview"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Radio className="w-4 h-4" />
              Overview & Stats
            </button>
            <button
              id="admin-tab-users"
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              Users ({users.length})
            </button>
            <button
              id="admin-tab-rooms"
              onClick={() => setActiveTab('rooms')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'rooms'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Video className="w-4 h-4" />
              Call Rooms ({rooms.length})
            </button>
            <button
              id="admin-tab-announcements"
              onClick={() => setActiveTab('announcements')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                activeTab === 'announcements'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Broadcast Notification
            </button>
          </div>

          {activeTab === 'rooms' && (
            <button
              id="admin-new-room-btn"
              onClick={() => setIsCreatingRoom(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Official Room
            </button>
          )}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Users</span>
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">{users.length}</div>
                <p className="text-xs text-slate-500 mt-1">Registered in Firestore</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Rooms</span>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">{rooms.length}</div>
                <p className="text-xs text-slate-500 mt-1">Live call channels</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Callers Connected</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Radio className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-emerald-400">{totalOnlineParticipants}</div>
                <p className="text-xs text-slate-500 mt-1">Real-time peers in calls</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Primary Admin</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-sm font-bold text-amber-300 truncate">mdsohag7749@gmail.com</div>
                <p className="text-xs text-slate-500 mt-1">Root Superadmin</p>
              </div>
            </div>

            {/* Quick Admin Actions & Active Channels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 cols: Active rooms summary */}
              <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-indigo-400" />
                    Active Call Rooms
                  </h3>
                  <button
                    onClick={() => setActiveTab('rooms')}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
                  >
                    Manage All Rooms →
                  </button>
                </div>

                <div className="space-y-3">
                  {rooms.slice(0, 5).map((room) => {
                    const count = participantCounts[room.id] || 0;
                    return (
                      <div
                        key={room.id}
                        className="bg-slate-950/70 border border-slate-800/60 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${count > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <div>
                            <p className="text-sm font-medium text-white">{room.title}</p>
                            <p className="text-xs text-slate-400">{room.callType === 'video_audio' ? '📹 Video + Audio' : '🎙️ Audio-Only'} • ID: {room.id}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                            {count} {count === 1 ? 'caller' : 'callers'}
                          </span>
                          <button
                            onClick={() => onJoinRoom(room)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center gap-1"
                          >
                            Join Call
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {rooms.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">No custom rooms created yet.</p>
                  )}
                </div>
              </div>

              {/* Right col: Admin Info & Quick Broadcast */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    Admin Privileges
                  </h3>
                  <ul className="text-xs text-slate-400 space-y-2.5 mb-6">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Full authority to close, reset or delete any call room.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Promote other users to Admin or demote them.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Send system-wide broadcast messages to live calls.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Create permanent global or featured community rooms.</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                  <p className="text-xs font-semibold text-slate-300 mb-1">Configured Admin Accounts</p>
                  <p className="text-xs text-indigo-400 font-mono">mdsohag7749@gmail.com</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">ffsohag7749@gmail.com</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Users Management */}
        {activeTab === 'users' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Registered Users Directory</h3>
                <p className="text-xs text-slate-400">Inspect user accounts, manage admin roles, and remove spam profiles</p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, email, or UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Registered</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {filteredUsers.map((user) => {
                    const isTargetAdmin = user.role === 'admin' || (user.email && user.email.toLowerCase() === 'mdsohag7749@gmail.com');
                    return (
                      <tr key={user.uid} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
                              alt={user.displayName}
                              className="w-8 h-8 rounded-full bg-slate-800 object-cover"
                            />
                            <div>
                              <p className="font-semibold text-white">{user.displayName}</p>
                              <p className="text-slate-500 font-mono text-[10px] truncate max-w-[120px]">{user.uid}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {user.email || <span className="text-slate-500 italic">Guest (No email)</span>}
                        </td>
                        <td className="py-3 px-4">
                          {isTargetAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              <Shield className="w-3 h-3" /> Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-slate-400 bg-slate-800">
                              Member
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.status === 'online' 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : user.status === 'in-call' 
                                ? 'bg-indigo-500/10 text-indigo-400' 
                                : 'bg-slate-800 text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              user.status === 'online' ? 'bg-emerald-400' : user.status === 'in-call' ? 'bg-indigo-400' : 'bg-slate-500'
                            }`} />
                            {user.status || 'online'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleUserRole(user)}
                              title={isTargetAdmin ? 'Demote to Member' : 'Promote to Admin'}
                              className={`p-1.5 rounded-lg border transition ${
                                isTargetAdmin
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20'
                              }`}
                            >
                              {isTargetAdmin ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user)}
                              title="Delete User Record"
                              className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No users found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Rooms Management */}
        {activeTab === 'rooms' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Call Channels & Rooms</h3>
                <p className="text-xs text-slate-400">Control active rooms, view callers, or create official broadcast spaces</p>
              </div>

              <button
                id="admin-create-room-toggle"
                onClick={() => setIsCreatingRoom(!isCreatingRoom)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                {isCreatingRoom ? 'Cancel' : 'Create Room'}
              </button>
            </div>

            {/* Create Room Form */}
            {isCreatingRoom && (
              <form onSubmit={handleCreateAdminRoom} className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 flex flex-col gap-3 animate-in fade-in duration-200">
                <h4 className="text-sm font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Create Official Administrator Room
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Room Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 📢 Official Town Hall / Announcements"
                      value={newRoomTitle}
                      onChange={(e) => setNewRoomTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Call Type</label>
                    <select
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="video_audio">📹 Video & Audio Room</option>
                      <option value="audio_only">🎙️ Voice-Only Audio Room</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Description / Purpose (Optional)</label>
                  <input
                    type="text"
                    placeholder="Short description for visitors..."
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is-global-cb"
                    checked={isGlobalFeatured}
                    onChange={(e) => setIsGlobalFeatured(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="is-global-cb" className="text-xs text-slate-300">
                    Feature prominently as a Recommended Global Room
                  </label>
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingRoom(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                  >
                    Publish Room
                  </button>
                </div>
              </form>
            )}

            {/* Rooms List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map((room) => {
                const count = participantCounts[room.id] || 0;
                return (
                  <div
                    key={room.id}
                    className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          room.callType === 'video_audio' 
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}>
                          {room.callType === 'video_audio' ? 'Video + Audio' : 'Audio-Only'}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          {count} {count === 1 ? 'caller' : 'callers'} active
                        </span>
                      </div>

                      <h4 className="text-base font-semibold text-white mb-1">{room.title}</h4>
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{room.description}</p>
                      <p className="text-[10px] text-slate-500 font-mono mb-4">ID: {room.id} • Created: {new Date(room.createdAt).toLocaleDateString()}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-900">
                      <button
                        onClick={() => onJoinRoom(room)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Enter Call
                      </button>

                      <button
                        onClick={() => handleDeleteRoom(room)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium transition flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Close Room
                      </button>
                    </div>
                  </div>
                );
              })}
              {rooms.length === 0 && (
                <div className="col-span-2 text-center py-12 text-slate-500 text-xs">
                  No rooms created yet. Click "Create Room" above to set one up.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Announcement Broadcast */}
        {activeTab === 'announcements' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Broadcast Admin Announcement</h3>
                <p className="text-xs text-slate-400">Push an instant system notification to in-call chat channels</p>
              </div>
            </div>

            {broadcastSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                {broadcastSuccess}
              </div>
            )}

            <form onSubmit={handleSendBroadcast} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-300 font-medium mb-1.5 block">Target Call Channel</label>
                <select
                  value={announcementRoomId}
                  onChange={(e) => setAnnouncementRoomId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">📢 All Active Call Rooms ({rooms.length} rooms)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({participantCounts[r.id] || 0} callers)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium mb-1.5 block">Announcement Message</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your official announcement here... (e.g. Scheduled maintenance in 10 minutes, or welcoming new participants!)"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Radio className="w-4 h-4" />
                Send Broadcast Message
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
