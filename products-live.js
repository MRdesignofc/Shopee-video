// products-live.js (estável, anti-loop, com fallback de caminho)
(() => {
  // evita duplicar caso o script seja carregado 2x
  if (window.__shopTrendsLiveUpdater?.started) return;

  const updater = {
    started: true,
    inFlight: false,
    timer: null,

    // tenta primeiro na raiz, depois na pasta data/
    URLS: ["./products.json", "data/products.json"],

    // 1 hora (mude se quiser: 10 * 60 * 1000)
    POLL_MS: 60 * 60 * 1000,

    CACHE_KEY: "shoptrends:cache_items_v1",
    MAX: 800,
  };

  window.__shopTrendsLiveUpdater = updater;

  const keyOf = (p) => `${p.source || "src"}:${String(p.sourceId ?? "")}`;

  function statusText(text) {
    const el = document.getElementById("updateStatus");
    if (el) el.textContent = text;
  }

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(updater.CACHE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveCache(list) {
    localStorage.setItem(updater.CACHE_KEY, JSON.stringify(list.slice(0, updater.MAX)));
  }

  async function fetchJsonTry(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao carregar: ${url}`);
    return res.json();
  }

  async function loadProductsJson() {
    let lastErr = null;
    for (const url of updater.URLS) {
      try {
        return { url, data: await fetchJsonTry(url) };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Falha ao carregar products.json");
  }

  function mergeAndSort(cached, incoming) {
    const map = new Map();

    for (const p of cached) {
      if (!p) continue;
      const k = keyOf(p);
      if (!k.endsWith(":")) map.set(k, p);
    }

    for (const p of incoming) {
      if (!p) continue;
      const k = keyOf(p);
      if (!k || k.endsWith(":")) continue;

      const prev = map.get(k);
      // preserva addedAt se já existia
      const addedAt = prev?.addedAt || p.addedAt || null;

      map.set(k, { ...prev, ...p, addedAt });
    }

    const merged = Array.from(map.values()).sort((a, b) => {
      const da = Date.parse(a.addedAt || 0) || 0;
      const db = Date.parse(b.addedAt || 0) || 0;
      return db - da;
    });

    return merged.slice(0, updater.MAX);
  }

  async function refreshOnce() {
    if (updater.inFlight) return;
    updater.inFlight = true;

    statusText("🔄 Atualizando…");

    try {
      const cached = loadCache();
      const cachedKeys = new Set(cached.map(keyOf));

      const { data } = await loadProductsJson();

      const updatedAt = data.updatedAt || data.updatedAtTop || null;
      const items = Array.isArray(data.items) ? data.items : [];

      // normaliza o mínimo pra garantir chave
      const incoming = items.map((p) => ({
        ...p,
        source: p.source || "shopee_affiliate",
        sourceId: String(p.sourceId ?? ""),
        addedAt: p.addedAt || (updatedAt ? new Date(updatedAt).toISOString?.() : null) || null,
      })).filter((p) => p.sourceId);

      const newOnes = incoming.filter((p) => !cachedKeys.has(keyOf(p)));

      const merged = mergeAndSort(cached, incoming);
      saveCache(merged);

      // renderiza na UI
      if (typeof window.renderProducts === "function") {
        window.renderProducts(merged);
      }

      if (updatedAt) {
        statusText(
          newOnes.length
            ? `✅ ${newOnes.length} novos • Atualizado: ${updatedAt}`
            : `✅ Atualizado: ${updatedAt}`
        );
      } else {
        statusText(newOnes.length ? `✅ ${newOnes.length} novos produtos` : "✅ Atualizado");
      }
    } catch (e) {
      console.error(e);
      statusText("❌ Erro ao atualizar produtos");
    } finally {
      updater.inFlight = false;

      // agenda próxima atualização só depois que terminar
      if (updater.timer) clearTimeout(updater.timer);
      updater.timer = setTimeout(refreshOnce, updater.POLL_MS);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    refreshOnce();
  });
})();
