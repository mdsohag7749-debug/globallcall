/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, syncUserProfile } from './lib/firebase';
import { UserProfile, CallRoom as RoomType } from './types';
import CallLobby from './components/CallLobby';
import CallRoom from './components/CallRoom';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomType | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [callOptions, setCallOptions] = useState<{ audioMuted: boolean; videoOff: boolean }>({
    audioMuted: false,
    videoOff: false
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setCurrentUser(userDoc.data() as UserProfile);
          } else {
            const synced = await syncUserProfile(user);
            setCurrentUser(synced);
          }
        } catch (e) {
          console.error('Firebase user profile sync failed:', e);
          setCurrentUser({
            uid: user.uid,
            displayName: user.displayName || 'Caller',
            email: user.email || undefined,
            photoURL: user.photoURL || undefined,
            status: 'online'
          });
        }
      } else {
        setCurrentUser(null);
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // Check URL query parameters for direct room join (e.g. ?room=room-123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId && currentUser && !activeRoom) {
      setActiveRoom({
        id: roomId,
        title: `Call Room: ${roomId}`,
        description: 'Joined via invitation link',
        createdBy: 'shared',
        callType: 'video_audio',
        isGlobal: false,
        createdAt: new Date().toISOString()
      });
    }
  }, [currentUser, activeRoom]);

  const handleJoinRoom = (room: RoomType, options: { audioMuted: boolean; videoOff: boolean }) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setCallOptions(options);
    setActiveRoom(room);
  };

  const handleLeaveCall = () => {
    setActiveRoom(null);
    // Clear url query if present
    if (window.history.pushState) {
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="w-full h-dvh bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">Loading Global Call...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {isAdminPanelOpen ? (
        <AdminPanel
          currentUser={currentUser}
          onBackToLobby={() => setIsAdminPanelOpen(false)}
          onJoinRoom={(room) => {
            setIsAdminPanelOpen(false);
            handleJoinRoom(room, { audioMuted: false, videoOff: false });
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      ) : activeRoom && currentUser ? (
        <CallRoom
          room={activeRoom}
          currentUser={currentUser}
          onLeave={handleLeaveCall}
          initialAudioMuted={callOptions.audioMuted}
          initialVideoOff={callOptions.videoOff}
        />
      ) : (
        <CallLobby
          currentUser={currentUser}
          onJoinRoom={handleJoinRoom}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(profile) => {
          setCurrentUser(profile);
          setIsAuthModalOpen(false);
        }}
      />
    </div>
  );
}
