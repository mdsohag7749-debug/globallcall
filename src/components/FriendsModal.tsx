import { useState, useEffect, FormEvent } from 'react';
import { 
  X, 
  Users, 
  UserPlus, 
  MessageSquare, 
  Send, 
  Search, 
  Share2, 
  Check, 
  Copy,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, addDoc, serverTimestamp, or } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, DirectMessage } from '../types';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onInviteToRoom?: (friendUid: string) => void;
}

export default function FriendsModal({
  isOpen,
  onClose,
  currentUser
}: FriendsModalProps) {
  const [friendsList, setFriendsList] = useState<UserProfile[]>([]);
  const [friendInput, setFriendInput] = useState('');
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [activeChatFriend, setActiveChatFriend] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Sync friends profiles
  useEffect(() => {
    if (!isOpen || !currentUser.friends || currentUser.friends.length === 0) {
      setFriendsList([]);
      return;
    }

    const unsubs = currentUser.friends.map(friendUid => {
      return onSnapshot(doc(db, 'users', friendUid), (snap) => {
        if (snap.exists()) {
          const profile = snap.data() as UserProfile;
          setFriendsList(prev => {
            const map = new Map(prev.map(p => [p.uid, p]));
            map.set(profile.uid, profile);
            return Array.from(map.values());
          });
        }
      });
    });

    return () => unsubs.forEach(u => u());
  }, [isOpen, currentUser.friends]);

  // Sync direct messages with active chat friend
  useEffect(() => {
    if (!activeChatFriend) {
      setChatMessages([]);
      return;
    }

    const dmsCol = collection(db, 'directMessages');
    const unsubscribe = onSnapshot(dmsCol, (snapshot) => {
      const msgs: DirectMessage[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (
          (data.senderId === currentUser.uid && data.receiverId === activeChatFriend.uid) ||
          (data.senderId === activeChatFriend.uid && data.receiverId === currentUser.uid)
        ) {
          msgs.push({ id: docSnap.id, ...data } as DirectMessage);
        }
      });
      msgs.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      setChatMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeChatFriend, currentUser.uid]);

  if (!isOpen) return null;

  const handleAddFriend = async (e: FormEvent) => {
    e.preventDefault();
    const queryStr = friendInput.trim();
    if (!queryStr) return;

    setSearchStatus('Searching...');
    try {
      const usersCol = collection(db, 'users');
      // Search by email, displayName or exact UID
      const snap = await getDocs(usersCol);
      let foundUser: UserProfile | null = null;

      snap.forEach(d => {
        const u = d.data() as UserProfile;
        if (
          u.uid !== currentUser.uid &&
          (u.uid === queryStr || 
           (u.email && u.email.toLowerCase() === queryStr.toLowerCase()) ||
           u.displayName.toLowerCase() === queryStr.toLowerCase())
        ) {
          foundUser = u;
        }
      });

      if (!foundUser) {
        setSearchStatus('No caller found matching that name, email, or UID.');
        return;
      }

      const existingFriends = currentUser.friends || [];
      if (existingFriends.includes((foundUser as UserProfile).uid)) {
        setSearchStatus('Already on your friend list!');
        return;
      }

      const updatedFriends = [...existingFriends, (foundUser as UserProfile).uid];
      await setDoc(doc(db, 'users', currentUser.uid), {
        friends: updatedFriends
      }, { merge: true });

      setFriendInput('');
      setSearchStatus(`Added ${(foundUser as UserProfile).displayName} to friends!`);
      setTimeout(() => setSearchStatus(null), 3000);
    } catch (err: any) {
      setSearchStatus(`Error: ${err.message}`);
    }
  };

  const handleSendDM = async (e: FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !activeChatFriend) return;

    const text = msgInput.trim();
    setMsgInput('');

    try {
      await addDoc(collection(db, 'directMessages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        receiverId: activeChatFriend.uid,
        text,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Failed to send DM:', err);
    }
  };

  const handleCopyInviteToFriend = () => {
    const link = `${window.location.origin}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-white/[0.12] rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[580px]">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Friends & Direct Messaging</h3>
              <p className="text-xs text-slate-400">Connect and chat with your peers across GlobalCall</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Friends List */}
          <div className="w-64 border-r border-white/[0.08] flex flex-col bg-slate-950/40">
            {/* Add Friend Form */}
            <form onSubmit={handleAddFriend} className="p-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Add friend by name/email..."
                  value={friendInput}
                  onChange={(e) => setFriendInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  title="Add Friend"
                  className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
              {searchStatus && (
                <p className="text-[10px] mt-1.5 text-cyan-400 line-clamp-2">{searchStatus}</p>
              )}
            </form>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Connected Friends ({friendsList.length})
              </div>

              {friendsList.map(friend => {
                const isSelected = activeChatFriend?.uid === friend.uid;
                const isOnline = friend.status === 'online' || friend.status === 'in-call';

                return (
                  <button
                    key={friend.uid}
                    onClick={() => setActiveChatFriend(friend)}
                    className={`w-full p-2 rounded-xl flex items-center gap-2.5 transition text-left cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'hover:bg-slate-800/60 text-slate-200'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {friend.photoURL ? (
                        <img
                          src={friend.photoURL}
                          alt={friend.displayName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-700"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white border border-slate-700">
                          {friend.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                          isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{friend.displayName}</p>
                      <p className={`text-[10px] truncate ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {friend.customStatus || (isOnline ? 'Online' : 'Offline')}
                      </p>
                    </div>
                  </button>
                );
              })}

              {friendsList.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                  <p>No friends added yet.</p>
                  <p className="text-[11px] mt-1 text-slate-400">Add callers by username or email above!</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Active Chat / Direct Message panel */}
          <div className="flex-1 flex flex-col bg-slate-900/50">
            {activeChatFriend ? (
              <>
                {/* Chat Partner Header */}
                <div className="p-3 border-b border-white/[0.08] flex items-center justify-between bg-slate-900/80">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${
                      activeChatFriend.status === 'online' ? 'bg-emerald-400' : 'bg-slate-500'
                    }`} />
                    <span className="text-xs font-bold text-white truncate">{activeChatFriend.displayName}</span>
                    <span className="text-[10px] text-slate-400">{activeChatFriend.customStatus}</span>
                  </div>

                  <button
                    onClick={handleCopyInviteToFriend}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Share2 className="w-3 h-3" />}
                    <span>{copiedLink ? 'Link Copied!' : 'Invite to Room'}</span>
                  </button>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.map(msg => {
                    const isMe = msg.senderId === currentUser.uid;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-sm leading-relaxed ${
                            isMe
                              ? 'bg-indigo-600 text-white rounded-tr-xs'
                              : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-tl-xs'
                          }`}
                        >
                          <p>{msg.text}</p>
                        </div>
                        <span className="text-[9px] text-slate-500 mt-1 px-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}

                  {chatMessages.length === 0 && (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      <p>Start a conversation with {activeChatFriend.displayName}!</p>
                    </div>
                  )}
                </div>

                {/* Input form */}
                <form onSubmit={handleSendDM} className="p-3 border-t border-white/[0.08] flex items-center gap-2">
                  <input
                    type="text"
                    value={msgInput}
                    onChange={(e) => setMsgInput(e.target.value)}
                    placeholder={`Message ${activeChatFriend.displayName}...`}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!msgInput.trim()}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <MessageSquare className="w-10 h-10 mb-2 opacity-40 text-indigo-400" />
                <p className="text-sm font-semibold text-slate-400">Select a friend to message</p>
                <p className="text-xs mt-1 max-w-xs">Chat 1-on-1 in real-time or send direct invites to your call rooms.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
