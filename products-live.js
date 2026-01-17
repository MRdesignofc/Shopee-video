const PRODUCTS_URL = "./products.json";
const POLL_MS = 60 * 60 * 1000; // 1 hora (você pode baixar pra 10 min)
const CACHE_KEY = "shoptrends:products_cache_v1";
const MAX_PRODUCTS = 500;

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); }
  catch { return []; }
}

function saveCache(list) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, MAX_PRODUCTS)));
}

function uniqMergeById(oldList, newList) {
  const map = new Map();
  // mantém os antigos
  for (const p of oldList) map.set(String(p.id), p);
  // sobrescreve/insere novos (prioriza dados novos)
  for (const p of newList) map.set(String(p.id), p);
  // retorna ordenado: mais recentes primeiro (updated_at)
  return Array.from(map.values()).sort((a,b) => {
    const da = Date.parse(a.updated_at || 0) || 0;
    const db = Date.parse(b.updated_at || 0) || 0;
    return db - da;
  });
}

async function fetchProductsNoCache() {
  const res = await fetch(PRODUCTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar products.json");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.products || []);
}

async function refreshProducts() {
  const oldList = loadCache();
  const newList = await fetchProductsNoCache();

  // Conte quantos são realmente novos por ID
  const oldIds = new Set(oldList.map(p => String(p.id)));
  const trulyNew = newList.filter(p => !oldIds.has(String(p.id)));

  const merged = uniqMergeById(oldList, newList);
  saveCache(merged);

  // Aqui você chama seu render atual
  // Ex: renderProducts(merged)
  if (typeof window.renderProducts === "function") {
    window.renderProducts(merged);
  }

  // se você tiver um elemento status:
  const status = document.getElementById("updateStatus");
  if (status) {
    status.textContent = trulyNew.length
      ? `✅ ${trulyNew.length} produtos novos adicionados`
      : `✅ Produtos atualizados (sem novos)`;
  }
}

function startHourlyUpdates() {
  refreshProducts().catch(console.error);
  setInterval(() => refreshProducts().catch(console.error), POLL_MS);
}

document.addEventListener("DOMContentLoaded", startHourlyUpdates);
