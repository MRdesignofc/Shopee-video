import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const btn = document.getElementById("logoutBtn");

if (btn) {
  const config = window.FIREBASE_CONFIG;

  if (!config || !config.apiKey) {
    console.error("FIREBASE_CONFIG não carregou.");
  } else {
    // evita erro de inicializar duas vezes
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const auth = getAuth(app);

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Saindo...";
      try {
        await signOut(auth);
      } catch (e) {
        console.error(e);
      } finally {
        window.location.replace("login.html");
      }
    });
  }
}
