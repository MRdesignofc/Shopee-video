import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const btn = document.getElementById("logoutBtn");

if (btn) {
  const config = window.FIREBASE_CONFIG;
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const auth = getAuth(app);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Saindo...";
    try {
      await signOut(auth);
    } finally {
      window.location.replace("login.html");
    }
  });
}
