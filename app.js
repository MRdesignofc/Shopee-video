let ALL = [];
let CATS = [];
let activeCat = null;

// Opção A: modos "inteligentes" sem depender de flags no JSON
// all = normal | now = vendendo agora | best = mais vendidos
let mode = "all";

const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

async function load() {
  const [cats, products] = await Promise.all([
    fetch("data/categories.json").then((r) => r.json()),
    fetch("data/products.json").then((r) => r.json()),
  ]);

  CATS = cats;
  ALL = products.items || [];

  const meta = document.getElementById("meta");
  meta.textContent = products.updatedAt ? `Atualizado: ${products.updatedAt}` : "Sem atualização";

  renderCats();
  render();
}

function renderCats() {
  const el = document.getElementById("cats");
  el.innerHTML = "";

  // Botão "Todos" reseta modo e filtros
  el.appendChild(mkCatButton("Todos", null));

  CATS.forEach((c) => el.appendChild(mkCatButton(c.name, c.slug)));
}

function mkCatButton(name, slug) {
  const b = document.createElement("button");

  // active visual:
  // - se mode for now/best, marca ativo pelo slug correspondente
  // - se mode for all, marca ativo pela categoria selecionada
  const isActive =
    (mode === "now" && slug === "vendendo-agora") ||
    (mode === "best" && slug === "mais-vendidos") ||
    (mode === "all" && activeCat === slug);

  b.className = "chip" + (isActive ? " active" : "");
  b.textContent = name;

  // Regras especiais para "Vendendo agora" e "Mais vendidos"
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
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // Base: filtro por categoria (quando mode=all) + busca
  let items = ALL.filter((p) => {
    const okCat = mode !== "all" ? true : (!activeCat || p.categorySlug === activeCat);
    const okQ = !q || (p.title || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  // Modos inteligentes (Opção A)
  if (mode === "now") {
    // “Vendendo agora” = os mais recentes no arquivo
    items = items.slice(0, 40);
  } else if (mode === "best") {
    // “Mais vendidos” = top por preço (simples e sempre mostra algo)
    items = [...items].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(0, 40);
  }

  // Render
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
  document.getElementById("m_img").src = p.imageUrl || "";
  document.getElementById("m_title").textContent = p.title || "Produto";
  document.getElementById("m_price").textContent = fmtBRL(p.promoPrice ?? p.price);
  document.getElementById("m_buy").href = p.productUrl || "#";
  document.getElementById("m_cat").textContent = p.categoryName || "";

  // TikTok search sempre com nome do produto
  const query = p.title || "produto shopee";
  document.getElementById("m_tiktok").href =
    `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;

  modal.showModal();
}

// Busca em tempo real
document.getElementById("search").addEventListener("input", render);

// Fechar modal
document.getElementById("close").onclick = () => document.getElementById("modal").close();
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") document.getElementById("modal").close();
});

// Botões do hero (se existirem no seu HTML)
const btnTop = document.getElementById("btnTop");
if (btnTop) {
  btnTop.onclick = () => {
    mode = "all";
    activeCat = null;
    document.getElementById("search").value = "";
    renderCats();
    render();
  };
}

const btnMini = document.getElementById("btnMini");
if (btnMini) {
  btnMini.onclick = () => {
    mode = "all";
    activeCat = "miniaturas";
    document.getElementById("search").value = "";
    renderCats();
    render();
  };
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

load();
