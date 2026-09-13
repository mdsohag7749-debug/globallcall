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
  Mail,
  Clock,
  ExternalLink,
  Crown,
  Ban,
  AlertOctagon,
  FileText,
  Megaphone,
  Check,
  X,
  History,
  Unlock,
  Sun,
  Moon
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
import { UserProfile, CallRoom as RoomType, ReportItem, AuditLogItem, Announcement } from '../types';
import { DEFAULT_GLOBAL_ROOMS } from '../lib/defaultRooms';
import { logAuditEvent } from '../lib/moderation';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rooms' | 'ban_list' | 'reports' | 'announcements'>('overview');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [lobbyAnnouncements, setLobbyAnnouncements] = useState<Announcement[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    } else {
      root.classList.remove('light-mode');
      root.classList.add('dark-mode');
    }
  }, [theme]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');

  // Modal / Form States
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomType, setNewRoomType] = useState<'video_audio' | 'audio_only'>('video_audio');
  const [isGlobalFeatured, setIsGlobalFeatured] = useState(false);

  // Broadcast & Announcements
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementRoomId, setAnnouncementRoomId] = useState<string>('all');
  const [lobbyBannerText, setLobbyBannerText] = useState('');
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  // Manual Ban Modal
  const [showBanModal, setShowBanModal] = useState(false);
  const [targetBanUid, setTargetBanUid] = useState('');
  const [banReason, setBanReason] = useState('Violation of community guidelines');
  const [banDuration, setBanDuration] = useState<'15m' | '1h' | '24h' | 'permanent'>('permanent');

  // Toast
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
        const roomMap = new Map<string, RoomType>();
        DEFAULT_GLOBAL_ROOMS.forEach((r) => roomMap.set(r.id, r));
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.deleted) {
            roomMap.delete(docSnap.id);
          } else {
            roomMap.set(docSnap.id, { id: docSnap.id, ...data });
          }
        });
        setRooms(Array.from(roomMap.values()));
      },
      (err) => {
        console.warn('Admin rooms sync error:', err);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  // Sync Reports from Firestore
  useEffect(() => {
    if (!isAdmin) return;

    const reportsCol = collection(db, 'reports');
    const unsub = onSnapshot(reportsCol, (snapshot) => {
      const list: ReportItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setReports(list);
    }, (err) => console.warn('Reports sync error:', err));

    return () => unsub();
  }, [isAdmin]);

  // Sync Audit Logs from Firestore
  useEffect(() => {
    if (!isAdmin) return;

    const auditCol = collection(db, 'auditLogs');
    const unsub = onSnapshot(auditCol, (snapshot) => {
      const list: AuditLogItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setAuditLogs(list);
    }, (err) => console.warn('Audit logs sync error:', err));

    return () => unsub();
  }, [isAdmin]);

  // Sync Announcements from Firestore
  useEffect(() => {
    if (!isAdmin) return;

    const annCol = collection(db, 'announcements');
    const unsub = onSnapshot(annCol, (snapshot) => {
      const list: Announcement[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setLobbyAnnouncements(list);
    }, (err) => console.warn('Announcements sync error:', err));

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
      await setDoc(doc(db, 'rooms', room.id), { deleted: true, closedAt: new Date().toISOString() }, { merge: true });
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
      const roomData: RoomType = {
        id: roomId,
        title: newRoomTitle.trim(),
        description: newRoomDesc.trim() || 'Official room created by Administrator',
        createdBy: currentUser?.uid || 'admin',
        createdByName: currentUser?.displayName || 'Admin',
        callType: newRoomType,
        isGlobal: isGlobalFeatured,
        isOfficial: true,
        isPinned: true,
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

  // Lobby Banner Creation
  const handlePublishLobbyBanner = async (e: FormEvent) => {
    e.preventDefault();
    if (!lobbyBannerText.trim()) return;

    try {
      await addDoc(collection(db, 'announcements'), {
        text: lobbyBannerText.trim(),
        active: true,
        authorName: currentUser?.displayName || 'Administrator',
        createdAt: new Date().toISOString()
      });
      setLobbyBannerText('');
      showNotification('success', 'Lobby announcement banner published!');
    } catch (err: any) {
      showNotification('error', `Failed to post banner: ${err.message}`);
    }
  };

  const handleDeleteBanner = async (bannerId: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', bannerId));
      showNotification('success', 'Banner removed.');
    } catch (err: any) {
      showNotification('error', `Failed to remove banner: ${err.message}`);
    }
  };

  const handleToggleBannerStatus = async (banner: Announcement) => {
    if (!banner.id) return;
    try {
      await setDoc(doc(db, 'announcements', banner.id), { active: !banner.active }, { merge: true });
      showNotification('success', `Banner status toggled to ${!banner.active ? 'Active' : 'Inactive'}`);
    } catch (err: any) {
      showNotification('error', `Failed to update banner: ${err.message}`);
    }
  };

  // Ban & Moderation Actions
  const handleUnbanUser = async (user: UserProfile) => {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        isBanned: false,
        bannedUntil: null,
        banReason: null
      }, { merge: true });

      await logAuditEvent({
        action: 'unban',
        actorId: currentUser?.uid || 'admin',
        actorName: currentUser?.displayName || 'Admin',
        targetId: user.uid,
        targetName: user.displayName,
        details: 'Admin manually lifted ban'
      });

      showNotification('success', `User ${user.displayName} unbanned.`);
    } catch (err: any) {
      showNotification('error', `Failed to unban: ${err.message}`);
    }
  };

  const handleExecuteBan = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetBanUid.trim()) return;

    try {
      let bannedUntil: string | null = null;
      if (banDuration === '15m') {
        bannedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      } else if (banDuration === '1h') {
        bannedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      } else if (banDuration === '24h') {
        bannedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      await setDoc(doc(db, 'users', targetBanUid), {
        isBanned: true,
        bannedUntil,
        banReason: banReason.trim()
      }, { merge: true });

      const targetUser = users.find(u => u.uid === targetBanUid);

      await logAuditEvent({
        action: banDuration === 'permanent' ? 'ban' : 'temp_ban',
        actorId: currentUser?.uid || 'admin',
        actorName: currentUser?.displayName || 'Admin',
        targetId: targetBanUid,
        targetName: targetUser?.displayName || targetBanUid,
        details: `Reason: ${banReason.trim()} (${banDuration === 'permanent' ? 'Permanent' : `Temp until ${bannedUntil}`})`
      });

      setShowBanModal(false);
      setTargetBanUid('');
      setBanReason('Violation of community guidelines');
      showNotification('success', `User banned successfully.`);
    } catch (err: any) {
      showNotification('error', `Failed to ban user: ${err.message}`);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await setDoc(doc(db, 'reports', reportId), { status }, { merge: true });
      showNotification('success', `Report marked as ${status}.`);
    } catch (err: any) {
      showNotification('error', `Failed to update report: ${err.message}`);
    }
  };

  const bannedUsers = users.filter(u => u.isBanned === true);

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredReports = reports.filter(r => {
    if (reportFilter === 'all') return true;
    return r.status === reportFilter;
  });

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
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              Sign in with mdsohag7749@gmail.com
            </button>
            <button
              id="admin-return-lobby-btn"
              onClick={onBackToLobby}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition flex items-center justify-center gap-2 cursor-pointer"
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
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} flex flex-col`}>
      {/* Top Header */}
      <header className={`border-b ${theme === 'dark' ? 'border-slate-800/80 bg-slate-900/60' : 'border-slate-200 bg-white/80'} backdrop-blur-md sticky top-0 z-30 px-6 py-4`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="admin-back-btn"
              onClick={onBackToLobby}
              className={`p-2 rounded-xl ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} hover:text-white transition cursor-pointer`}
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
                  <h1 className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Administrator Control Panel</h1>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Admin Verified
                  </span>
                </div>
                <p className="text-xs text-slate-400">System management, ban controls, audit log & global announcements</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'} transition cursor-pointer`}
              title="Toggle Dark / Light Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>

            <div className={`hidden sm:flex items-center gap-2 ${theme === 'dark' ? 'bg-slate-800/80 border-slate-700/60' : 'bg-slate-100 border-slate-200'} border px-3 py-1.5 rounded-xl text-xs`}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Logged in as:</span>
              <span className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{currentUser?.email || currentUser?.displayName}</span>
            </div>
            <button
              id="admin-view-lobby-top-btn"
              onClick={onBackToLobby}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Video className="w-4 h-4" />
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
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="admin-tab-overview"
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
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
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'rooms'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Video className="w-4 h-4" />
              Call Rooms ({rooms.length})
            </button>
            <button
              id="admin-tab-ban-list"
              onClick={() => setActiveTab('ban_list')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ban_list'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-slate-900'
              }`}
            >
              <Ban className="w-4 h-4" />
              Ban List ({bannedUsers.length})
            </button>
            <button
              id="admin-tab-reports"
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-slate-900'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              Reports & Audit ({reports.filter(r => r.status === 'pending').length} pending)
            </button>
            <button
              id="admin-tab-announcements"
              onClick={() => setActiveTab('announcements')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'announcements'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Megaphone className="w-4 h-4" />
              Announcements & Banner
            </button>
          </div>

          {activeTab === 'rooms' && (
            <button
              id="admin-new-room-btn"
              onClick={() => setIsCreatingRoom(true)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Official Room
            </button>
          )}

          {activeTab === 'ban_list' && (
            <button
              id="admin-manual-ban-btn"
              onClick={() => setShowBanModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              Ban a User
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Banned Accounts</span>
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <Ban className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-rose-400">{bannedUsers.length}</div>
                <p className="text-xs text-slate-500 mt-1">Enforced suspensions</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Reports</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-amber-400">{reports.filter(r => r.status === 'pending').length}</div>
                <p className="text-xs text-slate-500 mt-1">Require moderation review</p>
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
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
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
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center gap-1 cursor-pointer"
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
                    Admin Privileges & Guard
                  </h3>
                  <ul className="text-xs text-slate-400 space-y-2.5 mb-6">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Full authority to close, reset or delete any call room.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Kick, temporary mute/ban, or permanent ban abusers.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Broadcast Lobby announcements & in-call notifications.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Audit log records every kick/mute/ban/unban action.</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                  <p className="text-xs font-semibold text-slate-300 mb-1">Superadmin Account</p>
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
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-white">{user.displayName}</p>
                                {user.isBanned && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30">Banned</span>
                                )}
                              </div>
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
                            {user.isBanned ? (
                              <button
                                onClick={() => handleUnbanUser(user)}
                                title="Unban User"
                                className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                              >
                                <Unlock className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setTargetBanUid(user.uid);
                                  setShowBanModal(true);
                                }}
                                title="Ban User"
                                className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => handleToggleUserRole(user)}
                              title={isTargetAdmin ? 'Demote to Member' : 'Promote to Admin'}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
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
                              className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
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
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
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
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
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
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Enter Call
                      </button>

                      <button
                        onClick={() => handleDeleteRoom(room)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium transition flex items-center gap-1 cursor-pointer"
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

        {/* Tab 4: Ban List Panel */}
        {activeTab === 'ban_list' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-400" />
                  Banned Users Directory
                </h3>
                <p className="text-xs text-slate-400">Review suspended users, view temporary ban durations, or lift bans</p>
              </div>

              <button
                onClick={() => setShowBanModal(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                Ban User Manually
              </button>
            </div>

            {bannedUsers.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-medium text-white">No Banned Users</p>
                <p className="text-xs text-slate-500 mt-1">There are currently zero active account suspensions.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Expires</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {bannedUsers.map((user) => {
                      const isTemp = !!user.bannedUntil;
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
                                <p className="text-slate-500 font-mono text-[10px] truncate max-w-[140px]">{user.uid}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {user.banReason || 'No reason specified'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isTemp 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {isTemp ? 'Temporary' : 'Permanent'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {user.bannedUntil ? new Date(user.bannedUntil).toLocaleString() : 'Never (Permanent)'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleUnbanUser(user)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition flex items-center gap-1.5 ml-auto cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              Lift Ban
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Reports & Audit Log */}
        {activeTab === 'reports' && (
          <div className="flex flex-col gap-6">
            {/* Reports Section */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <AlertOctagon className="w-5 h-5 text-amber-400" />
                    User Moderation Reports
                  </h3>
                  <p className="text-xs text-slate-400">Reports filed by room participants for harassment, spam, or abuse</p>
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setReportFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${reportFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    All ({reports.length})
                  </button>
                  <button
                    onClick={() => setReportFilter('pending')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${reportFilter === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => setReportFilter('resolved')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${reportFilter === 'resolved' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
                  >
                    Resolved
                  </button>
                </div>
              </div>

              {filteredReports.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                  No reports matching current filter.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            report.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : report.status === 'resolved'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400'
                          }`}>
                            {report.status}
                          </span>
                          <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                            {report.reason.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            • {new Date(report.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-xs text-white">
                          <span className="font-semibold text-slate-300">Reported:</span>{' '}
                          <span className="text-rose-300 font-medium">{report.reportedUserName}</span>{' '}
                          <span className="text-slate-500">({report.reportedUserId})</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          <span className="font-semibold text-slate-500">By:</span> {report.reporterName} • <span className="font-semibold text-slate-500">Room:</span> {report.roomId}
                        </p>
                        {report.details && (
                          <p className="text-xs text-slate-300 bg-slate-900/80 rounded-lg p-2 mt-1 border border-slate-800">
                            "{report.details}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {report.status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                setTargetBanUid(report.reportedUserId);
                                setShowBanModal(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Ban User
                            </button>
                            <button
                              onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Resolve
                            </button>
                            <button
                              onClick={() => handleUpdateReportStatus(report.id, 'dismissed')}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Log Stream */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-400" />
                    Moderation Audit Log
                  </h3>
                  <p className="text-xs text-slate-400">Immutable trace of kick, mute, ban, unban, and moderation actions</p>
                </div>
                <span className="text-xs text-slate-500 font-mono">{auditLogs.length} events</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-slate-950/70 border border-slate-800/60 rounded-lg p-3 text-xs flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        log.action === 'ban' || log.action === 'temp_ban'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : log.action === 'kick'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : log.action === 'mute'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {log.action}
                      </span>
                      <div>
                        <p className="text-slate-200">
                          <span className="font-semibold text-indigo-300">{log.actorName}</span>{' '}
                          executed <span className="font-semibold text-white">{log.action}</span> on{' '}
                          <span className="font-semibold text-rose-300">{log.targetName || log.targetId || 'Room'}</span>
                        </p>
                        {log.details && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{log.details}</p>
                        )}
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="text-center py-8 text-xs text-slate-500">No audit events recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Announcements & Lobby Banner */}
        {activeTab === 'announcements' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Lobby Announcement Banner Broadcaster */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Lobby Announcement Banner</h3>
                    <p className="text-xs text-slate-400">Broadcasts a sticky banner at the top of the main Call Lobby</p>
                  </div>
                </div>

                <form onSubmit={handlePublishLobbyBanner} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 font-medium mb-1 block">New Banner Message</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="e.g. 📢 Welcome to GlobalCall! Scheduled maintenance tonight at 12:00 AM UTC."
                      value={lobbyBannerText}
                      onChange={(e) => setLobbyBannerText(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Megaphone className="w-4 h-4" />
                    Publish to Lobby Banner
                  </button>
                </form>
              </div>

              {/* Existing Banners */}
              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Active Lobby Banners</h4>
                <div className="space-y-2">
                  {lobbyAnnouncements.map((banner) => (
                    <div
                      key={banner.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 truncate">
                        <p className={`text-xs font-medium ${banner.active ? 'text-amber-300' : 'text-slate-500 line-through'}`}>
                          {banner.text}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {banner.authorName} • {new Date(banner.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleToggleBannerStatus(banner)}
                          className={`px-2 py-1 rounded text-[10px] font-semibold transition cursor-pointer ${
                            banner.active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {banner.active ? 'Active' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => banner.id && handleDeleteBanner(banner.id)}
                          className="p-1 rounded text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {lobbyAnnouncements.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">No lobby banners published yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: In-Call Chat Channel Broadcaster */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Broadcast In-Call Message</h3>
                    <p className="text-xs text-slate-400">Push instant message into active in-call chat rooms</p>
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
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                    Send Broadcast Message
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Manual Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                Ban User from Platform
              </h3>
              <button
                onClick={() => setShowBanModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteBan} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Target User (Select or Enter UID)</label>
                <select
                  value={targetBanUid}
                  onChange={(e) => setTargetBanUid(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500 mb-2"
                >
                  <option value="">-- Choose registered user --</option>
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName} ({u.email || u.uid})</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter UID manually..."
                  value={targetBanUid}
                  onChange={(e) => setTargetBanUid(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Ban Reason</label>
                <input
                  type="text"
                  required
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Ban Duration</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBanDuration('15m')}
                    className={`p-2 rounded-xl border font-medium cursor-pointer ${banDuration === '15m' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    15 Minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanDuration('1h')}
                    className={`p-2 rounded-xl border font-medium cursor-pointer ${banDuration === '1h' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanDuration('24h')}
                    className={`p-2 rounded-xl border font-medium cursor-pointer ${banDuration === '24h' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    24 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanDuration('permanent')}
                    className={`p-2 rounded-xl border font-medium cursor-pointer ${banDuration === 'permanent' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    Permanent Ban
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBanModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetBanUid.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  Confirm Ban
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
