export interface CallHistoryItem {
  roomId: string;
  roomTitle: string;
  joinedAt: string;
  durationSeconds?: number;
}

export interface UserStats {
  callTimeMinutes: number;
  roomsJoined: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role?: 'admin' | 'user';
  status: 'online' | 'in-call' | 'offline';
  bio?: string;
  customStatus?: string; // e.g. "In meeting", "BRB", "Focusing"
  badges?: string[]; // 'official' | 'active' | 'verified'
  stats?: UserStats;
  friends?: string[]; // Array of friend UIDs
  callHistory?: CallHistoryItem[];
  isBanned?: boolean;
  bannedUntil?: string; // ISO date string if temporary ban
  banReason?: string;
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
  isOfficial?: boolean;
  isPinned?: boolean;
  isPrivate?: boolean; // Hidden from lobby public view
  isPasswordProtected?: boolean;
  password?: string; // Room password
  participantLimit?: number; // Max callers allowed in room
  participantCount?: number;
  emptySince?: string | null; // ISO string when room had 0 participants
  bannedUids?: string[]; // Banned from this room
  mutedUids?: string[]; // Remotely muted in this room
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
  raisedHand?: boolean;
  raisedHandAt?: string;
  isMutedByHost?: boolean;
  badge?: string;
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
  type: 'text' | 'reaction' | 'system';
  createdAt: string;
}

export interface MediaDeviceSettings {
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  roomId: string;
  reason: 'spam' | 'harassment' | 'inappropriate_video' | 'audio_abuse' | 'other';
  details?: string;
  createdAt: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface AuditLogItem {
  id: string;
  action: 'kick' | 'mute' | 'ban' | 'temp_ban' | 'unban' | 'room_close' | 'report_filed';
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  roomId?: string;
  details?: string;
  createdAt: string;
}

export interface Announcement {
  id?: string;
  text: string;
  createdAt: string;
  authorName?: string;
  active: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  createdAt: string;
}
