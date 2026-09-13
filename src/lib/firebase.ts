import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  signInAnonymously,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  doc, 
  setDoc, 
  getDoc,
  getDocFromServer, 
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';
import { UserProfile } from '../types';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigData.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigData.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigData.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigData.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigData.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigData.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigData.measurementId,
};

const firebaseConfig = {
  apiKey: envConfig.apiKey,
  authDomain: envConfig.authDomain,
  projectId: envConfig.projectId,
  storageBucket: envConfig.storageBucket,
  messagingSenderId: envConfig.messagingSenderId,
  appId: envConfig.appId,
  measurementId: envConfig.measurementId,
};

const firestoreDatabaseId = (import.meta.env.VITE_FIRESTORE_DATABASE_ID || firebaseConfigData.firestoreDatabaseId || '').trim();

// Initialize App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specified custom database ID if available and ignoreUndefinedProperties
export const db = firestoreDatabaseId
  ? initializeFirestore(app, { ignoreUndefinedProperties: true }, firestoreDatabaseId)
  : initializeFirestore(app, { ignoreUndefinedProperties: true });

// Skill requirement: Validate connection to Firestore at boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.info(`Firebase connected to project "${firebaseConfig.projectId}"${firestoreDatabaseId ? ` / database "${firestoreDatabaseId}"` : ''}.`);
    return true;
  } catch (error) {
    const firebaseError = error as { code?: string; message?: string };
    console.error('Firebase Firestore connection failed.', {
      code: firebaseError.code,
      message: firebaseError.message,
      projectId: firebaseConfig.projectId,
      databaseId: firestoreDatabaseId || '(default)',
    });
    return false;
  }
}
testConnection();

export const DEFAULT_ADMIN_EMAILS = ['mdsohag7749@gmail.com', 'ffsohag7749@gmail.com'];

export function checkIsAdmin(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.email && DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase().trim())) return true;
  return false;
}

// Create or update user profile in Firestore
export async function syncUserProfile(user: FirebaseUser, customName?: string): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  const existingData = snap.exists() ? (snap.data() as UserProfile) : null;
  
  const displayName = customName || user.displayName || `User_${user.uid.slice(0, 5)}`;
  const avatarColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
  const randomColor = avatarColors[Math.abs(user.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % avatarColors.length];
  const photoURL = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}&backgroundColor=${randomColor.replace('#', '')}`;

  const isEmailAdmin = !!(user.email && DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase().trim()));
  const role: 'admin' | 'user' = (isEmailAdmin || existingData?.role === 'admin') ? 'admin' : 'user';

  const profileData: UserProfile = {
    uid: user.uid,
    displayName,
    email: user.email || undefined,
    photoURL,
    role,
    status: 'online',
    updatedAt: new Date().toISOString()
  };

  if (!snap.exists()) {
    profileData.createdAt = new Date().toISOString();
  }

  await setDoc(userRef, profileData, { merge: true });
  return profileData;
}

// Guest / Quick Join Sign In
export async function signInAsGuest(nickname?: string) {
  const credential = await signInAnonymously(auth);
  const displayName = nickname?.trim() || `Caller_${Math.floor(1000 + Math.random() * 9000)}`;
  await updateProfile(credential.user, { displayName });
  return syncUserProfile(credential.user, displayName);
}

// Google Sign-In
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return syncUserProfile(credential.user);
}

// Email/Password Sign-Up
export async function signUpWithEmail(email: string, pass: string, name: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(credential.user, { displayName: name });
  return syncUserProfile(credential.user, name);
}

// Email/Password Sign-In
export async function loginWithEmail(email: string, pass: string) {
  const credential = await signInWithEmailAndPassword(auth, email, pass);
  return syncUserProfile(credential.user);
}

// Sign Out
export async function logOut(uid?: string) {
  if (uid) {
    try {
      await setDoc(doc(db, 'users', uid), { status: 'offline', updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      // ignore
    }
  }
  return firebaseSignOut(auth);
}
