let ALL = [];
let CATS = [];
let activeCat = null;

// all = normal | now = vendendo agora | best = mais vendidos
let mode = "all";

const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0) || 0
  );

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJsonTry(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao carregar: ${url}`);
  return res.json();
}

async function loadProductsJson() {
  // ✅ tenta o caminho novo primeiro, depois o antigo
  try {
    return await fetchJsonTry("./products.json");
  } catch {
    return await fetchJsonTry("data/products.json");
  }
}

async function load() {
  const [cats, products] = await Promise.all([
    fetchJsonTry("data/categories.json"),
    loadProductsJson(),
  ]);

  CATS = Array.isArray(cats) ? cats : [];
  ALL = Array.isArray(products.items) ? products.items : [];

  // ✅ Ajustado: no HTML agora é updateStatus
  const status = document.getElementById("updateStatus");
  if (status) {
    status.textContent = products.updatedAt
      ? `Atualizado: ${products.updatedAt}`
      : "Sem atualização";
  }

  renderCats();
  render();
}

/**
 * ✅ IMPORTANTÍSSIMO:
 * products-live.js chama window.renderProducts(merged)
 * então aqui só atualizamos ALL e renderizamos
 */
window.renderProducts = function (items) {
  ALL = Array.isArray(items) ? items : [];
  render();
};

function renderCats() {
  const el = document.getElementById("cats");
  if (!el) return;

  el.innerHTML = "";

  // Botão "Todos"
  el.appendChild(mkCatButton("Todos", null));

  CATS.forEach((c) => el.appendChild(mkCatButton(c.name, c.slug)));
}

function mkCatButton(name, slug) {
  const b = document.createElement("button");

  const isActive =
    (mode === "now" && slug === "vendendo-agora") ||
    (mode === "best" && slug === "mais-vendidos") ||
    (mode === "all" && activeCat === slug);

  b.className = "chip" + (isActive ? " active" : "");
  b.textContent = name;

  // Regras especiais
  if (slug === "vendendo-agora") {
    b.onclick = () => {
      mode = "now";
      activeCat = null;
      renderCats();
      render();
    };
    return b;
  }

  if (slug === "mais-vendidos") {
    b.onclick = () => {
      mode = "best";
      activeCat = null;
      renderCats();
      render();
    };
    return b;
  }

  // "Todos"
  if (slug === null) {
    b.onclick = () => {
      mode = "all";
      activeCat = null;
      renderCats();
      render();
    };
    return b;
  }

  // Categorias normais
  b.onclick = () => {
    mode = "all";
    activeCat = slug;
    renderCats();
    render();
  };

  return b;
}

function render() {
  const q = (document.getElementById("search")?.value || "")
    .toLowerCase()
    .trim();

  const grid = document.getElementById("grid");
  if (!grid) return;

  grid.innerHTML = "";

  let items = ALL.filter((p) => {
    const okCat = mode !== "all" ? true : (!activeCat || p.categorySlug === activeCat);
    const okQ = !q || (p.title || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  // Modos inteligentes
  if (mode === "now") {
    items = items.slice(0, 40);
  } else if (mode === "best") {
    items = [...items]
      .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))
      .slice(0, 40);
  }

  items.forEach((p) => {
    const card = document.createElement("article");
    card.className = "card";

    card.innerHTML = `
      <img src="${p.imageUrl || ""}" alt="${escapeHtml(p.title)}" loading="lazy"/>
      <div class="pad">
        <h3>${escapeHtml(p.title)}</h3>

        <div class="price-row">
          <p class="price">${fmtBRL(p.promoPrice ?? p.price)}</p>
          <span class="small">Shopee</span>
        </div>

        <div class="tag">${escapeHtml(p.categoryName || "")}</div>
      </div>
    `;

    card.onclick = () => openModal(p);
    grid.appendChild(card);
  });
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

  const query = p.title || "produto shopee";
  if (tiktok) {
    tiktok.href = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
  }

  modal.showModal();
}

// Busca em tempo real
document.getElementById("search")?.addEventListener("input", render);

// Fechar modal
document.getElementById("close")?.addEventListener("click", () => {
  document.getElementById("modal")?.close();
});
document.getElementById("modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "modal") document.getElementById("modal")?.close();
});

// Botões do hero
const btnTop = document.getElementById("btnTop");
if (btnTop) {
  btnTop.onclick = () => {
    mode = "all";
    activeCat = null;
    const s = document.getElementById("search");
    if (s) s.value = "";
    renderCats();
    render();
  };
}

const btnMini = document.getElementById("btnMini");
if (btnMini) {
  btnMini.onclick = () => {
    mode = "all";
    activeCat = "miniaturas";
    const s = document.getElementById("search");
    if (s) s.value = "";
    renderCats();
    render();
  };
}

load().catch((e) => {
  console.error(e);
  const status = document.getElementById("updateStatus");
  if (status) status.textContent = "❌ Erro ao carregar dados";
});
