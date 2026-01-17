// products-live.js
const PRODUCTS_URL = "./products.json";
const POLL_MS = 60 * 60 * 1000; // 1 hora
const CACHE_KEY = "shoptrends:cache_items_v1";
const MAX = 800;

const keyOf = (p) => `${p.source}:${p.sourceId}`;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCache(list) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, MAX)));
}

async function refresh() {
  const cached = loadCache();
  const cachedKeys = new Set(cached.map(keyOf));

  const res = await fetch(PRODUCTS_URL, { cache: "no-store" });
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  const newOnes = items.filter(p => !cachedKeys.has(keyOf(p)));

  const map = new Map(cached.map(p => [keyOf(p), p]));
  for (const p of items) map.set(keyOf(p), p);

  const merged = Array.from(map.values()).sort(
    (a, b) =>
      (Date.parse(b.addedAt || 0) || 0) -
      (Date.parse(a.addedAt || 0) || 0)
  );

  saveCache(merged);

  // ⚠️ IMPORTANTE:
  // Essa função precisa existir no seu site
  // É ela que desenha os cards
  if (typeof window.renderProducts === "function") {
    window.renderProducts(merged);
  }

  const el = document.getElementById("updateStatus");
  if (el) {
    el.textContent = newOnes.length
      ? `✅ ${newOnes.length} novos produtos adicionados`
      : `✅ Produtos atualizados`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  refresh().catch(console.error);
  setInterval(() => refresh().catch(console.error), POLL_MS);
});
