import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyD3jizUKjuCJ3TjSYBYQtQH0ziS3zb_mVI',
  authDomain: 'book-jb.firebaseapp.com',
  databaseURL: 'https://book-jb-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'book-jb',
  storageBucket: 'book-jb.firebasestorage.app',
  messagingSenderId: '774601082110',
  appId: '1:774601082110:web:3b3ff9da743fa7c86111af',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// 오프라인 캐시: 재접속 시 즉시 화면 표시 (로딩 지연 해소)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
