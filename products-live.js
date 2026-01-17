import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { createShopTrendsApp } from "./app.js";

// Firebase (usa window.FIREBASE_CONFIG do firebase-config.js)
const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fbApp);

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn){
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.replace("login.html");
  };
}

// App
const app = createShopTrendsApp({
  productsUrl: "products.json",
  categoriesUrl: "data/categories.json",
  perPage: 48,
});

app.init();
