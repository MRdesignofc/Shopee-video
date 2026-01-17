// app.js (vitrines) - ajustado: "Ver tudo" mostra todos e sem tag de categoria no modo Todos
let ALL = [];
let CATS = [];
let activeCat = null;

let viewCompact = false;
let onlyFav = false;

const favKey = "shoptrends:favs_v1";
const getFavs = () => new Set(JSON.parse(localStorage.getItem(favKey) || "[]"));
const setFavs = (set) => localStorage.setItem(favKey, JSON.stringify([...set]));

const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0) || 0
  );

function statusText(text) {
  const el = document.getElementById("updateStatus");
  if (el) el.textContent = text;
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJson(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
  return res.json();
}

async function loadProductsJson() {
  try {
    return { url: "./products.json", data: await fetchJson("./products.json") };
  } catch {
    return { url: "data/products.json", data: await fetchJson("data/products.json") };
  }
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

/**
 * showCategoryTag:
 * - false => NÃO exibe a tag de categoria no card
 * - true  => exibe a tag (opcional)
 */
function makeCard(p, { showCategoryTag }) {
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
          ${
            showOld
              ? `<span class="small" style="text-decoration:line-through;opacity:.7;">${fmtBRL(
                  p.price
                )}</span>`
              : ""
          }
        </div>
        ${
          pct != null
            ? `<span class="badge" style="background:rgba(238,77,45,.08);color:#ee4d2d;border:1px solid rgba(238,77,45,.25)">-${pct}%</span>`
            : ""
        }
      </div>

      ${
        showCategoryTag
          ? `<div class="tag">${escapeHtml(p.categoryName || "")}</div>`
          : ``
      }

      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;">
        <button class="btn btn-ghost" type="button">Ver</button>
        <button class="btn btn-ghost" type="button" aria-label="Favoritar">${
          isFav ? "♥" : "♡"
        }</button>
      </div>
    </div>
  `;

  const btnVer = card.querySelectorAll("button")[0];
  const btnFav = card.querySelectorAll("button")[1];

  btnVer.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(p);
  });

  btnFav.addEventListener("click", (e) => {
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

/**
 * limit:
 * - null => renderiza TODOS
 * - number => limita
 */
function fillGrid(id, items, limit, cardOpts) {
  const grid = document.getElementById(id);
  if (!grid) return;

  grid.innerHTML = "";

  const list = limit == null ? items : items.slice(0, limit);
  list.forEach((p) => grid.appendChild(makeCard(p, cardOpts)));

  grid.classList.toggle("is-compact", viewCompact);
}

function populateSelectCats() {
  const sel = document.getElementById("cat");
  if (!sel) return;

  const map = new Map();
  for (const p of ALL) map.set(p.categorySlug, p.categoryName);

  const cats = [...map.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .filter((c) => c.slug && c.name);

  cats.sort((a, b) => a.name.localeCompare(b.name));

  sel.innerHTML =
    `<option value="all">Todas categorias</option>` +
    cats.map((c) => `<option value="${c.slug}">${c.name}</option>`).join("");
}

function renderChips() {
  const el = document.getElementById("cats");
  if (!el) return;

  el.innerHTML = "";

  const mk = (name, slug) => {
    const b = document.createElement("button");
    const isActive =
      (slug === null && activeCat === null) || (slug !== null && activeCat === slug);
    b.className = "chip" + (isActive ? " active" : "");
    b.textContent = name;
    b.onclick = () => {
      activeCat = slug;
      const sel = document.getElementById("cat");
      if (sel) sel.value = slug || "all";
      renderAll();
      renderChips();
    };
    return b;
  };

  el.appendChild(mk("Todos", null));

  const catsFromFile = Array.isArray(CATS) && CATS.length > 0;

  if (catsFromFile) {
    CATS.forEach((c) => el.appendChild(mk(c.name, c.slug)));
  } else {
    const map = new Map();
    for (const p of ALL) map.set(p.categorySlug, p.categoryName);
    const cats = [...map.entries()].map(([slug, name]) => ({ slug, name }));
    cats.sort((a, b) => a.name.localeCompare(b.name));
    cats.forEach((c) => el.appendChild(mk(c.name, c.slug)));
  }
}

function applyFilters() {
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const selCat = document.getElementById("cat")?.value || "all";
  const sort = document.getElementById("sort")?.value || "trending";

  activeCat = selCat === "all" ? null : selCat;

  let list = [...ALL];

  if (activeCat) list = list.filter((p) => p.categorySlug === activeCat);
  if (q) list = list.filter((p) => (p.title || "").toLowerCase().includes(q));

  if (onlyFav) {
    const favs = getFavs();
    list = list.filter((p) => favs.has(p.sourceId));
  }

  // ordenação do "Ver tudo"
  if (sort === "price_asc") {
    list.sort((a, b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price));
  } else if (sort === "price_desc") {
    list.sort((a, b) => (b.promoPrice ?? b.price) - (a.promoPrice ?? a.price));
  } else if (sort === "discount") {
    list.sort((a, b) => {
      const da =
        a.promoPrice != null && a.price ? Math.round((1 - a.promoPrice / a.price) * 100) : -1;
      const db =
        b.promoPrice != null && b.price ? Math.round((1 - b.promoPrice / b.price) * 100) : -1;
      return db - da;
    });
  } else if (sort === "bestsellers") {
    list.sort((a, b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price));
  } else {
    list.sort((a, b) => {
      const ap = a.promoPrice != null ? 1 : 0;
      const bp = b.promoPrice != null ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price);
    });
  }

  return list;
}

function renderAll() {
  const list = applyFilters();

  // vitrines (limitadas)
  const trending = [...list].sort((a, b) => {
    const ap = a.promoPrice != null ? 1 : 0;
    const bp = b.promoPrice != null ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price);
  });

  const best = [...list].sort(
    (a, b) => (a.promoPrice ?? a.price) - (b.promoPrice ?? b.price)
  );

  const deals = [...list].filter((p) => p.promoPrice != null && p.price);

  // ✅ vitrines com tag (ok)
  fillGrid("gridTrending", trending, 12, { showCategoryTag: true });
  fillGrid("gridBest", best, 12, { showCategoryTag: true });
  fillGrid("gridDeals", deals, 12, { showCategoryTag: true });

  // ✅ "Ver tudo" SEM limite e SEM categoria dentro do card
  fillGrid("gridAll", list, null, { showCategoryTag: false });

  const hint = document.getElementById("updatedHint");
  if (hint) hint.textContent = "—";

  renderChips();
}

function wireUI() {
  document.getElementById("q")?.addEventListener("input", renderAll);
  document.getElementById("cat")?.addEventListener("change", renderAll);
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

  // busca do header espelha pro campo novo
  document.getElementById("search")?.addEventListener("input", (e) => {
    const q = document.getElementById("q");
    if (q) q.value = e.target.value || "";
    renderAll();
  });

  // modal fechar
  document.getElementById("close")?.addEventListener("click", () => {
    document.getElementById("modal")?.close();
  });
  document.getElementById("modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "modal") document.getElementById("modal")?.close();
  });

  // botões do hero
  document.getElementById("btnTop")?.addEventListener("click", () => {
    activeCat = null;
    const q = document.getElementById("q");
    const sel = document.getElementById("cat");
    if (q) q.value = "";
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
 * products-live.js chama isso com a lista mesclada
 */
window.renderProducts = function (items) {
  ALL = Array.isArray(items) ? items : [];
  populateSelectCats();
  renderAll();
};

async function boot() {
  wireUI();

  try {
    const cats = await fetchJson("data/categories.json");
    CATS = Array.isArray(cats) ? cats : [];
  } catch {
    CATS = [];
  }

  const { data } = await loadProductsJson();
  ALL = Array.isArray(data.items) ? data.items : [];

  populateSelectCats();
  renderAll();

  statusText(`Atualizado: ${data.updatedAt || "—"} • ${ALL.length} itens`);
}

boot().catch((e) => {
  console.error(e);
  statusText("❌ Erro ao carregar produtos");
});
