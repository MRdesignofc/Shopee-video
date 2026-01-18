// guard.js — protege a HOME sem login (Firebase Auth)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

// Usa a config global
const config = window.FIREBASE_CONFIG;

// Evita inicializar o Firebase duas vezes
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);

// Bloqueia acesso à home sem login
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("login.html");
  }
});
