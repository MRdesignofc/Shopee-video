/**
 * Update products.json from your existing Shopee-integrated feed (API/proxy)
 * - No mock data
 * - Merges incrementally by source+sourceId
 * - Fills tiktokUrl when null
 * - Writes /products.json (root)
 */

const fs = require("fs");
const path = require("path");

// Node 20+ has global fetch
const OUT_FILE = path.join(process.cwd(), "products.json");
const MAX_ITEMS = 5000; // ajuste se quiser (2k~20k ok, mas cuidado com tamanho)

function nowUTCString() {
  // mantém seu padrão "YYYY-MM-DD HH:mm UTC"
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function readJSONIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function keyOf(p) {
  return `${p.source || "shopee_affiliate"}:${String(p.sourceId || "")}`;
}

function buildTikTokUrl(title, categoryName) {
  const base = `${title || "produto shopee"} ${categoryName || ""} review unboxing testando`;
  return `https://www.tiktok.com/search?q=${encodeURIComponent(base.trim())}`;
}

function normalizeItem(p) {
  const source = p.source || "shopee_affiliate";
  const sourceId = String(p.sourceId ?? "");
  if (!sourceId) return null;

  const title = String(p.title ?? "").trim();
  if (!title) return null;

  return {
    source,
    sourceId,
    title,
    imageUrl: p.imageUrl || "",
    price: typeof p.price === "number" ? p.price : Number(p.price) || 0,
    promoPrice: p.promoPrice == null ? null : (typeof p.promoPrice === "number" ? p.promoPrice : Number(p.promoPrice) || null),
    productUrl: p.productUrl || "",
    categorySlug: p.categorySlug || "geral",
    categoryName: p.categoryName || "Geral",
    tiktokUrl: p.tiktokUrl || null,
    // opcional
    addedAt: p.addedAt || null,
  };
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "accept": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Feed HTTP ${res.status} ${res.statusText} :: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function merge(oldItems, newItems) {
  const map = new Map();

  // existing first
  for (const it of oldItems) {
    const n = normalizeItem(it);
    if (!n) continue;
    map.set(keyOf(n), n);
  }

  let added = 0;
  let updated = 0;

  for (const it of newItems) {
    const n = normalizeItem(it);
    if (!n) continue;

    // garante TikTok
    if (!n.tiktokUrl) n.tiktokUrl = buildTikTokUrl(n.title, n.categoryName);

    const k = keyOf(n);
    const prev = map.get(k);

    if (!prev) {
      // novo
      map.set(k, { ...n, addedAt: n.addedAt || new Date().toISOString() });
      added++;
    } else {
      // atualiza campos vivos, preserva addedAt
      map.set(k, {
        ...prev,
        ...n,
        addedAt: prev.addedAt || n.addedAt || new Date().toISOString(),
      });
      updated++;
    }
  }

  // ordena: mais novos primeiro por addedAt
  const merged = Array.from(map.values()).sort((a, b) => {
    const da = Date.parse(a.addedAt || 0) || 0;
    const db = Date.parse(b.addedAt || 0) || 0;
    return db - da;
  });

  return { items: merged.slice(0, MAX_ITEMS), added, updated, total: merged.length };
}

async function main() {
  const FEED_URL = process.env.PRODUCTS_FEED_URL;

  if (!FEED_URL) {
    throw new Error(
      "Env var PRODUCTS_FEED_URL não definida. Coloque nos Secrets do GitHub e passe no workflow."
    );
  }

  console.log("🔄 Lendo products.json atual…");
  const current = readJSONIfExists(OUT_FILE, { updatedAt: null, items: [] });
  const oldItems = Array.isArray(current.items) ? current.items : [];

  console.log("🌐 Buscando feed real:", FEED_URL);
  const data = await fetchFeed(FEED_URL);

  // aceita formatos:
  // A) { updatedAt, items: [...] }
  // B) { items: [...] }
  // C) [...items]
  const incomingItems = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : [];

  if (!incomingItems.length) {
    console.log("⚠️ Feed retornou 0 itens. Não vou sobrescrever seu catálogo.");
    // ainda atualiza timestamp (opcional). Aqui eu prefiro NÃO mexer no arquivo.
    return;
  }

  const { items, added, updated, total } = merge(oldItems, incomingItems);

  const out = {
    updatedAt: nowUTCString(),
    items,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ products.json atualizado`);
  console.log(`➕ novos: ${added} | ♻️ atualizados: ${updated} | total: ${total} | salvo: ${items.length}`);
}

main().catch((err) => {
  console.error("❌ Falha no update-products:", err);
  process.exit(1);
});
