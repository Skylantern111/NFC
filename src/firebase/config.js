import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { isInAppBrowser } from '../lib/inAppBrowser';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// True once real env values are present. Lets the UI run with placeholder
// config instead of crashing before Firebase is wired up.
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = initializeApp(
  firebaseReady
    ? firebaseConfig
    : { apiKey: 'placeholder', projectId: 'placeholder', appId: 'placeholder' }
);

// In-app browsers (Messenger & co.) can stall Firestore's streaming
// connection, so live chat messages stop arriving without an error
// (UI_UX_IMPROVEMENT_PLAN.md BUG5). Long polling is slower but steady there;
// every other browser keeps the SDK's default (auto-detect).
export const db = initializeFirestore(app, isInAppBrowser() ? { experimentalForceLongPolling: true } : {});
export const auth = getAuth(app);
export default app;
