let ALL = [];
let CATS = [];
let activeCat = null;

let viewCompact = false;
let onlyFav = false;

const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0) || 0
  );

const favKey = "shoptrends:favs_v1";
const getFavs = () => new Set(JSON.parse(localStorage.getItem(favKey) || "[]"));
const setFavs = (set) => localStorage.setItem(favKey, JSON.stringify([...set]));

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJsonTry(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao carregar: ${url}`);
  return res.json();
}

async function loadProductsJson() {
  try {
    return await fetchJsonTry("./products.json");
  } catch {
    return await fetchJsonTry("data/products.json");
  }
}

function statusText(text) {
  const el = document.getElementById("updateStatus");
  if (el) el.textContent = text;
}

function normalizeItems(items, updatedAt) {
  return (items || [])
    .map((p) => ({
      ...p,
      source: p.source || "shopee_affiliate",
      sourceId: String(p.sourceId ?? ""),
      title: (p.title || "").toString(),
      imageUrl: p.imageUrl || "",
      productUrl: p.productUrl || "",
      price: Number(p.price ?? 0) || 0,
      promoPrice: p.promoPrice == null ? null : Number(p.promoPrice),
      categorySlug: p.categorySlug || "geral",
      categoryName: p.categoryName || "Geral",
      addedAt: p.addedAt || updatedAt || null,
    }))
    .filter((p) => p.sourceId && p.title);
}

function scoreTrending(p) {
  // sem sold_24h: usamos preço promo + recência (addedAt) como heurística
  const promo = p.promoPrice == null ? p.price : p.promoPrice;
  const discount = p.promoPrice != null && p.price ? (p.price - p.promoPrice) : 0;
  const recency = Date.parse(p.addedAt || 0) || 0;
  return (discount * 100) + (recency / 1e11) - promo;
}

function scoreBest(p) {
  // fallback: “mais vendidos” -> menor preço + presença de promo
  const promo = p.promoPrice == null ? p.price : p.promoPrice;
  const hasPromo = p.promoPrice != null ? 1 : 0;
  return (hasPromo * 100000) - promo;
}

function scoreDeals(p) {
  // maior desconto
  if (p.promoPrice == null || !p.price) return -Infinity;
  const pct = Math.round((1 - (p.promoPrice / p.price)) * 100);
  return pct;
}

function buildTikTokUrl(title) {
  const q = encodeURIComponent(`${title} review unboxing testando`);
  return `https://www.tiktok.com/search?q=${q}`;
}

function openModal(p) {
  const modal = document.getElementById("modal");
  if (!modal) return;

  const img = document.getElementById("m_img");
  const title = document.getElementById("m_title");
  const price = document.getElementById("m_price");
  const buy = document.getElementById("m_buy");
  const cat = document.getElementById("m_cat");
  const tiktok = document.getElementById("m_tiktok");

  if (img) img.src = p.imageUrl || "";
  if (title) title.textContent = p.title || "Produto";
  if (price) price.textContent = fmtBRL(p.promoPrice ?? p.price);
  if (buy) buy.href = p.productUrl || "#";
  if (cat) cat.textContent = p.categoryName || "";

  if (tiktok) {
    tiktok.href = p.tiktokUrl || buildTikTokUrl(p.title || "produto shopee");
  }

  modal.showModal();
}

function makeCard(p) {
  const favs = getFavs();
  const isFav = favs.has(p.sourceId);

  const promo = p.promoPrice ?? null;
  const showOld = promo != null && p.price;
  const pct =
    showOld && p.price
      ? Math.max(0, Math.round((1 - promo / p.price) * 100))
      : null;

  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;

  card.innerHTML = `
    <img src="${p.imageUrl || ""}" alt="${escapeHtml(p.title)}" loading="lazy"/>
    <div class="pad">
      <h3>${escapeHtml(p.title)}</h3>

      <div class="price-row" style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
        <div>
          <p class="price" style="margin:0;">${fmtBRL(promo ?? p.price)}</p>
          ${showOld ? `<span class="small" style="text-decoration:line-through;opacity:.7;">${fmtBRL(p.price)}</span>` : ""}
        </div>
        ${pct != null ? `<span class="badge" style="background:rgba(238,77,45,.08);color:#ee4d2d;border:1px solid rgba(238,77,45,.25)">-${pct}%</span>` : ""}
      </div>

      <div class="tag">${escapeHtml(p.categoryName || "")}</div>

      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;">
        <button class="btn btn-ghost" type="button">Ver</button>
        <button class="btn btn-ghost" type="button" aria-label="Favoritar">${isFav ? "♥" : "♡"}</button>
      </div>
    </div>
  `;

  const favBtn = card.querySelectorAll("button")[1];
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const set = getFavs();
    const k = p.sourceId;
    if (set.has(k)) set.delete(k);
    else set.add(k);
    setFavs(set);
    renderAll();
  });

  const open = () => openModal(p);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}

function fillGrid(id, items, limit = 12) {
  const grid = document.getElementById(id);
  if (!grid) return;
  grid.innerHTML = "";
  items.slice(0, limit).forEach((p) => grid.appendChild(makeCard(p)));
  if (viewCompact) grid.classList.add("is-compact");
  else grid.classList.remove("is-compact");
}

function renderCats() {
  const el = document.getElementById("cats");
  if (!el) return;
  el.innerHTML = "";

  // chips
  el.appendChild(mkChip("Todos", null));
  CATS.forEach((c) => el.appendChild(mkChip(c.name, c.slug)));
}

function mkChip(name, slug) {
  const b = document.createElement("button");
  const isActive = activeCat === slug || (slug === null && activeCat === null);
  b.className = "chip" + (isActive ? " active" : "");
  b.textContent = name;
  b.onclick = () => {
    activeCat = slug;
    const sel = document.getElementById("cat");
    if (sel) sel.value = slug || "all";
    renderCats();
    renderAll();
  };
  return b;
}

function populateSelectCats() {
  const sel = document.getElementById("cat");
  if (!sel) return;

  const cats = Array.from(
    new Map(
      ALL.map((p) => [p.categorySlug, p.categoryName]).filter(([slug]) => slug)
    ).entries()
  ).map(([slug, name]) => ({ slug, name }));

  cats.sort((a, b) => a.name.localeCompare(b.name));

  sel.innerHTML = `<option value="all">Todas categorias</option>` + cats
    .map((c) => `<option value="${c.slug}">${c.name}</option>`)
    .join("");
}

function applyFilters() {
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const selCat = document.getElementById("cat")?.value || "all";
  const sort = document.getElementById("sort")?.value || "trending";

  // sincroniza chip com select (se usuário mexer no select)
  activeCat = selCat === "all" ? null : selCat;

  let list = ALL.filter((p) => {
    const okCat = !activeCat || p.categorySlug === activeCat;
    const okQ = !q || (p.title || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  if (onlyFav) {
    const favs = getFavs();
    list = list.filter((p) => favs.has(p.sourceId));
  }

  // ordenação do “Ver tudo”
  if (sort === "bestsellers") list.sort((a, b) => scoreBest(b) - scoreBest(a));
  else if (sort === "discount") list.sort((a, b) => scoreDeals(b) - scoreDeals(a));
  else if (sort === "price_asc") list.sort((a, b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price));
  else if (sort === "price_desc") list.sort((a, b) => (b.promoPrice ?? b.price) - (a.promoPrice ?? a.price));
  else list.sort((a, b) => scoreTrending(b) - scoreTrending(a));

  return list;
}

function renderAll() {
  // chips
  renderCats();

  const list = applyFilters();

  const trending = [...list].sort((a, b) => scoreTrending(b) - scoreTrending(a));
  const best = [...list].sort((a, b) => scoreBest(b) - scoreBest(a));
  const deals = [...list].sort((a, b) => scoreDeals(b) - scoreDeals(a));

  fillGrid("gridTrending", trending, 12);
  fillGrid("gridBest", best, 12);
  fillGrid("gridDeals", deals, 12);
  fillGrid("gridAll", list, 48);

  // hint atualizado
  const hint = document.getElementById("updatedHint");
  if (hint) hint.textContent = "—";
}

function wireUI() {
  document.getElementById("q")?.addEventListener("input", renderAll);
  document.getElementById("cat")?.addEventListener("change", () => {
    renderAll();
  });
  document.getElementById("sort")?.addEventListener("change", renderAll);

  document.getElementById("toggleView")?.addEventListener("click", (e) => {
    viewCompact = !viewCompact;
    e.currentTarget.setAttribute("aria-pressed", String(viewCompact));
    renderAll();
  });

  document.getElementById("onlyFav")?.addEventListener("click", (e) => {
    onlyFav = !onlyFav;
    e.currentTarget.setAttribute("aria-pressed", String(onlyFav));
    renderAll();
  });

  // manter seu modal fechando
  document.getElementById("close")?.addEventListener("click", () => {
    document.getElementById("modal")?.close();
  });
  document.getElementById("modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "modal") document.getElementById("modal")?.close();
  });

  // Botões do hero (mantém)
  document.getElementById("btnTop")?.addEventListener("click", () => {
    activeCat = null;
    const q = document.getElementById("q");
    if (q) q.value = "";
    const sel = document.getElementById("cat");
    if (sel) sel.value = "all";
    renderAll();
  });

  document.getElementById("btnMini")?.addEventListener("click", () => {
    activeCat = "miniaturas";
    const sel = document.getElementById("cat");
    if (sel) sel.value = "miniaturas";
    renderAll();
  });
}

/**
 * ✅ products-live.js chama isso
 */
window.renderProducts = function (items) {
  ALL = Array.isArray(items) ? items : [];
  populateSelectCats();
  renderAll();
};

async function boot() {
  wireUI();

  // carrega categorias/chips (se existir)
  try {
    const cats = await fetchJsonTry("data/categories.json");
    CATS = Array.isArray(cats) ? cats : [];
  } catch {
    CATS = [];
  }

  // carregamento inicial dos produtos (antes do updater)
  const products = await loadProductsJson();
  const updatedAt = products.updatedAt ? products.updatedAt : null;

  ALL = normalizeItems(products.items || [], updatedAt);

  statusText(updatedAt ? `Atualizado: ${updatedAt}` : "Atualizado");
  populateSelectCats();
  renderAll();
}

boot().catch((e) => {
  console.error(e);
  statusText("❌ Erro ao carregar produtos");
});
