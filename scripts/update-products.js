// scripts/update-products.js
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const PRODUCTS_PATH = path.join(process.cwd(), "products.json");

// limite pra não virar um monstro
const MAX_ITEMS = 3000;

// rotação simples (ajuda a “entrar coisa nova”)
const CATEGORY_ROTATION = [
  { slug: "eletronicos", name: "Eletrônicos & Acessórios" },
  { slug: "beleza", name: "Beleza" },
  { slug: "moda-feminina", name: "Moda Feminina" },
  { slug: "moda-masculina", name: "Moda Masculina" },
  { slug: "casa", name: "Casa & Decoração" },
  { slug: "infantis", name: "Infantis" },
  { slug: "miniaturas", name: "Miniaturas de carrinhos" },
];

function nowISO() {
  return new Date().toISOString();
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function keyOf(item) {
  const source = item.source || "shopee_affiliate";
  const sourceId = String(item.sourceId || "");
  return `${source}:${sourceId}`;
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.warn("⚠️ products.json inválido, recriando…");
    return fallback;
  }
}

function normalizeItem(raw, categoryFallback) {
  const source = raw.source || "shopee_affiliate";
  const sourceId = String(raw.sourceId ?? raw.itemid ?? raw.product_id ?? raw.id ?? "");

  // IMPORTANTE: sourceId precisa existir
  if (!sourceId) return null;

  const title = String(raw.title ?? raw.name ?? "").trim();
  const imageUrl = String(raw.imageUrl ?? raw.image_url ?? raw.thumb ?? "");
  const productUrl = String(raw.productUrl ?? raw.url ?? raw.link ?? "");
  const price = safeNumber(raw.price);
  const promoPrice = safeNumber(raw.promoPrice);

  const categorySlug = String(raw.categorySlug ?? categoryFallback?.slug ?? "geral");
  const categoryName = String(raw.categoryName ?? categoryFallback?.name ?? "Geral");

  const tiktokUrl =
    raw.tiktokUrl && String(raw.tiktokUrl).trim()
      ? String(raw.tiktokUrl)
      : null;

  return {
    source,
    sourceId,
    title,
    imageUrl,
    price,
    promoPrice,
    productUrl,
    categorySlug,
    categoryName,
    tiktokUrl,
    // addedAt será setado no merge quando for novo
  };
}

/**
 * ✅ Coloque aqui sua lógica real de busca na Shopee
 * Retorne um array de itens no formato parecido com seu products.json (ou raw que normalizeItem aguente).
 *
 * Dica:
 * - Rode por categoria e por páginas (ex.: page 1..5)
 * - Alterne a cada execução (rotação) pra sempre “entrar coisa nova”
 */
async function fetchFromShopee({ category, page }) {
  // TODO: substituir por sua implementação real
  // Exemplo de retorno:
  // return [{ sourceId:"123", title:"...", imageUrl:"...", price: 12.9, productUrl:"..." , categorySlug: category.slug, categoryName: category.name }];
  return [];
}

async function collectNewBatch() {
  // rotação por hora: muda categoria automaticamente
  const hour = new Date().getUTCHours();
  const category = CATEGORY_ROTATION[hour % CATEGORY_ROTATION.length];

  // também varia páginas
  const pages = [1, 2, 3]; // aumente pra 5 se quiser
  const all = [];

  for (const page of pages) {
    const batch = await fetchFromShopee({ category, page });
    if (Array.isArray(batch)) all.push(...batch.map((x) => ({ ...x, categorySlug: category.slug, categoryName: category.name })));
  }

  return { category, items: all };
}

function mergeProducts(existingItems, incomingItems) {
  const map = new Map();

  // primeiro entra o existente
  for (const item of existingItems) {
    if (!item) continue;
    map.set(keyOf(item), item);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const raw of incomingItems) {
    const normalized = normalizeItem(raw, { slug: raw.categorySlug, name: raw.categoryName });
    if (!normalized) continue;

    const k = keyOf(normalized);
    const prev = map.get(k);

    if (!prev) {
      // novo
      map.set(k, { ...normalized, addedAt: nowISO() });
      addedCount++;
    } else {
      // existente: atualiza campos “vivos” e preserva addedAt
      map.set(k, {
        ...prev,
        ...normalized,
        addedAt: prev.addedAt || prev.added_at || nowISO(),
      });
      updatedCount++;
    }
  }

  // ordena: mais novos primeiro
  const merged = Array.from(map.values()).sort((a, b) => {
    const da = Date.parse(a.addedAt || 0) || 0;
    const db = Date.parse(b.addedAt || 0) || 0;
    return db - da;
  });

  return {
    items: merged.slice(0, MAX_ITEMS),
    stats: { addedCount, updatedCount, total: merged.length },
  };
}

async function main() {
  const current = readJsonIfExists(PRODUCTS_PATH, { updatedAt: null, items: [] });
  const existingItems = Array.isArray(current.items) ? current.items : [];

  const { category, items: incomingRaw } = await collectNewBatch();

  const { items: mergedItems, stats } = mergeProducts(existingItems, incomingRaw);

  const next = {
    updatedAt: nowISO(),
    // opcional: debug do que foi buscado nessa rodada
    lastRun: {
      categorySlug: category.slug,
      categoryName: category.name,
      fetchedAt: nowISO(),
      added: stats.addedCount,
      updated: stats.updatedCount,
    },
    items: mergedItems,
  };

  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(next, null, 2), "utf8");

  console.log("✅ products.json atualizado");
  console.log(`Categoria: ${category.slug} | novos: ${stats.addedCount} | atualizados: ${stats.updatedCount} | total: ${stats.total}`);
}

main().catch((err) => {
  console.error("❌ erro no update-products:", err);
  process.exit(1);
});
