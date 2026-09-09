import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Participant, WebRTCSignal } from '../types';
import { RTC_CONFIG, createPlaceholderVideoStream, createSilentAudioStream } from '../lib/webrtc';

interface UseCallRoomProps {
  roomId: string;
  currentUser: UserProfile;
  initialAudioMuted?: boolean;
  initialVideoOff?: boolean;
  onCallEnded?: () => void;
}

export function useCallRoom({
  roomId,
  currentUser,
  initialAudioMuted = false,
  initialVideoOff = false,
  onCallEnded
}: UseCallRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isAudioMuted, setIsAudioMuted] = useState(initialAudioMuted);
  const [isVideoOff, setIsVideoOff] = useState(initialVideoOff);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // References to keep state across async Firestore callbacks
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());

  // 1. Initialize local media
  useEffect(() => {
    let isCancelled = false;

    async function initMedia() {
      setIsConnecting(true);
      setConnectionError(null);
      let stream: MediaStream | null = null;

      try {
        // Try requesting both audio and video
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: !initialVideoOff ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false
        });
      } catch (err: any) {
        console.warn('Full getUserMedia failed, attempting fallback:', err);
        try {
          // Try audio only
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (audioErr) {
          console.warn('Microphone hardware unavailable, activating simulated streams:', audioErr);
          // Synthesize tracks for sandbox compatibility
          const audioTrack = createSilentAudioStream().getAudioTracks()[0];
          const videoTrack = createPlaceholderVideoStream(currentUser.displayName).getVideoTracks()[0];
          const combined = new MediaStream();
          if (audioTrack) combined.addTrack(audioTrack);
          if (videoTrack) combined.addTrack(videoTrack);
          stream = combined;
        }
      }

      if (isCancelled) {
        stream?.getTracks().forEach(t => t.stop());
        return;
      }

      // If video track is missing (e.g. audio-only mode or fallback), provide fallback canvas track
      if (stream.getVideoTracks().length === 0) {
        const fallbackVideo = createPlaceholderVideoStream(currentUser.displayName).getVideoTracks()[0];
        if (fallbackVideo) stream.addTrack(fallbackVideo);
      }

      // Apply initial mute states
      stream.getAudioTracks().forEach(t => { t.enabled = !initialAudioMuted; });
      stream.getVideoTracks().forEach(t => { t.enabled = !initialVideoOff; });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsConnecting(false);

      // Setup audio analyzer for speaking detection
      setupSpeakingDetector(stream);
    }

    initMedia();

    return () => {
      isCancelled = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [currentUser.displayName, initialAudioMuted, initialVideoOff]);

  // Speaking detector
  const setupSpeakingDetector = (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const isSpeaking = avg > 14 && audioTrack.enabled;
        setIsLocalSpeaking(isSpeaking);
        if (isSpeaking) {
          setActiveSpeakerId(currentUser.uid);
        }
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };
      animFrameRef.current = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('Audio analyser could not start:', e);
    }
  };

  // 2. Register participant in Firestore
  useEffect(() => {
    if (!roomId || !currentUser.uid) return;

    const participantRef = doc(db, 'rooms', roomId, 'participants', currentUser.uid);
    const participantData: Participant = {
      uid: currentUser.uid,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      isAudioMuted,
      isVideoOff,
      isScreenSharing,
      joinedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
    };

    setDoc(participantRef, participantData, { merge: true }).catch(console.error);

    // Heartbeat ping every 10s
    const pingInterval = setInterval(() => {
      setDoc(participantRef, { lastPing: new Date().toISOString() }, { merge: true }).catch(() => {});
    }, 10000);

    // Clean up on leave
    const cleanup = () => {
      clearInterval(pingInterval);
      deleteDoc(participantRef).catch(() => {});
    };

    window.addEventListener('beforeunload', cleanup);

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, [roomId, currentUser.uid, currentUser.displayName, currentUser.photoURL, isAudioMuted, isVideoOff, isScreenSharing]);

  // Create WebRTC Peer Connection helper
  const createPeerConnection = useCallback((remoteUid: string) => {
    if (peerConnections.current[remoteUid]) {
      return peerConnections.current[remoteUid];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current[remoteUid] = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStreams(prev => ({
          ...prev,
          [remoteUid]: event.streams[0]
        }));
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const signalData = {
          from: currentUser.uid,
          to: remoteUid,
          type: 'ice',
          payload: JSON.stringify(event.candidate.toJSON()),
          createdAt: serverTimestamp()
        };
        addDoc(collection(db, 'rooms', roomId, 'signals'), signalData).catch(console.error);
      }
    };

    // Connection state logging & cleanup
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Clean up connection
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[remoteUid];
          return next;
        });
      }
    };

    return pc;
  }, [currentUser.uid, roomId]);

  // 3. Listen to participants list in Firestore
  useEffect(() => {
    if (!roomId) return;

    const participantsCol = collection(db, 'rooms', roomId, 'participants');
    const unsubscribe = onSnapshot(
      participantsCol, 
      (snapshot) => {
        const list: Participant[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as Participant);
        });
        setParticipants(list);

        // Clean up peer connections for departed participants
        const currentUids = new Set(list.map(p => p.uid));
        Object.keys(peerConnections.current).forEach(uid => {
          if (!currentUids.has(uid) && uid !== currentUser.uid) {
            peerConnections.current[uid]?.close();
            delete peerConnections.current[uid];
            setRemoteStreams(prev => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }
        });

        // Initiate connection to new participants (Tie-breaker: lower UID creates offer to higher UID)
        list.forEach(remoteUser => {
          if (remoteUser.uid === currentUser.uid) return;

          // If this user is the initiator (currentUser.uid < remoteUser.uid)
          if (currentUser.uid < remoteUser.uid && !peerConnections.current[remoteUser.uid]) {
            const pc = createPeerConnection(remoteUser.uid);
            pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
              .then(offer => pc.setLocalDescription(offer))
              .then(() => {
                if (pc.localDescription) {
                  const signalData = {
                    from: currentUser.uid,
                    to: remoteUser.uid,
                    type: 'offer',
                    payload: JSON.stringify(pc.localDescription),
                    createdAt: serverTimestamp()
                  };
                  return addDoc(collection(db, 'rooms', roomId, 'signals'), signalData);
                }
              })
              .catch(err => console.warn(`Error offering to ${remoteUser.uid}:`, err));
          }
        });
      },
      (err) => {
        console.warn('Call participants listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [roomId, currentUser.uid, createPeerConnection]);

  // 4. Listen to WebRTC signals directed to current user
  useEffect(() => {
    if (!roomId || !currentUser.uid) return;

    const signalsQuery = query(
      collection(db, 'rooms', roomId, 'signals'),
      where('to', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      signalsQuery, 
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const docId = change.doc.id;
            if (processedSignals.current.has(docId)) return;
            processedSignals.current.add(docId);

            const signal = change.doc.data() as WebRTCSignal;
            const remoteUid = signal.from;

            try {
              if (signal.type === 'offer') {
                const pc = createPeerConnection(remoteUid);
                const offerDesc = new RTCSessionDescription(JSON.parse(signal.payload));
                await pc.setRemoteDescription(offerDesc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await addDoc(collection(db, 'rooms', roomId, 'signals'), {
                  from: currentUser.uid,
                  to: remoteUid,
                  type: 'answer',
                  payload: JSON.stringify(answer),
                  createdAt: serverTimestamp()
                });
              } else if (signal.type === 'answer') {
                const pc = peerConnections.current[remoteUid];
                if (pc && pc.signalingState !== 'stable') {
                  const answerDesc = new RTCSessionDescription(JSON.parse(signal.payload));
                  await pc.setRemoteDescription(answerDesc);
                }
              } else if (signal.type === 'ice') {
                const pc = peerConnections.current[remoteUid] || createPeerConnection(remoteUid);
                if (pc) {
                  const candidate = new RTCIceCandidate(JSON.parse(signal.payload));
                  await pc.addIceCandidate(candidate).catch(() => {});
                }
              }

              // Delete signal after processing to keep collection lean
              await deleteDoc(change.doc.ref).catch(() => {});
            } catch (signalErr) {
              console.warn('Signal processing error:', signalErr);
            }
          }
        });
      },
      (err) => {
        console.warn('Call signals listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [roomId, currentUser.uid, createPeerConnection]);

  // Toggle Audio (Mute / Unmute)
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const nextMuted = !isAudioMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
      setIsAudioMuted(nextMuted);

      // Update Firestore participant status
      const participantRef = doc(db, 'rooms', roomId, 'participants', currentUser.uid);
      setDoc(participantRef, { isAudioMuted: nextMuted }, { merge: true }).catch(() => {});
    }
  }, [isAudioMuted, roomId, currentUser.uid]);

  // Toggle Video (Camera On / Off)
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const nextOff = !isVideoOff;
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !nextOff;
      });
      setIsVideoOff(nextOff);

      // Update Firestore participant status
      const participantRef = doc(db, 'rooms', roomId, 'participants', currentUser.uid);
      setDoc(participantRef, { isVideoOff: nextOff }, { merge: true }).catch(() => {});
    }
  }, [isVideoOff, roomId, currentUser.uid]);

  const isScreenSharingRef = useRef(isScreenSharing);
  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const isVideoOffRef = useRef(isVideoOff);
  useEffect(() => {
    isVideoOffRef.current = isVideoOff;
  }, [isVideoOff]);

  // Stop Screen Sharing
  const stopScreenShare = useCallback(async () => {
    try {
      let newVideoTrack: MediaStreamTrack | null = null;
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        newVideoTrack = camStream.getVideoTracks()[0];
      } catch {
        // Fallback to placeholder if camera access denied or unavailable
        const fallback = createPlaceholderVideoStream(currentUser.displayName);
        newVideoTrack = fallback.getVideoTracks()[0];
      }

      if (newVideoTrack) {
        newVideoTrack.enabled = !isVideoOffRef.current;

        // Replace track in peer connections
        Object.values(peerConnections.current).forEach((pc: RTCPeerConnection) => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender && newVideoTrack) {
            sender.replaceTrack(newVideoTrack);
          }
        });

        if (localStreamRef.current) {
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          if (oldTrack) {
            oldTrack.stop();
            localStreamRef.current.removeTrack(oldTrack);
          }
          localStreamRef.current.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }
      }
      setIsScreenSharing(false);
      isScreenSharingRef.current = false;
      const participantRef = doc(db, 'rooms', roomId, 'participants', currentUser.uid);
      setDoc(participantRef, { isScreenSharing: false }, { merge: true }).catch(() => {});
    } catch (e) {
      console.warn('Reverting screen share failed:', e);
    }
  }, [roomId, currentUser.uid, currentUser.displayName]);

  // Start Screen Sharing via Screen Capture API (navigator.mediaDevices.getDisplayMedia)
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen capture API is not supported by your browser or environment.');
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        } as MediaTrackConstraints,
        audio: false
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        throw new Error('No video track available from screen capture.');
      }

      // Handle user ending screen share via browser floating controls
      screenTrack.onended = () => {
        stopScreenShare();
      };

      // Replace track in all active peer connections
      Object.values(peerConnections.current).forEach((pc: RTCPeerConnection) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldTrack) {
          oldTrack.stop();
          localStreamRef.current.removeTrack(oldTrack);
        }
        localStreamRef.current.addTrack(screenTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      setIsScreenSharing(true);
      isScreenSharingRef.current = true;
      const participantRef = doc(db, 'rooms', roomId, 'participants', currentUser.uid);
      setDoc(participantRef, { isScreenSharing: true }, { merge: true }).catch(() => {});
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        console.info('Screen share dialog cancelled by user.');
      } else {
        console.warn('Screen share failed:', err);
      }
      throw err;
    }
  }, [roomId, currentUser.uid, stopScreenShare]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [startScreenShare, stopScreenShare]);

  // Leave Call
  const leaveCall = useCallback(async () => {
    // Stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    // Close all peer connections
    Object.values(peerConnections.current).forEach((pc: RTCPeerConnection) => {
      pc.close();
    });
    peerConnections.current = {};

    // Remove from Firestore
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'participants', currentUser.uid));
    } catch {
      // ignore
    }

    if (onCallEnded) {
      onCallEnded();
    }
  }, [roomId, currentUser.uid, onCallEnded]);

  return {
    localStream,
    remoteStreams,
    participants,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isConnecting,
    isLocalSpeaking,
    activeSpeakerId,
    connectionError,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leaveCall
  };
}
