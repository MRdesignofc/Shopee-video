// app.js (ESM)
const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

const $ = (id) => document.getElementById(id);

function safeLower(s) { return (s || "").toString().toLowerCase(); }

function escapeHtml(s){
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for (const it of arr){
    const k = keyFn(it);
    if (!seen.has(k)){
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

function readFavs(){
  try{
    return new Set(JSON.parse(localStorage.getItem("shoptrends_favs") || "[]"));
  }catch{
    return new Set();
  }
}

function writeFavs(set){
  localStorage.setItem("shoptrends_favs", JSON.stringify([...set]));
}

function scoreMiniaturas(p){
  // Prioriza Hot Wheels / 1:64 / diecast etc.
  const t = safeLower(p.title);
  const keys = [
    ["hot wheels", 40],
    ["hotwheels", 40],
    ["1:64", 35],
    ["escala 1:64", 35],
    ["diecast", 30],
    ["miniatura", 22],
    ["diorama", 20],
    ["pista", 14],
    ["garage", 12],
    ["garagem", 12],
    ["colecion", 10],
    ["matchbox", 14],
  ];
  let s = 0;
  for (const [k,w] of keys) if (t.includes(k)) s += w;
  return s;
}

function buildTikTokUrl(title){
  const q = encodeURIComponent((title || "produto shopee") + " review unboxing");
  return `https://www.tiktok.com/search?q=${q}`;
}

export function createShopTrendsApp({
  productsUrl = "products.json",
  categoriesUrl = "data/categories.json",
  perPage = 48,
} = {}) {

  let ALL = [];
  let CATS = [];
  let updatedAt = "";
  let view = "home"; // home | all | now | best | deals | cat:<slug>
  let compact = false;

  let page = 1;
  let favs = readFavs();

  const loadingPill = $("loadingPill");
  const meta = $("meta");

  const elCats = $("cats");
  const elHeroCats = document.querySelector(".heroCats");

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

  const loadMoreBtn = $("loadMoreBtn");
  const loadMoreHint = $("loadMoreHint");

  const qInput = $("q");
  const btnSearch = $("btnSearch");
  const btnDeals = $("btnDeals");

  const toggleViewBtn = $("toggleView");
  const onlyFavBtn = $("onlyFav");

  let onlyFav = false;

  function setLoading(on){
    if (!loadingPill) return;
    loadingPill.hidden = !on;
  }

  function setMeta(){
    const count = ALL.length || 0;
    meta.textContent = updatedAt
      ? `Atualizado: ${updatedAt} • ${count} itens`
      : `Atualizando... • ${count} itens`;
  }

  async function load(){
    setLoading(true);

    // products
    const products = await fetch(productsUrl, { cache: "no-store" }).then(r => r.json());
    updatedAt = products.updatedAt || "";
    ALL = (products.items || []).filter(Boolean);

    // categories (se falhar, deriva do products)
    try{
      const cats = await fetch(categoriesUrl, { cache: "no-store" }).then(r => r.json());
      CATS = Array.isArray(cats) ? cats : [];
    }catch{
      CATS = [];
    }

    if (!CATS.length){
      const uniqCats = uniqBy(
        ALL
          .filter(p => p.categorySlug && p.categoryName)
          .map(p => ({ slug: p.categorySlug, name: p.categoryName })),
        (x) => x.slug
      );
      CATS = uniqCats.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    // Preenche selects
    selCat.innerHTML = `<option value="all">Todas categorias</option>` +
      CATS.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join("");

    // Render UI base
    setMeta();
    renderChips();
    renderHeroShortcuts();
    applyCompact();
    render();

    setLoading(false);
  }

  function applyCompact(){
    const grids = document.querySelectorAll(".grid");
    grids.forEach(g => {
      if (compact) g.classList.add("is-compact");
      else g.classList.remove("is-compact");
    });

    toggleViewBtn.setAttribute("aria-pressed", compact ? "true" : "false");
    toggleViewBtn.textContent = compact ? "Cards" : "Miniaturas";
  }

  function renderHeroShortcuts(){
    if (!elHeroCats) return;

    const quick = [
      { slug: "eletronicos", name: "Eletrônicos", icon: "🎧" },
      { slug: "moda", name: "Moda", icon: "👕" },
      { slug: "casa-decoracao", name: "Casa & Decoração", icon: "🏠" },
      { slug: "beleza", name: "Beleza", icon: "💄" },
    ];

    elHeroCats.innerHTML = "";
    for (const q of quick){
      const btn = document.createElement("div");
      btn.className = "heroCat";
      btn.innerHTML = `
        <div class="heroCat__icon">${q.icon}</div>
        <div class="heroCat__label">${escapeHtml(q.name)}</div>
      `;
      btn.onclick = () => {
        // tenta achar slug real mais próximo
        const found = CATS.find(c => c.slug === q.slug) || CATS.find(c => safeLower(c.name).includes(safeLower(q.name)));
        if (found) setView(`cat:${found.slug}`);
        else setView("all");
      };
      elHeroCats.appendChild(btn);
    }
  }

  function renderChips(){
    elCats.innerHTML = "";

    const items = [
      { key: "all", label: "Todos" },
      { key: "now", label: "Vendendo agora" },
      { key: "best", label: "Mais vendidos" },
      // depois: categorias reais do site
      ...CATS.map(c => ({ key: `cat:${c.slug}`, label: c.name })),
    ];

    for (const it of items){
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = it.label;
      b.onclick = () => setView(it.key);
      elCats.appendChild(b);
    }

    paintActiveChip();
  }

  function paintActiveChip(){
    const buttons = elCats.querySelectorAll(".chip");
    buttons.forEach(btn => {
      const k = btn.textContent;
      // ativa por comparação simples (ok visual)
      btn.classList.remove("active");
    });

    // marca o ativo de forma consistente
    const map = new Map();
    [...elCats.querySelectorAll(".chip")].forEach((b) => map.set(b.textContent, b));

    const activeLabel =
      view === "all" ? "Todos" :
      view === "now" ? "Vendendo agora" :
      view === "best" ? "Mais vendidos" :
      view === "deals" ? "Ofertas" :
      view.startsWith("cat:") ? (CATS.find(c => `cat:${c.slug}` === view)?.name || "Todos") :
      "Todos";

    const btn = map.get(activeLabel);
    if (btn) btn.classList.add("active");
  }

  function setView(v){
    view = v;
    page = 1;
    paintActiveChip();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentQuery(){
    return safeLower(qInput.value).trim();
  }

  function baseFiltered(){
    const q = currentQuery();

    let items = ALL;

    // favoritos
    if (onlyFav){
      items = items.filter(p => favs.has(p.sourceId || p.productUrl || p.title));
    }

    // categoria select (dropdown)
    const catSel = selCat.value;
    if (catSel && catSel !== "all"){
      items = items.filter(p => p.categorySlug === catSel);
    }

    // view por chip
    if (view.startsWith("cat:")){
      const slug = view.split(":")[1];
      items = items.filter(p => p.categorySlug === slug);
    }

    // busca
    if (q){
      items = items.filter(p => safeLower(p.title).includes(q));
    }

    return items;
  }

  function getDeals(items){
    // Ofertas: promoPrice existe e é menor que price
    const deals = items.filter(p => p.promoPrice != null && Number(p.promoPrice) < Number(p.price));
    // fallback: se quase não tiver promo, pega preço baixo
    if (deals.length >= 24) return deals;
    const cheap = [...items].sort((a,b) => (Number(a.price)||0) - (Number(b.price)||0)).slice(0, 80);
    return uniqBy([...deals, ...cheap], (p) => p.sourceId || p.productUrl || p.title);
  }

  function sortItems(items){
    const sort = selSort.value;

    if (sort === "price_asc"){
      return [...items].sort((a,b) => (Number(a.promoPrice ?? a.price)||0) - (Number(b.promoPrice ?? b.price)||0));
    }
    if (sort === "price_desc"){
      return [...items].sort((a,b) => (Number(b.promoPrice ?? b.price)||0) - (Number(a.promoPrice ?? a.price)||0));
    }
    if (sort === "discount"){
      return [...items].sort((a,b) => {
        const da = (Number(a.price)||0) - (Number(a.promoPrice ?? a.price)||0);
        const db = (Number(b.price)||0) - (Number(b.promoPrice ?? b.price)||0);
        return db - da;
      });
    }
    if (sort === "newest"){
      // “vendendo agora” = assume arquivo ordenado mais recente primeiro
      return [...items];
    }
    if (sort === "bestsellers"){
      // sem métrica real => aproxima por “mais caros primeiro” (visualmente ok) + estabilidade
      return [...items].sort((a,b) => (Number(b.price)||0) - (Number(a.price)||0));
    }

    // relevance default: miniaturas prioriza keywords
    if ((view === "all" && selCat.value === "miniaturas") || view === "cat:miniaturas"){
      return [...items].sort((a,b) => scoreMiniaturas(b) - scoreMiniaturas(a));
    }

    return items;
  }

  function ensureViewVisibility(){
    // HOME aparece só quando view=home
    // LIST aparece quando view != home
    const isHome = (view === "home");
    homeView.hidden = !isHome;
    listView.hidden = isHome;
  }

  function render(){
    setMeta();
    ensureViewVisibility();

    // Compact toggle
    applyCompact();

    // HOME vitrines sempre carregam do conjunto filtrado por dropdown/busca/favs
    // (sem quebrar UI)
    const base = sortItems(baseFiltered());

    // se usuário escolheu um view específico diferente de home:
    if (view !== "home"){
      renderList(base);
      return;
    }

    // vitrines
    const now = base.slice(0, 16);
    const best = [...base].sort((a,b) => (Number(b.price)||0) - (Number(a.price)||0)).slice(0, 16);
    const deals = getDeals(base).slice(0, 16);

    hintNow.textContent = `${now.length} itens`;
    hintBest.textContent = `${best.length} itens`;
    hintDeals.textContent = `${deals.length} itens`;

    renderGrid(gridNow, now);
    renderGrid(gridBest, best);
    renderGrid(gridDeals, deals);
  }

  function renderList(base){
    // define título
    let title = "Todos os produtos";
    if (view === "all") title = "Todos os produtos";
    if (view === "now") title = "Vendendo agora";
    if (view === "best") title = "Mais vendidos";
    if (view === "deals") title = "Ofertas";
    if (view.startsWith("cat:")){
      const slug = view.split(":")[1];
      title = CATS.find(c => c.slug === slug)?.name || "Categoria";
    }
    listTitle.textContent = title;

    let items = base;

    if (view === "now"){
      items = base.slice(0, 500); // não limita “pra sempre”, mas mantém navegação ok
    } else if (view === "best"){
      items = [...base].sort((a,b) => (Number(b.price)||0) - (Number(a.price)||0));
    } else if (view === "deals"){
      items = getDeals(base);
    } else if (view === "all"){
      // já ok
    } else if (view.startsWith("cat:")){
      // já filtrado
      // miniaturas => prioriza Hot Wheels
      if (view === "cat:miniaturas"){
        items = [...items].sort((a,b) => scoreMiniaturas(b) - scoreMiniaturas(a));
      }
    }

    // paginação load more
    const total = items.length;
    const shown = Math.min(total, page * perPage);
    const slice = items.slice(0, shown);

    listSub.textContent = `${shown} de ${total} itens`;
    renderGrid(gridAll, slice);

    // load more button
    const hasMore = shown < total;
    loadMoreBtn.disabled = !hasMore;
    loadMoreBtn.style.opacity = hasMore ? "1" : ".6";
    loadMoreBtn.textContent = hasMore ? "Carregar mais" : "Tudo carregado";
    loadMoreHint.textContent = hasMore ? `Mostrando ${shown} de ${total}` : `Total: ${total}`;

    // garante que não apareça “categorias no meio”:
    // (nada de headings dentro do grid; aqui grid só recebe cards)
  }

  function renderGrid(gridEl, items){
    gridEl.innerHTML = "";

    if (!items.length){
      gridEl.innerHTML = `<div class="small">Nenhum produto encontrado.</div>`;
      return;
    }

    for (const p of items){
      const id = p.sourceId || p.productUrl || p.title;
      const isFav = favs.has(id);
      const price = Number(p.promoPrice ?? p.price) || 0;
      const old = (p.promoPrice != null && Number(p.price) > Number(p.promoPrice)) ? Number(p.price) : null;

      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card__imgWrap">
          <img class="card__img" src="${escapeHtml(p.imageUrl || "")}" alt="${escapeHtml(p.title || "")}" loading="lazy"
               onerror="this.style.opacity='.25'; this.style.filter='grayscale(1)';" />
        </div>

        <div class="card__pad">
          <h3 class="card__title">${escapeHtml(p.title || "Produto")}</h3>

          <div class="priceRow">
            <div class="price">
              ${fmtBRL(price)}
              ${old ? `<span class="priceOld">${fmtBRL(old)}</span>` : ""}
            </div>
            <span class="small">Shopee</span>
          </div>

          <div class="tag">${escapeHtml(p.categoryName || "")}</div>

          <div class="card__actions">
            <button class="card__cta" type="button">Ver</button>
            <button class="favBtn ${isFav ? "is-on" : ""}" type="button" aria-label="Favoritar">
              ${isFav ? "❤️" : "🤍"}
            </button>
          </div>
        </div>
      `;

      // abrir modal ao clicar no card ou “Ver”
      card.querySelector(".card__cta").onclick = (e) => { e.stopPropagation(); openModal(p); };
      card.onclick = () => openModal(p);

      // favorito
      card.querySelector(".favBtn").onclick = (e) => {
        e.stopPropagation();
        if (favs.has(id)) favs.delete(id);
        else favs.add(id);
        writeFavs(favs);
        render(); // re-render pra atualizar cor/estado
      };

      gridEl.appendChild(card);
    }
  }

  function openModal(p){
    const modal = $("modal");
    $("m_img").src = p.imageUrl || "";
    $("m_title").textContent = p.title || "Produto";
    $("m_price").textContent = fmtBRL(p.promoPrice ?? p.price);
    $("m_cat").textContent = p.categoryName || "";

    $("m_buy").href = p.productUrl || "#";
    $("m_tiktok").href = p.tiktokUrl || buildTikTokUrl(p.title);

    modal.showModal();
  }

  function bind(){
    // close modal
    $("close").onclick = () => $("modal").close();
    $("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") $("modal").close();
    });

    // search button
    btnSearch.onclick = () => {
      // se estava na home, manda pro “Todos”
      if (view === "home") setView("all");
      else render();
    };
    qInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter"){
        if (view === "home") setView("all");
        else render();
      }
    });

    // deals
    btnDeals.onclick = () => setView("deals");

    // dropdowns
    selCat.addEventListener("change", () => {
      // ao trocar categoria, se estiver home mantém vitrines, se não lista atualiza
      render();
    });

    selSort.addEventListener("change", () => render());

    // chips especiais
    // clique nos chips do topo (renderChips já liga)
    // mas faltam “now/best” no view:
    // eles já existem como labels, então tratamos pelo texto:
    elCats.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.classList.contains("chip")) return;

      const label = t.textContent.trim();

      if (label === "Todos") setView("all");
      else if (label === "Vendendo agora") setView("now");
      else if (label === "Mais vendidos") setView("best");
      else {
        // categoria por nome
        const c = CATS.find(x => x.name === label);
        if (c) setView(`cat:${c.slug}`);
      }
    });

    // compact toggle
    toggleViewBtn.onclick = () => {
      compact = !compact;
      applyCompact();
    };

    // only fav
    onlyFavBtn.onclick = () => {
      onlyFav = !onlyFav;
      onlyFavBtn.setAttribute("aria-pressed", onlyFav ? "true" : "false");
      onlyFavBtn.textContent = onlyFav ? "Favoritos ✓" : "Favoritos";
      render();
    };

    // load more
    loadMoreBtn.onclick = async () => {
      if (loadMoreBtn.disabled) return;
      setLoading(true);
      loadMoreBtn.textContent = "Carregando...";
      await new Promise(r => setTimeout(r, 250)); // sensação de loading suave
      page += 1;
      setLoading(false);
      render();
    };

    // botão carrinho/conta (placeholder)
    $("cartBtn").onclick = () => setView("deals");
    $("userBtn").onclick = () => setView("all");
  }

  return {
    async init(){
      bind();
      await load();
    }
  };
}
