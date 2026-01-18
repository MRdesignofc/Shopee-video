// products-live.js (ESM) — compatível com a HOME “clean”
// - Mantém Firebase Auth
// - Mantém logout
// - Inicializa o app.js (createShopTrendsApp)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { createShopTrendsApp } from "./app.js";

// Firebase (usa window.FIREBASE_CONFIG do firebase-config.js)
const config = window.FIREBASE_CONFIG;
const fbApp = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(fbApp);

// Logout (botão “Sair”)
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn){
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Saindo...";
    try {
      await signOut(auth);
    } finally {
      window.location.replace("login.html");
    }
  });
}

// App (HOME / produtos)
const app = createShopTrendsApp({
  productsUrl: "products.json",
  categoriesUrl: "data/categories.json",
  perPage: 48,
});

app.init();
