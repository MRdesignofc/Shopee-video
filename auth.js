import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const config = window.FIREBASE_CONFIG;
if (!config || !config.apiKey) {
  alert("Faltou configurar o firebase-config.js");
}

const app = getApps().length ? getApps()[0] : initializeApp(config);
const auth = getAuth(app);

let mode = "login"; // login | register

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const submitBtn = document.getElementById("submit");
const msg = document.getElementById("msg");
const form = document.getElementById("form");
const googleBtn = document.getElementById("googleBtn");

function setMode(next) {
  mode = next;
  msg.textContent = "";

  if (mode === "login") {
    tabLogin.classList.add("is-active");
    tabRegister.classList.remove("is-active");
    submitBtn.textContent = "Entrar";
  } else {
    tabRegister.classList.add("is-active");
    tabLogin.classList.remove("is-active");
    submitBtn.textContent = "Criar conta";
  }
}

tabLogin.onclick = () => setMode("login");
tabRegister.onclick = () => setMode("register");
setMode("login");

// Email/senha
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Processando...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    if (mode === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
      msg.textContent = "Conta criada! Redirecionando...";
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      msg.textContent = "Login OK! Redirecionando...";
    }

    window.location.href = "index.html";
  } catch (err) {
    msg.textContent = (err?.message || "Erro ao autenticar").replace("Firebase:", "").trim();
  }
});

// Google Login (popup)
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    msg.textContent = "Abrindo Google...";
    googleBtn.disabled = true;

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      msg.textContent = "Login com Google OK! Redirecionando...";
      window.location.href = "index.html";
    } catch (err) {
      msg.textContent = (err?.message || "Erro no Google Login").replace("Firebase:", "").trim();
      googleBtn.disabled = false;
    }
  });
}

// Se já estiver logado, manda pra home
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "index.html";
});
