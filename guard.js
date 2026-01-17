// guard.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const config = window.FIREBASE_CONFIG;
const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);

// Bloqueia home sem login
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.replace("login.html");
});
