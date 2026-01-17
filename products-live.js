// products-live.js (ANTI-LOOP / SINGLETON COMPLETO)
(() => {
  if (window.__shopTrendsLiveUpdater?.started) {
    console.warn("[ShopTrends] Updater já iniciado. Ignorando duplicata.");
    return;
  }

  const updater = {
    started: true,
    inFlight: false,
    timer: null,
    PRODUCTS_URL: "./products.json",
    POLL_MS: 60 * 60 * 1000, // 1 hora
    CACHE_KEY: "shoptrends:cache_items_v1",
    MAX: 800,
  };

  window.__shopTrendsLiveUpdater = updater;

  const keyOf = (p) => `${p.source}:${p.sourceId}`;

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

  async function refreshOnce() {
    if (updater.inFlight) return;
    updater.inFlight = true;

    const status = document.getElementById("updateStatus");
    if (status) status.textContent = "🔄 Atualizando…";

    try {
      const cached = loadCache();
      const cachedKeys = new Set(cached.map(keyOf));

      const res = await fetch(`${updater.PRODUCTS_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar products.json");

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      const newOnes = items.filter((p) => !cachedKeys.has(keyOf(p)));

      const map = new Map(cached.map((p) => [keyOf(p), p]));
      for (const p of items) map.set(keyOf(p), p);

      const merged = Array.from(map.values()).sort(
        (a, b) =>
          (Date.parse(b.addedAt || 0) || 0) - (Date.parse(a.addedAt || 0) || 0)
      );

      saveCache(merged);

      if (typeof window.renderProducts === "function") {
        window.renderProducts(merged);
      }

      if (status) {
        status.textContent = newOnes.length
          ? `✅ ${newOnes.length} novos produtos adicionados`
          : "✅ Atualizado";
      }
    } catch (e) {
      console.error(e);
      if (status) status.textContent = "❌ Erro ao atualizar produtos";
    } finally {
      updater.inFlight = false;

      if (updater.timer) clearTimeout(updater.timer);
      updater.timer = setTimeout(refreshOnce, updater.POLL_MS);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    refreshOnce();
  });
})();
