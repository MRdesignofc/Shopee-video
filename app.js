let ALL = [];
let CATS = [];
let activeCat = null;

const fmtBRL = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

async function load() {
  const [cats, products] = await Promise.all([
    fetch("data/categories.json").then(r => r.json()),
    fetch("data/products.json").then(r => r.json())
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

  el.appendChild(mkCatButton("Todos", null));

  CATS.forEach(c => el.appendChild(mkCatButton(c.name, c.slug)));
}

function mkCatButton(name, slug) {
  const b = document.createElement("button");
  b.className = "chip" + (activeCat === slug ? " active" : "");
  b.textContent = name;
  b.onclick = () => { activeCat = slug; renderCats(); render(); };
  return b;
}

function render() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  const items = ALL.filter(p => {
    const okCat = !activeCat || (p.categorySlug === activeCat);
    const okQ = !q || (p.title || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  items.forEach(p => {
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

  // TikTok search sempre com nome do produto (como você pediu)
  const query = p.title || "produto shopee";
  document.getElementById("m_tiktok").href =
    `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;

  modal.showModal();
}

document.getElementById("search").addEventListener("input", render);
document.getElementById("close").onclick = () => document.getElementById("modal").close();

document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") document.getElementById("modal").close();
});

document.getElementById("btnTop").onclick = () => {
  activeCat = null;
  document.getElementById("search").value = "";
  renderCats(); render();
};

document.getElementById("btnMini").onclick = () => {
  activeCat = "miniaturas";
  document.getElementById("search").value = "";
  renderCats(); render();
};

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

load();
