// products-ui.js
const state = {
  all: [],
  filtered: [],
  viewCompact: false,
  onlyFav: false,
};

const els = {
  q: document.getElementById("q"),
  cat: document.getElementById("cat"),
  sort: document.getElementById("sort"),
  toggleView: document.getElementById("toggleView"),
  onlyFav: document.getElementById("onlyFav"),
  updatedHint: document.getElementById("updatedHint"),
  gridTrending: document.getElementById("gridTrending"),
  gridBest: document.getElementById("gridBest"),
  gridDeals: document.getElementById("gridDeals"),
  gridAll: document.getElementById("gridAll"),
};

const money = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const safeText = (s) => (typeof s === "string" ? s : "");
const num = (x, fallback = 0) => (Number.isFinite(Number(x)) ? Number(x) : fallback);

const favKey = "shoptrends:favs";
const getFavs = () => new Set(JSON.parse(localStorage.getItem(favKey) || "[]"));
const setFavs = (set) => localStorage.setItem(favKey, JSON.stringify([...set]));

function scoreTrending(p){
  // Vendendo agora: prioriza sold_24h, depois sold_total, depois desconto, depois rating
  const s24 = num(p.sold_24h, 0);
  const st = num(p.sold_total, 0);
  const d  = num(p.discount_percent, 0);
  const r  = num(p.rating, 0);
  const rv = Math.log10(num(p.reviews, 0) + 1);
  return (s24 * 100) + (st * 5) + (d * 2) + (r * 10) + (rv * 6);
}

function scoreBest(p){
  const st = num(p.sold_total, 0);
  const s24 = num(p.sold_24h, 0);
  return (st * 10) + (s24 * 20);
}

function scoreDeals(p){
  const d = num(p.discount_percent, 0);
  const price = num(p.price, 999999);
  return (d * 1000) - price;
}

function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for (const item of arr){
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function buildTikTokQuery(title){
  const t = safeText(title).trim();
  const q = encodeURIComponent(`${t} review unboxing testando`);
  return `https://www.tiktok.com/search?q=${q}`;
}

function normalizeProduct(p, idx){
  const id = (p.id ?? p.itemid ?? p.product_id ?? `${idx}`).toString();
  const title = safeText(p.title || p.name || "");
  const image = safeText(p.image || p.image_url || p.thumb || "");
  const affiliate_url = safeText(p.affiliate_url || p.url || p.link || "");
  const category = safeText(p.category || p.cat || "Geral") || "Geral";

  const price = num(p.price, NaN);
  const price_original = Number.isFinite(num(p.price_original, NaN)) ? num(p.price_original, NaN) : null;

  const discount_percent =
    Number.isFinite(num(p.discount_percent, NaN)) ? num(p.discount_percent, NaN) :
    (price_original && Number.isFinite(price) ? Math.max(0, Math.round((1 - (price / price_original)) * 100)) : null);

  return {
    ...p,
    id,
    title,
    image,
    affiliate_url,
    category,
    price,
    price_original,
    discount_percent,
    sold_24h: num(p.sold_24h, 0),
    sold_total: num(p.sold_total, 0),
    rating: num(p.rating, 0),
    reviews: num(p.reviews, 0),
    free_shipping: Boolean(p.free_shipping),
    updated_at: safeText(p.updated_at || p.updatedAt || ""),
  };
}

function setGridMode(){
  const grids = [els.gridTrending, els.gridBest, els.gridDeals, els.gridAll];
  for (const g of grids){
    if (!g) continue;
    g.classList.toggle("is-compact", state.viewCompact);
  }
}

function createSkeletonCard(){
  const div = document.createElement("div");
  div.className = "card skeleton";
  div.innerHTML = `
    <div class="card__imgWrap"></div>
    <div style="height:12px;background:#f3f4f6;border-radius:8px"></div>
    <div style="height:12px;width:70%;background:#f3f4f6;border-radius:8px"></div>
    <div style="height:14px;width:45%;background:#f3f4f6;border-radius:8px"></div>
  `;
  return div;
}

function renderSkeletons(){
  const targets = [els.gridTrending, els.gridBest, els.gridDeals, els.gridAll];
  for (const t of targets){
    if (!t) continue;
    t.innerHTML = "";
    for (let i=0;i<12;i++) t.appendChild(createSkeletonCard());
  }
}

function createCard(p){
  const favs = getFavs();
  const isFav = favs.has(p.id);

  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;

  const badges = [];
  if (p.discount_percent) badges.push(`<span class="badge badge--brand">-${p.discount_percent}%</span>`);
  if (p.free_shipping) badges.push(`<span class="badge">Frete grátis</span>`);
  if (p.sold_24h) badges.push(`<span class="badge">🔥 ${p.sold_24h}/24h</span>`);

  const old = (p.price_original && Number.isFinite(p.price)) ? `<span class="priceOld">${money(p.price_original)}</span>` : "";

  const rating = (p.rating > 0)
    ? `<span>⭐ ${p.rating.toFixed(1)} (${num(p.reviews,0)})</span>`
    : `<span>—</span>`;

  card.innerHTML = `
    <div class="card__imgWrap">
      <img class="card__img" alt="${safeText(p.title).replaceAll('"', "")}" loading="lazy" />
    </div>

    <div class="card__badges">${badges.join("")}</div>

    <h3 class="card__title">${safeText(p.title)}</h3>

    <div class="card__priceRow">
      <div>
        <span class="price">${money(p.price)}</span>
        ${old}
      </div>
      <div class="meta">${rating}</div>
    </div>

    <div class="card__actions">
      <button class="btn btn--ghost" type="button">Ver</button>
      <button class="iconBtn ${isFav ? "is-on" : ""}" type="button" title="Favoritar" aria-label="Favoritar">
        ${isFav ? "♥" : "♡"}
      </button>
    </div>
  `;

  const img = card.querySelector("img");
  img.src = p.image || "";
  img.onerror = () => { img.removeAttribute("src"); img.alt = "Imagem indisponível"; };

  const favBtn = card.querySelector(".iconBtn");
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const set = getFavs();
    if (set.has(p.id)) set.delete(p.id);
    else set.add(p.id);
    setFavs(set);
    // re-render rápido (mantém filtros/ordem)
    applyFiltersAndRender();
  });

  const open = () => openProductModal(p);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });

  return card;
}

function fillGrid(grid, products, limit = 12){
  if (!grid) return;
  grid.innerHTML = "";
  products.slice(0, limit).forEach(p => grid.appendChild(createCard(p)));
}

function populateCategories(products){
  if (!els.cat) return;
  const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  els.cat.innerHTML = `<option value="all">Todas categorias</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

function applyFiltersAndRender(){
  const q = (els.q?.value || "").trim().toLowerCase();
  const cat = els.cat?.value || "all";
  const sort = els.sort?.value || "trending";
  const onlyFav = state.onlyFav;

  const favs = getFavs();

  let list = [...state.all];

  if (q) list = list.filter(p => p.title.toLowerCase().includes(q));
  if (cat !== "all") list = list.filter(p => p.category === cat);
  if (onlyFav) list = list.filter(p => favs.has(p.id));

  // ordenação principal (para “Ver tudo”)
  list.sort((a,b) => {
    if (sort === "bestsellers") return scoreBest(b) - scoreBest(a);
    if (sort === "discount") return scoreDeals(b) - scoreDeals(a);
    if (sort === "price_asc") return num(a.price, 1e9) - num(b.price, 1e9);
    if (sort === "price_desc") return num(b.price, 0) - num(a.price, 0);
    if (sort === "rating") return num(b.rating,0) - num(a.rating,0);
    return scoreTrending(b) - scoreTrending(a);
  });

  state.filtered = list;

  // vitrines
  const trending = [...list].sort((a,b)=>scoreTrending(b)-scoreTrending(a));
  const best = [...list].sort((a,b)=>scoreBest(b)-scoreBest(a));
  const deals = [...list].sort((a,b)=>scoreDeals(b)-scoreDeals(a));

  fillGrid(els.gridTrending, trending, 12);
  fillGrid(els.gridBest, best, 12);
  fillGrid(els.gridDeals, deals, 12);
  fillGrid(els.gridAll, list, 48);

  setGridMode();
}

async function loadProducts(){
  renderSkeletons();

  // ajuste o caminho conforme seu projeto:
  // - "./products.json" (raiz)
  // - "./data/products.json"
  const url = "./products.json";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar products.json");
  const data = await res.json();

  const list = Array.isArray(data) ? data : (data.products || []);
  const normalized = list.map(normalizeProduct);

  state.all = uniqBy(normalized, p => p.id);

  populateCategories(state.all);

  // updated hint (pega a data mais recente)
  const mostRecent = state.all
    .map(p => Date.parse(p.updated_at))
    .filter(Number.isFinite)
    .sort((a,b)=>b-a)[0];

  if (els.updatedHint){
    if (mostRecent) {
      const d = new Date(mostRecent);
      els.updatedHint.textContent = `Atualizado em ${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"})}`;
    } else {
      els.updatedHint.textContent = "Atualização recente";
    }
  }

  applyFiltersAndRender();
}

function wireControls(){
  els.q?.addEventListener("input", () => applyFiltersAndRender());
  els.cat?.addEventListener("change", () => applyFiltersAndRender());
  els.sort?.addEventListener("change", () => applyFiltersAndRender());

  els.toggleView?.addEventListener("click", () => {
    state.viewCompact = !state.viewCompact;
    els.toggleView.setAttribute("aria-pressed", String(state.viewCompact));
    setGridMode();
  });

  els.onlyFav?.addEventListener("click", () => {
    state.onlyFav = !state.onlyFav;
    els.onlyFav.setAttribute("aria-pressed", String(state.onlyFav));
    applyFiltersAndRender();
  });
}

/* ========= MODAL =========
   Aqui eu reaproveito a ideia do seu modal atual:
   - botão Comprar na Shopee
   - botão Buscar no TikTok
   Você só precisa mapear estes IDs para os elementos do seu modal.
*/
function openProductModal(p){
  // Ajuste estes seletores conforme o seu HTML atual:
  const modal = document.getElementById("modal");
  const titleEl = document.getElementById("modalTitle");
  const imgEl = document.getElementById("modalImg");
  const priceEl = document.getElementById("modalPrice");
  const buyBtn = document.getElementById("modalBuy");
  const tiktokBtn = document.getElementById("modalTiktok");
  const favBtn = document.getElementById("modalFav");

  if (!modal) {
    // fallback: se não tiver modal, abre direto a Shopee
    window.open(p.affiliate_url, "_blank", "noopener,noreferrer");
    return;
  }

  const favs = getFavs();
  const isFav = favs.has(p.id);

  titleEl && (titleEl.textContent = p.title);
  if (imgEl) { imgEl.src = p.image || ""; imgEl.onerror = () => imgEl.removeAttribute("src"); }
  priceEl && (priceEl.textContent = money(p.price));

  buyBtn && (buyBtn.onclick = () => window.open(p.affiliate_url, "_blank", "noopener,noreferrer"));
  tiktokBtn && (tiktokBtn.onclick = () => window.open(buildTikTokQuery(p.title), "_blank", "noopener,noreferrer"));

  if (favBtn){
    favBtn.textContent = isFav ? "Remover favorito" : "Favoritar";
    favBtn.onclick = () => {
      const set = getFavs();
      if (set.has(p.id)) set.delete(p.id); else set.add(p.id);
      setFavs(set);
      applyFiltersAndRender();
      openProductModal(p);
    };
  }

  modal.classList.add("is-open");
}

function boot(){
  wireControls();
  loadProducts().catch((err) => {
    console.error(err);
    const targets = [els.gridTrending, els.gridBest, els.gridDeals, els.gridAll];
    targets.forEach(t => t && (t.innerHTML = `<div style="padding:14px;color:#b91c1c">Erro ao carregar produtos.</div>`));
  });
}

document.addEventListener("DOMContentLoaded", boot);
