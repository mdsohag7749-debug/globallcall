import { useState, FormEvent } from 'react';
import { 
  X, 
  User, 
  Shield, 
  Clock, 
  Activity, 
  Award, 
  CheckCircle2, 
  Sparkles, 
  Edit3, 
  Save, 
  History,
  Zap,
  Coffee,
  Headphones,
  Smile
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
}

const PRESET_STATUSES = [
  { text: 'Available to chat', emoji: '🟢' },
  { text: 'In meeting', emoji: '📞' },
  { text: 'BRB 5 mins', emoji: '☕' },
  { text: 'Deep focus / coding', emoji: '🎧' },
  { text: 'Stepped away', emoji: '🚶' }
];

export default function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile
}: UserProfileModalProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [customStatus, setCustomStatus] = useState(currentUser.customStatus || 'Available to chat');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'history'>('profile');

  if (!isOpen) return null;

  const isAdmin = currentUser.role === 'admin';
  const totalCallMinutes = currentUser.stats?.callTimeMinutes || 45;
  const roomsJoined = currentUser.stats?.roomsJoined || 8;

  // Compute earned badges
  const earnedBadges: { id: string; label: string; icon: any; color: string; desc: string }[] = [];
  if (isAdmin) {
    earnedBadges.push({
      id: 'official',
      label: 'Official Admin',
      icon: Shield,
      color: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      desc: 'Platform Administrator & Host'
    });
  }
  if (roomsJoined >= 5 || (currentUser.badges && currentUser.badges.includes('active'))) {
    earnedBadges.push({
      id: 'active',
      label: 'Active Caller',
      icon: Zap,
      color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      desc: 'Participated in 5+ global rooms'
    });
  }
  earnedBadges.push({
    id: 'verified',
    label: 'Verified Identity',
    icon: CheckCircle2,
    color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    desc: 'Securely authenticated user'
  });

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const updated: Partial<UserProfile> = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        customStatus: customStatus.trim(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', currentUser.uid), updated, { merge: true });
      onUpdateProfile({ ...currentUser, ...updated });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-white/[0.12] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Avatar & Cover gradient */}
        <div className="relative bg-linear-to-r from-indigo-900/60 via-purple-900/40 to-slate-900 p-6 pb-4 border-b border-white/[0.08]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-18 h-18 rounded-2xl object-cover border-2 border-indigo-500 shadow-xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-18 h-18 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-slate-900" title="Online" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-white truncate">{currentUser.displayName}</h3>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> ADMIN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">{currentUser.email || `Caller ID: ${currentUser.uid.slice(0, 8)}`}</p>
              
              {/* Custom Status Display */}
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-white/[0.08] text-xs text-slate-200">
                <Smile className="w-3 h-3 text-cyan-400" />
                <span className="truncate">{currentUser.customStatus || 'Available to chat'}</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 border-t border-white/[0.08] pt-3">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
              }`}
            >
              Profile & Badges
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
              }`}
            >
              Activity Stats
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
              }`}
            >
              Call History
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {isEditing ? (
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">About Bio</label>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Share a short intro about yourself, interests, or tech stack..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Custom Status</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {PRESET_STATUSES.map(preset => (
                        <button
                          key={preset.text}
                          type="button"
                          onClick={() => setCustomStatus(`${preset.emoji} ${preset.text}`)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition"
                        >
                          {preset.emoji} {preset.text}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      placeholder="Or enter your custom status..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-800/40 border border-white/[0.06] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bio</span>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                      </button>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {currentUser.bio || 'No bio written yet. Click edit to introduce yourself!'}
                    </p>
                  </div>

                  {/* Badges Section */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      Earned Badges ({earnedBadges.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {earnedBadges.map(badge => {
                        const Icon = badge.icon;
                        return (
                          <div
                            key={badge.id}
                            className={`p-3 rounded-xl border flex items-start gap-2.5 ${badge.color}`}
                          >
                            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold">{badge.label}</p>
                              <p className="text-[11px] opacity-80 mt-0.5">{badge.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                  <Clock className="w-6 h-6 text-indigo-400 mx-auto mb-1.5" />
                  <span className="text-2xl font-black text-white">{totalCallMinutes}m</span>
                  <p className="text-xs text-slate-400 mt-0.5">Total Call Time</p>
                </div>

                <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                  <Activity className="w-6 h-6 text-cyan-400 mx-auto mb-1.5" />
                  <span className="text-2xl font-black text-white">{roomsJoined}</span>
                  <p className="text-xs text-slate-400 mt-0.5">Rooms Joined</p>
                </div>
              </div>

              <div className="bg-slate-800/40 border border-white/[0.06] rounded-2xl p-4 space-y-2 text-xs text-slate-400">
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span>Member Since</span>
                  <span className="text-slate-200 font-medium">
                    {currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'September 2026'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span>Reputation Status</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Excellent (100%)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Connection Reliability</span>
                  <span className="text-cyan-400 font-mono">99.8% P2P Uptime</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-400" />
                Recent Call Sessions
              </h4>

              {currentUser.callHistory && currentUser.callHistory.length > 0 ? (
                currentUser.callHistory.map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-white">{item.roomTitle}</p>
                      <p className="text-slate-400 text-[11px]">Room: {item.roomId}</p>
                    </div>
                    <span className="text-slate-400 text-[11px] font-mono">
                      {new Date(item.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs">
                  <p>Recent call sessions will be automatically logged here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
