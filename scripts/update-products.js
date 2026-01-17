/**
 * Shopee Affiliate BR (GraphQL) -> products.json
 *
 * Required env:
 *  - SHOPEE_APP_ID
 *  - SHOPEE_SECRET
 *
 * Optional env:
 *  - SHOPEE_API_URL (default: https://open-api.affiliate.shopee.com.br/graphql)
 *  - PAGES_PER_KEYWORD (default 2)  // páginas por keyword
 *  - LIMIT_PER_PAGE (default 50)
 *  - SORT_TYPE (default 5)
 *
 * Output:
 *  - /products.json  { updatedAt: "YYYY-MM-DD HH:mm UTC", items: [...] }
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUT_FILE = path.join(process.cwd(), "products.json");
const CATS_FILE = path.join(process.cwd(), "data", "categories.json");

const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_SECRET;

const ENDPOINT = process.env.SHOPEE_API_URL || "https://open-api.affiliate.shopee.com.br/graphql";
const PAGES_PER_KEYWORD = Number(process.env.PAGES_PER_KEYWORD || 2);
const LIMIT_PER_PAGE = Number(process.env.LIMIT_PER_PAGE || 50);
const SORT_TYPE = Number(process.env.SORT_TYPE || 5);

const MAX_ITEMS = 12000;

if (!APP_ID || !SECRET) {
  console.error("❌ Defina SHOPEE_APP_ID e SHOPEE_SECRET nos Secrets do GitHub Actions.");
  process.exit(1);
}

function nowUTCString() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

function buildAuthHeader(payloadStr) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sha256Hex(`${APP_ID}${ts}${payloadStr}${SECRET}`);
  return `SHA256 Credential=${APP_ID}, Timestamp=${ts}, Signature=${signature}`;
}

function readJsonIfExists(fp, fallback) {
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
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

/**
 * Query comum: ajuste os campos se sua conta retornar schema diferente.
 */
const QUERY_PRODUCT_OFFER_V2 = `
query ProductOfferV2($listType:Int, $keyword:String, $sortType:Int, $page:Int, $limit:Int) {
  productOfferV2(listType:$listType, keyword:$keyword, sortType:$sortType, page:$page, limit:$limit) {
    nodes {
      productName
      productLink
      offerLink
      imageUrl
      price
    }
  }
}
`;

function normalizeOfferNode(node, cat) {
  const title = (node.productName || "").toString().trim();
  const imageUrl = (node.imageUrl || "").toString().trim();
  const productUrl = (node.offerLink || node.productLink || "").toString().trim();

  // tenta extrair id do link; fallback: hash do link
  let sourceId = "";
  const m = productUrl.match(/product\/(\d+)\/(\d+)/i);
  if (m && m[2]) sourceId = m[2];
  if (!sourceId) sourceId = sha256Hex(productUrl || title).slice(0, 16);

  const price = typeof node.price === "number" ? node.price : Number(node.price) || 0;

  return {
    source: "shopee_affiliate",
    sourceId,
    title,
    imageUrl,
    price,
    promoPrice: null,
    productUrl,
    categorySlug: cat.slug,
    categoryName: cat.name,
    tiktokUrl: buildTikTokUrl(title, cat.name),
    addedAt: new Date().toISOString(),
  };
}

async function gqlRequest(bodyObj) {
  const payloadStr = JSON.stringify(bodyObj);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "Authorization": buildAuthHeader(payloadStr),
    },
    body: payloadStr,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON :: ${text.slice(0, 200)}`);
  }

  if (json.errors?.length) {
    throw new Error(`GraphQL errors :: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }

  return json.data;
}

function loadCategories() {
  const fallback = [
    { slug: "eletronicos", name: "Eletrônicos & Acessórios" },
    { slug: "beleza", name: "Beleza" },
    { slug: "moda-feminina", name: "Moda Feminina" },
    { slug: "moda-masculina", name: "Moda Masculina" },
    { slug: "casa", name: "Casa & Decoração" },
    { slug: "infantis", name: "Infantis" },
    { slug: "miniaturas", name: "Miniaturas de carrinhos" },
  ];

  if (!fs.existsSync(CATS_FILE)) return fallback;

  try {
    const cats = JSON.parse(fs.readFileSync(CATS_FILE, "utf8"));
    if (Array.isArray(cats) && cats.length) {
      return cats.map((c) => ({ slug: c.slug, name: c.name })).filter((c) => c.slug && c.name);
    }
  } catch {}
  return fallback;
}

function keywordsForCategory(cat) {
  const map = {
    eletronicos: [
      "fone bluetooth",
      "smartwatch",
      "carregador usb c",
    ],
    beleza: [
      "perfume importado",
      "skincare",
      "maquiagem",
    ],
    "moda-feminina": [
      "vestido feminino",
      "conjunto feminino",
      "blusa feminina",
    ],
    "moda-masculina": [
      "camisa masculina",
      "conjunto masculino",
      "bermuda masculina",
    ],
    casa: [
      "organizador casa",
      "cozinha organizador",
      "decoracao casa",
    ],
    infantis: [
      "brinquedo infantil",
      "roupa infantil",
      "kit bebe",
    ],

    // ✅ miniaturas com foco premium/diecast (mais parecido com o seu vídeo)
    miniaturas: [
      "mini gt 1:64 diecast",
      "tarmac works 1:64 diecast",
      "inno64 1:64 diecast",
      "tomica premium 1:64",
      "maisto diecast 1:32",
      "hot wheels premium 1:64",
      "g63 g class 1:64 miniatura",
      "suv 4x4 diecast 1:64",
      "jeep wrangler 1:64 diecast",
      "land rover defender 1:64 diecast",
    ],
  };

  return map[cat.slug] || [""];
}

function mergeProducts(oldItems, newItems) {
  const map = new Map();

  for (const p of oldItems) {
    if (!p) continue;
    const k = keyOf(p);
    if (!k.endsWith(":")) map.set(k, p);
  }

  let added = 0;
  let updated = 0;

  for (const p of newItems) {
    if (!p) continue;
    const k = keyOf(p);
    const prev = map.get(k);

    if (!prev) {
      map.set(k, p);
      added++;
    } else {
      map.set(k, {
        ...prev,
        ...p,
        addedAt: prev.addedAt || p.addedAt || new Date().toISOString(),
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

async function collectOffersForCategory(cat) {
  const keywords = keywordsForCategory(cat);
  const out = [];

  for (const keyword of keywords) {
    for (let page = 1; page <= PAGES_PER_KEYWORD; page++) {
      const bodyObj = {
        query: QUERY_PRODUCT_OFFER_V2,
        operationName: "ProductOfferV2",
        variables: {
          listType: 0,
          keyword: keyword || null,
          sortType: SORT_TYPE,
          page,
          limit: LIMIT_PER_PAGE,
        },
      };

      const data = await gqlRequest(bodyObj);
      const nodes = data?.productOfferV2?.nodes || [];

      for (const n of nodes) {
        const item = normalizeOfferNode(n, cat);
        // garante tiktok url sempre
        if (!item.tiktokUrl) item.tiktokUrl = buildTikTokUrl(item.title, cat.name);
        out.push(item);
      }
    }
  }

  return out;
}

async function main() {
  console.log("🔄 Lendo catálogo atual…");
  const current = readJsonIfExists(OUT_FILE, { updatedAt: null, items: [] });
  const oldItems = Array.isArray(current.items) ? current.items : [];

  const categories = loadCategories();
  console.log(`📚 Categorias: ${categories.length}`);
  console.log(`🌐 Endpoint: ${ENDPOINT}`);

  const allNew = [];
  for (const cat of categories) {
    console.log(`➡️ Coletando: ${cat.slug} (${cat.name})`);
    try {
      const items = await collectOffersForCategory(cat);
      console.log(`   + ${items.length} itens`);
      allNew.push(...items);
    } catch (e) {
      console.log(`   ⚠️ Falhou ${cat.slug}: ${e.message}`);
    }
  }

  if (!allNew.length) {
    console.log("❌ Nenhum item retornou. Verifique credenciais / assinatura / query.");
    process.exit(1);
  }

  const { items, added, updated, total } = mergeProducts(oldItems, allNew);

  const out = {
    updatedAt: nowUTCString(),
    items,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log("✅ products.json atualizado");
  console.log(`➕ novos: ${added} | ♻️ atualizados: ${updated} | total: ${total} | salvo: ${items.length}`);
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
