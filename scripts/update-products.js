/**
 * Shop Trends – Atualização automática de produtos
 * Node.js script para GitHub Actions
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "products.json");

// Limite máximo de produtos (evita JSON gigante)
const MAX_ITEMS = 800;

// ===== util =====
function nowUTC() {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function loadJSON(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ===== simulação de novos produtos =====
// 🔥 AQUI você troca pela Shopee API / scraping / webhook
function fetchNewProductsMock() {
  const baseId = Date.now();

  return [
    {
      source: "shopee_affiliate",
      sourceId: String(baseId),
      title: "Produto em alta Shopee " + baseId,
      imageUrl: "https://via.placeholder.com/600x600.png?text=Shopee+Trend",
      price: (Math.random() * 200 + 20).toFixed(2),
      promoPrice: null,
      productUrl: "https://shopee.com.br",
      categorySlug: "eletronicos",
      categoryName: "Eletrônicos & Acessórios",
      tiktokUrl: null,
      addedAt: new Date().toISOString()
    }
  ];
}

// ===== main =====
(function run() {
  console.log("🔄 Atualizando products.json...");

  const existing = loadJSON(OUTPUT) || { updatedAt: null, items: [] };
  const oldItems = Array.isArray(existing.items) ? existing.items : [];

  const oldMap = new Map(
    oldItems.map(p => [`${p.source}:${p.sourceId}`, p])
  );

  const incoming = fetchNewProductsMock();
  let added = 0;

  for (const p of incoming) {
    const key = `${p.source}:${p.sourceId}`;
    if (!oldMap.has(key)) {
      oldMap.set(key, p);
      added++;
    }
  }

  const merged = Array.from(oldMap.values())
    .sort((a, b) => {
      const da = Date.parse(a.addedAt || 0) || 0;
      const db = Date.parse(b.addedAt || 0) || 0;
      return db - da;
    })
    .slice(0, MAX_ITEMS);

  const output = {
    updatedAt: nowUTC(),
    items: merged
  };

  saveJSON(OUTPUT, output);

  console.log(`✅ Atualizado com sucesso`);
  console.log(`➕ Novos produtos: ${added}`);
  console.log(`📦 Total no arquivo: ${merged.length}`);
})();
