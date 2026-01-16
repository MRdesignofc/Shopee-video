import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const config = window.FIREBASE_CONFIG;
if (!config || !config.apiKey) {
  alert("Faltou configurar o firebase-config.js");
}

const app = initializeApp(config);
const auth = getAuth(app);

let mode = "login"; // login | register

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const submitBtn = document.getElementById("submit");
const msg = document.getElementById("msg");
const form = document.getElementById("form");

function setMode(next) {
  mode = next;
  msg.textContent = "";
  if (mode === "login") {
    tabLogin.classList.remove("btn-ghost");
    tabLogin.classList.add("btn");
    tabRegister.classList.remove("btn");
    tabRegister.classList.add("btn-ghost");
    submitBtn.textContent = "Entrar";
  } else {
    tabRegister.classList.remove("btn-ghost");
    tabRegister.classList.add("btn");
    tabLogin.classList.remove("btn");
    tabLogin.classList.add("btn-ghost");
    submitBtn.textContent = "Criar conta";
  }
}

tabLogin.onclick = () => setMode("login");
tabRegister.onclick = () => setMode("register");

setMode("login");

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

// Se já estiver logado, manda pra home
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "index.html";
});
