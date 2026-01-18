// app.js (ESM) — HOME limpa, foco total em produtos

const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const $ = (id) => document.getElementById(id);
const safeLower = (s) => (s || "").toString().toLowerCase();

function escapeHtml(s){
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniqBy(arr, keyFn){
  const seen = new Set();
  return arr.filter(item => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function readFavs(){
  try {
    return new Set(JSON.parse(localStorage.getItem("shoptrends_favs") || "[]"));
  } catch {
    return new Set();
  }
}

function writeFavs(set){
  localStorage.setItem("shoptrends_favs", JSON.stringify([...set]));
}

export function createShopTrendsApp({
  productsUrl = "products.json",
  categoriesUrl = "data/categories.json",
  perPage = 48,
} = {}) {

  let ALL = [];
  let CATS = [];
  let updatedAt = "";
  let view = "home";
  let page = 1;
  let compact = false;
  let onlyFav = false;
  let favs = readFavs();

  const meta = $("meta");
  const loadingPill = $("loadingPill");

  const homeView = $("homeView");
  const listView = $("listView");

  const gridNow = $("gridNow");
  const gridBest = $("gridBest");
  const gridDeals = $("gridDeals");
  const gridAll = $("gridAll");

  const hintNow = $("hintNow");
  const hintBest = $("hintBest");
  const hintDeals = $("hintDeals");

  const listTitle = $("listTitle");
  const listSub = $("listSub");

  const selCat = $("cat");
  const selSort = $("sort");
  const qInput = $("q");
  const btnSearch = $("btnSearch");
  const btnDeals = $("btnDeals");

  const toggleViewBtn = $("toggleView");
  const onlyFavBtn = $("onlyFav");

  const loadMoreBtn = $("loadMoreBtn");
  const loadMoreHint = $("loadMoreHint");

  function setLoading(on){
    if (loadingPill) loadingPill.hidden = !on;
  }

  function setMeta(){
    meta.textContent = updatedAt
      ? `Atualizado: ${updatedAt} • ${ALL.length} itens`
      : "Atualizando...";
  }

  async function load(){
    setLoading(true);

    const products = await fetch(productsUrl, { cache: "no-store" }).then(r => r.json());
    updatedAt = products.updatedAt || "";
    ALL = products.items || [];

    try {
      const cats = await fetch(categoriesUrl, { cache: "no-store" }).then(r => r.json());
      CATS = Array.isArray(cats) ? cats : [];
    } catch {
      CATS = [];
    }

    if (!CATS.length){
      CATS = uniqBy(
        ALL.map(p => ({
          slug: p.categorySlug,
          name: p.categoryName
        })).filter(c => c.slug && c.name),
        c => c.slug
      );
    }

    selCat.innerHTML =
      `<option value="all">Todas categorias</option>` +
      CATS.map(c => `<option value="${c.slug}">${escapeHtml(c.name)}</option>`).join("");

    setMeta();
    render();
    setLoading(false);
  }

  function applyFilters(){
    let items = [...ALL];

    const q = safeLower(qInput.value);
    if (q) items = items.filter(p => safeLower(p.title).includes(q));

    if (selCat.value !== "all"){
      items = items.filter(p => p.categorySlug === selCat.value);
    }

    if (onlyFav){
      items = items.filter(p => favs.has(p.sourceId || p.productUrl));
    }

    return items;
  }

  function sortItems(items){
    const sort = selSort.value;

    if (sort === "price_asc"){
      return [...items].sort((a,b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price));
    }
    if (sort === "price_desc"){
      return [...items].sort((a,b) => (b.promoPrice ?? b.price) - (a.promoPrice ?? a.price));
    }
    if (sort === "discount"){
      return [...items].sort((a,b) =>
        ((b.price || 0) - (b.promoPrice ?? b.price)) -
        ((a.price || 0) - (a.promoPrice ?? a.price))
      );
    }

    return items;
  }

  function ensureView(){
    homeView.hidden = view !== "home";
    listView.hidden = view === "home";
  }

  function render(){
    setMeta();
    ensureView();

    const base = sortItems(applyFilters());

    if (view !== "home"){
      renderList(base);
      return;
    }

    const now = base.slice(0, 16);
    const best = [...base].sort((a,b) => (b.price || 0) - (a.price || 0)).slice(0, 16);
    const deals = base.filter(p => p.promoPrice && p.promoPrice < p.price).slice(0, 16);

    hintNow.textContent = `${now.length} itens`;
    hintBest.textContent = `${best.length} itens`;
    hintDeals.textContent = `${deals.length} itens`;

    renderGrid(gridNow, now);
    renderGrid(gridBest, best);
    renderGrid(gridDeals, deals);
  }

  function renderList(items){
    const total = items.length;
    const shown = Math.min(total, page * perPage);
    const slice = items.slice(0, shown);

    listTitle.textContent = "Todos os produtos";
    listSub.textContent = `${shown} de ${total} itens`;

    renderGrid(gridAll, slice);

    const hasMore = shown < total;
    loadMoreBtn.disabled = !hasMore;
    loadMoreBtn.textContent = hasMore ? "Carregar mais" : "Tudo carregado";
    loadMoreHint.textContent = hasMore ? `Mostrando ${shown} de ${total}` : `Total: ${total}`;
  }

  function renderGrid(grid, items){
    grid.innerHTML = "";

    if (!items.length){
      grid.innerHTML = `<div class="small">Nenhum produto encontrado.</div>`;
      return;
    }

    for (const p of items){
      const id = p.sourceId || p.productUrl;
      const isFav = favs.has(id);

      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card__imgWrap">
          <img src="${escapeHtml(p.imageUrl || "")}" loading="lazy" />
        </div>
        <div class="card__pad">
          <h3 class="card__title">${escapeHtml(p.title)}</h3>
          <div class="priceRow">
            <div class="price">${fmtBRL(p.promoPrice ?? p.price)}</div>
          </div>
          <div class="card__actions">
            <button class="card__cta">Ver</button>
            <button class="favBtn ${isFav ? "is-on" : ""}">${isFav ? "❤️" : "🤍"}</button>
          </div>
        </div>
      `;

      card.querySelector(".favBtn").onclick = (e) => {
        e.stopPropagation();
        if (favs.has(id)) favs.delete(id);
        else favs.add(id);
        writeFavs(favs);
        render();
      };

      card.onclick = () => openModal(p);
      grid.appendChild(card);
    }
  }

  function openModal(p){
    $("m_img").src = p.imageUrl || "";
    $("m_title").textContent = p.title;
    $("m_price").textContent = fmtBRL(p.promoPrice ?? p.price);
    $("m_cat").textContent = p.categoryName || "";
    $("m_buy").href = p.productUrl;
    $("m_tiktok").href = p.tiktokUrl || "#";
    $("modal").showModal();
  }

  function bind(){
    btnSearch.onclick = () => { view = "all"; page = 1; render(); };
    btnDeals.onclick = () => { view = "all"; selSort.value = "discount"; render(); };

    qInput.addEventListener("keydown", e => {
      if (e.key === "Enter") btnSearch.click();
    });

    selCat.onchange = render;
    selSort.onchange = render;

    toggleViewBtn.onclick = () => {
      compact = !compact;
      document.querySelectorAll(".grid").forEach(g =>
        g.classList.toggle("is-compact", compact)
      );
    };

    onlyFavBtn.onclick = () => {
      onlyFav = !onlyFav;
      onlyFavBtn.textContent = onlyFav ? "Favoritos ✓" : "Favoritos";
      render();
    };

    loadMoreBtn.onclick = () => {
      page++;
      render();
    };

    $("close").onclick = () => $("modal").close();
  }

  return {
    async init(){
      bind();
      await load();
    }
  };
}
