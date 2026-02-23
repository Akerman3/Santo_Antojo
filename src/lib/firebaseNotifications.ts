import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA8JBR0o7c7vD9WLm8QnKA7tQLmUCfXb2U",
    authDomain: "businesschat-admin.firebaseapp.com",
    projectId: "businesschat-admin",
    storageBucket: "businesschat-admin.firebasestorage.app",
    messagingSenderId: "235588078481",
    appId: "1:235588078481:android:c951e33fd6f6f66b6c6830",
};

// Inicializar una instancia separada solo para notificaciones
const app = getApps().find(a => a.name === "notifications")
    || initializeApp(firebaseConfig, "notifications");

export const notificationDb = getFirestore(app);
