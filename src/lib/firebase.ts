// src/lib/firebase.ts  — conexión de solo lectura al proyecto AL Calculadora
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCLx-cNIPPZy_Nq6fu08jtzwhG-wg8S8ns",
    authDomain: "alcalculadorav2.firebaseapp.com",
    projectId: "alcalculadorav2",
    storageBucket: "alcalculadorav2.firebasestorage.app",
    messagingSenderId: "338636322262",
    appId: "1:338636322262:android:ba3c5b0ed00213fdb3a077",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig, "alcalculadora");
export const db = getFirestore(app);
export const authFirebase = getAuth(app);

// Iniciar sesión anónima (necesaria para que las reglas de Firestore permitan lecturas)
export const anonSignInPromise = signInAnonymously(authFirebase).catch((err) =>
    console.warn("[Firebase ChatBot] Auth anónima falló:", err.code, "— Verifica que está habilitada en Firebase Console → Authentication → Sign-in methods")
);
