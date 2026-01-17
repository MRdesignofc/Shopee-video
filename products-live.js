// products-live.js
const PRODUCTS_URL = "./products.json";
const POLL_MS = 60 * 60 * 1000; // 1h
const CACHE_KEY = "shoptrends:cache_items_v1";
const MAX = 800;

let inFlight = false;
let timer = null;

const keyOf = (p) => `${p.source}:${p.sourceId}`;

function loadCache(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; } }
function saveCache(list){ localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, MAX))); }

async function refreshOnce() {
  if (inFlight) return;
  inFlight = true;

  const status = document.getElementById("updateStatus");
  if (status) status.textContent = "🔄 Atualizando…";

  try {
    const cached = loadCache();
    const cachedKeys = new Set(cached.map(keyOf));

    const res = await fetch(`${PRODUCTS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Falha ao carregar products.json");
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const newOnes = items.filter(p => !cachedKeys.has(keyOf(p)));

    const map = new Map(cached.map(p => [keyOf(p), p]));
    for (const p of items) map.set(keyOf(p), p);

    const merged = Array.from(map.values()).sort(
      (a,b) => (Date.parse(b.addedAt||0)||0) - (Date.parse(a.addedAt||0)||0)
    );

    saveCache(merged);

    // Render (só 1 lugar!)
    if (typeof window.renderProducts === "function") {
      window.renderProducts(merged);
    }

    if (status) {
      status.textContent = newOnes.length
        ? `✅ ${newOnes.length} novos produtos adicionados`
        : `✅ Atualizado`;
    }
  } catch (e) {
    console.error(e);
    if (status) status.textContent = "❌ Erro ao atualizar produtos";
  } finally {
    inFlight = false;
  }
}

function start() {
  // evita múltiplos intervals se o script for carregado 2x
  if (timer) clearInterval(timer);

  refreshOnce();
  timer = setInterval(refreshOnce, POLL_MS);
}

document.addEventListener("DOMContentLoaded", start);
