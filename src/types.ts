export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role?: 'admin' | 'user';
  status: 'online' | 'in-call' | 'offline';
  createdAt?: string;
  updatedAt?: string;
}

export interface CallRoom {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName?: string;
  callType: 'video_audio' | 'audio_only';
  isGlobal: boolean;
  participantCount?: number;
  createdAt: string;
}

export interface Participant {
  uid: string;
  displayName: string;
  photoURL?: string;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isSpeaking?: boolean;
  joinedAt: string;
  lastPing?: string;
}

export interface WebRTCSignal {
  id?: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice';
  payload: string;
  createdAt?: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  type: 'text' | 'reaction';
  createdAt: string;
}

export interface MediaDeviceSettings {
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
}
