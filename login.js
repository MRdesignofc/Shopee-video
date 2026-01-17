import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fbApp);
const provider = new GoogleAuthProvider();

const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const underline = document.getElementById("tabUnderline");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const msgLogin = document.getElementById("msgLogin");
const msgSignup = document.getElementById("msgSignup");

const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");

const signupEmail = document.getElementById("signupEmail");
const signupPass = document.getElementById("signupPass");
const signupPass2 = document.getElementById("signupPass2");

const googleBtn = document.getElementById("googleBtn");
const googleBtn2 = document.getElementById("googleBtn2");
const forgotBtn = document.getElementById("forgotBtn");

function setTab(which){
  const isLogin = which === "login";

  tabLogin.classList.toggle("is-active", isLogin);
  tabSignup.classList.toggle("is-active", !isLogin);

  tabLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
  tabSignup.setAttribute("aria-selected", !isLogin ? "true" : "false");

  loginForm.classList.toggle("is-hidden", !isLogin);
  signupForm.classList.toggle("is-hidden", isLogin);

  underline.style.transform = isLogin ? "translateX(0%)" : "translateX(100%)";

  msgLogin.textContent = "";
  msgSignup.textContent = "";
}

tabLogin.onclick = () => setTab("login");
tabSignup.onclick = () => setTab("signup");

function humanizeFirebaseError(err){
  const code = err?.code || "";
  if (code.includes("auth/invalid-credential")) return "E-mail ou senha inválidos.";
  if (code.includes("auth/user-not-found")) return "Usuário não encontrado.";
  if (code.includes("auth/wrong-password")) return "Senha incorreta.";
  if (code.includes("auth/invalid-email")) return "E-mail inválido.";
  if (code.includes("auth/email-already-in-use")) return "Esse e-mail já está em uso.";
  if (code.includes("auth/weak-password")) return "Crie uma senha mais forte (mín. 6 caracteres).";
  if (code.includes("auth/popup-closed-by-user")) return "Janela do Google foi fechada.";
  if (code.includes("auth/cancelled-popup-request")) return "Popup do Google cancelado.";
  return "Ocorreu um erro. Tente novamente.";
}

function goHome(){
  window.location.replace("index.html");
}

// LOGIN EMAIL/SENHA
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgLogin.textContent = "";

  const email = (loginEmail.value || "").trim();
  const pass = (loginPass.value || "").trim();

  try{
    await signInWithEmailAndPassword(auth, email, pass);
    goHome();
  }catch(err){
    msgLogin.textContent = humanizeFirebaseError(err);
  }
});

// SIGNUP
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgSignup.textContent = "";

  const email = (signupEmail.value || "").trim();
  const pass = (signupPass.value || "").trim();
  const pass2 = (signupPass2.value || "").trim();

  if (pass !== pass2){
    msgSignup.textContent = "As senhas não conferem.";
    return;
  }

  try{
    await createUserWithEmailAndPassword(auth, email, pass);
    goHome();
  }catch(err){
    msgSignup.textContent = humanizeFirebaseError(err);
  }
});

// GOOGLE LOGIN
async function loginWithGoogle(targetMsgEl){
  targetMsgEl.textContent = "";
  try{
    await signInWithPopup(auth, provider);
    goHome();
  }catch(err){
    targetMsgEl.textContent = humanizeFirebaseError(err);
  }
}

googleBtn.onclick = () => loginWithGoogle(msgLogin);
googleBtn2.onclick = () => loginWithGoogle(msgSignup);

// RESET SENHA
forgotBtn.onclick = async () => {
  msgLogin.textContent = "";

  const email = (loginEmail.value || "").trim();
  if (!email){
    msgLogin.textContent = "Digite seu e-mail para enviar o reset de senha.";
    return;
  }

  try{
    await sendPasswordResetEmail(auth, email);
    msgLogin.textContent = "Enviei um e-mail para redefinir sua senha.";
  }catch(err){
    msgLogin.textContent = humanizeFirebaseError(err);
  }
};

// default
setTab("login");
