import { CallRoom as RoomType } from '../types';

export const DEFAULT_GLOBAL_ROOMS: RoomType[] = [
  {
    id: 'global-lounge-main',
    title: 'Global Video & Audio Lounge',
    description: 'The main open room connecting callers worldwide 24/7. Jump right in and meet engineers, designers, and creators.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: true,
    isOfficial: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-audio-cafe',
    title: 'Audio-Only Global Voice Cafe',
    description: 'Ultra-smooth audio-only space optimized for low latency and poor internet connections. Casual talk, radio style discussions.',
    createdBy: 'system',
    callType: 'audio_only',
    isGlobal: false,
    isOfficial: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'global-hangout-chill',
    title: 'Casual Hangout & Community',
    description: 'Relaxed space to share stories, co-work, test your webcam setup, and build international friendships without pressure.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: false,
    isOfficial: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'webrtc-dev-04',
    title: 'WebRTC & AI Hackers Room',
    description: 'Live collaborative space for WebRTC developers, AI agent builders, and open source creators sharing terminal screens.',
    createdBy: 'system',
    callType: 'video_audio',
    isGlobal: false,
    isOfficial: true,
    createdAt: new Date().toISOString()
  }
];
