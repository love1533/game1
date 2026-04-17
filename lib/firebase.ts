import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDQAcmvGEB2dP_ga4v9oIpEM1OsLskfaTM",
  authDomain: "suhun-b5be8.firebaseapp.com",
  projectId: "suhun-b5be8",
  storageBucket: "suhun-b5be8.firebasestorage.app",
  messagingSenderId: "870827040641",
  appId: "1:870827040641:web:73692aad3ec38f43a1d280",
  measurementId: "G-T0F768CNZG",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
