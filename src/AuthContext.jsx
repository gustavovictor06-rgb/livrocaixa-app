import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from './firebase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
    return unsub;
  }, []);

  const signup = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Cria o perfil de acesso: o administrador já entra aprovado, todo
    // mundo mais começa pendente até ser aprovado manualmente.
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: cred.user.email,
      status: cred.user.email === ADMIN_EMAIL ? 'approved' : 'pending',
      createdAt: serverTimestamp(),
    });
    return cred;
  };

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  // Garante que o usuário tem um perfil de acesso (cobre contas criadas
  // antes desse recurso existir).
  const ensureProfile = async (u) => {
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
    const profile = {
      email: u.email,
      status: u.email === ADMIN_EMAIL ? 'approved' : 'pending',
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  };

  return (
    <AuthContext.Provider value={{ user, checking, signup, login, logout, resetPassword, ensureProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
