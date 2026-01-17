/**
 * Update products.json using Shopee credentials stored as GitHub Secrets.
 *
 * Required env:
 * - SHOPEE_APP_ID
 * - SHOPEE_SECRET
 * - SHOPEE_API_URL   (endpoint base/rota completa que retorna itens)
 *
 * Output:
 * - /products.json   { updatedAt, items: [...] }
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUT_FILE = path.join(process.cwd(), "products.json");
const MAX_ITEMS = 5000;

function nowUTCString() {
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
  const sourceId = String(p.sourceId ?? p.itemid ?? p.product_id ?? p.id ?? "");
  if (!sourceId) return null;

  const title = String(p.title ?? p.name ?? "").trim();
  if (!title) return null;

  return {
    source,
    sourceId,
    title,
    imageUrl: p.imageUrl ?? p.image_url ?? p.thumb ?? "",
    price: typeof p.price === "number" ? p.price : Number(p.price) || 0,
    promoPrice:
      p.promoPrice == null
        ? null
        : (typeof p.promoPrice === "number" ? p.promoPrice : Number(p.promoPrice) || null),
    productUrl: p.productUrl ?? p.url ?? p.link ?? "",
    categorySlug: p.categorySlug ?? p.category_slug ?? "geral",
    categoryName: p.categoryName ?? p.category_name ?? "Geral",
    tiktokUrl: p.tiktokUrl ?? null,
    addedAt: p.addedAt ?? null,
  };
}

/**
 * NOTE:
 * I don't assume Shopee's exact signature scheme because it varies by program.
 * This helper gives you a standard HMAC signature pattern you can adapt if needed.
 *
 * Many affiliate APIs do something like:
 *   sign = HMAC_SHA256(secret, appId + timestamp + path + body)
 *
 * If your existing implementation differs, you can adjust the payload composition here.
 */
function hmacSha256Hex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function callShopeeApi({ apiUrl, appId, secret, payload }) {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Common-ish signing approach (adjust if your API docs differ)
  const body = JSON.stringify(payload || {});
  const signPayload = `${appId}${timestamp}${apiUrl}${body}`;
  const signature = hmacSha256Hex(secret, signPayload);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "x-app-id": appId,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Shopee API HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`);
  }

  // tenta parsear json
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON da Shopee API: ${text.slice(0, 200)}`);
  }
}

function merge(oldItems, newItems) {
  const map = new Map();

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

    if (!n.tiktokUrl) n.tiktokUrl = buildTikTokUrl(n.title, n.categoryName);

    const k = keyOf(n);
    const prev = map.get(k);

    if (!prev) {
      map.set(k, { ...n, addedAt: n.addedAt || new Date().toISOString() });
      added++;
    } else {
      map.set(k, {
        ...prev,
        ...n,
        addedAt: prev.addedAt || n.addedAt || new Date().toISOString(),
      });
      updated++;
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => {
    const da = Date.parse(a.addedAt || 0) || 0;
    const db = Date.parse(b.addedAt || 0) || 0;
    return db - da;
  });

  return { items: merged.slice(0, MAX_ITEMS), added, updated, total: merged.length };
}

async function main() {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_SECRET;
  const apiUrl = process.env.SHOPEE_API_URL;

  if (!appId || !secret || !apiUrl) {
    throw new Error(
      "Faltam env vars. Você precisa definir SHOPEE_APP_ID, SHOPEE_SECRET e SHOPEE_API_URL nos Secrets do GitHub."
    );
  }

  const current = readJSONIfExists(OUT_FILE, { updatedAt: null, items: [] });
  const oldItems = Array.isArray(current.items) ? current.items : [];

  // 🔧 Payload genérico — ajuste conforme o endpoint que você usa.
  // Se seu endpoint já retorna tudo sem payload, deixe {}.
  const payload = {
    // exemplo de filtros:
    // country: "BR",
    // page: 1,
    // page_size: 200,
  };

  console.log("🌐 Chamando Shopee API…");
  const data = await callShopeeApi({ apiUrl, appId, secret, payload });

  // Aceita formatos comuns:
  // 1) { items: [...] }
  // 2) { data: { items: [...] } }
  // 3) { list: [...] }
  // 4) [...]
  const incomingItems = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data?.data?.items)
        ? data.data.items
        : Array.isArray(data.list)
          ? data.list
          : [];

  if (!incomingItems.length) {
    console.log("⚠️ API retornou 0 itens. Não vou sobrescrever seu catálogo.");
    return;
  }

  const { items, added, updated, total } = merge(oldItems, incomingItems);

  const out = {
    updatedAt: nowUTCString(),
    items,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log("✅ products.json atualizado");
  console.log(`➕ novos: ${added} | ♻️ atualizados: ${updated} | total: ${total} | salvo: ${items.length}`);
}

main().catch((err) => {
  console.error("❌ Falha no update-products:", err);
  process.exit(1);
});
