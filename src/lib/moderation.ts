import { collection, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AuditLogItem } from '../types';

// Curated list of offensive / spam words
const PROFANITY_LIST = [
  'badword',
  'idiot',
  'stupid',
  'fool',
  'scam',
  'hate',
  'abuse',
  'harass',
  'spammer',
  'kill',
  'die',
  'fuck',
  'shit',
  'asshole',
  'bitch',
  'bastard',
  'nigger',
  'faggot',
  'retard',
  'khankir',
  'madarchod',
  'chutiya',
  'bokachoda'
];

/**
 * Checks text for profanity and masks matching words with asterisks
 */
export function censorText(text: string): { cleanText: string; hasProfanity: boolean } {
  if (!text) return { cleanText: '', hasProfanity: false };

  let hasProfanity = false;
  let cleanText = text;

  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(cleanText)) {
      hasProfanity = true;
      cleanText = cleanText.replace(regex, (match) => '*'.repeat(match.length));
    }
  }

  return { cleanText, hasProfanity };
}

// In-memory rate limiting: Tracks timestamps of messages sent per user
const messageHistory = new Map<string, number[]>();

/**
 * Checks if a user is sending too many messages too quickly (spam protection)
 * Max 3 messages within 2 seconds.
 */
export function checkSpamRate(userId: string): { isSpam: boolean; reason?: string } {
  const now = Date.now();
  const timestamps = messageHistory.get(userId) || [];
  
  // Keep only timestamps within last 2.5 seconds
  const recent = timestamps.filter(t => now - t < 2500);
  
  if (recent.length >= 3) {
    return {
      isSpam: true,
      reason: 'Please slow down! Sending messages too quickly is restricted.'
    };
  }

  recent.push(now);
  messageHistory.set(userId, recent);
  return { isSpam: false };
}

/**
 * Writes an event to the global audit log collection in Firestore
 */
export async function logAuditEvent(item: Omit<AuditLogItem, 'id' | 'createdAt'>) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      ...item,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Failed to log audit event:', err);
  }
}

/**
 * Checks if user is currently banned (permanent or temporary)
 */
export async function checkUserBanStatus(userId: string): Promise<{ isBanned: boolean; reason?: string; until?: string }> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return { isBanned: false };

    const data = userDoc.data();
    if (!data.isBanned) return { isBanned: false };

    // Check if temporary ban has expired
    if (data.bannedUntil) {
      const banExpiresAt = new Date(data.bannedUntil).getTime();
      if (Date.now() > banExpiresAt) {
        // Expired! Auto-unban
        await setDoc(doc(db, 'users', userId), {
          isBanned: false,
          bannedUntil: null,
          banReason: null
        }, { merge: true });
        return { isBanned: false };
      }
    }

    return {
      isBanned: true,
      reason: data.banReason || 'Your account has been suspended by an administrator.',
      until: data.bannedUntil
    };
  } catch (e) {
    console.warn('Ban check error:', e);
    return { isBanned: false };
  }
}
