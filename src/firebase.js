import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAZCRJPIRvIJigvhbQPwj4y81P6Pi6FKFg",
  authDomain: "livrocaixa-app.firebaseapp.com",
  projectId: "livrocaixa-app",
  storageBucket: "livrocaixa-app.firebasestorage.app",
  messagingSenderId: "1039726275397",
  appId: "1:1039726275397:web:bb48c488eb34b709532c2c",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
