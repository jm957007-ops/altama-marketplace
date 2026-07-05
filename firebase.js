import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Reutiliza el mismo proyecto de Firebase que ya creaste para
// "Vacaciones de Controladores de Puerta" (control-vacaciones-7f9d8).
// Esta app guarda sus datos en una colección distinta ("altama"),
// así que no chocan entre sí. Si prefieres un proyecto separado,
// solo reemplaza estos valores por los de un proyecto nuevo.

const firebaseConfig = {
  apiKey: "AIzaSyD5QbByeSoejLdJcPuzDaveILlOOspVhrc",
  authDomain: "control-vacaciones-7f9d8.firebaseapp.com",
  projectId: "control-vacaciones-7f9d8",
  storageBucket: "control-vacaciones-7f9d8.firebasestorage.app",
  messagingSenderId: "834860023585",
  appId: "1:834860023585:web:73c9e40e8791ef83e0c860",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
