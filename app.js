let ALL = [];
let CATS = [];
let activeCat = null;

const fmtBRL = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

async function load() {
  const [cats, products] = await Promise.all([
    fetch("data/categories.json").then(r => r.json()),
    fetch("data/products.json").then(r => r.json())
  ]);

  CATS = cats;
  ALL = products.items || [];

  document.getElementById("meta").textContent =
    products.updatedAt ? `Atualizado: ${products.updatedAt}` : "";

  renderCats();
  render();
}

function renderCats() {
  const el = document.getElementById("cats");
  el.innerHTML = "";

  const btnAll = mkCatButton("Todos", null);
  el.appendChild(btnAll);

  CATS.forEach(c => el.appendChild(mkCatButton(c.name, c.slug)));
}

function mkCatButton(name, slug) {
  const b = document.createElement("button");
  b.className = "cat" + (activeCat === slug ? " active" : "");
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
      <img src="${p.imageUrl}" alt="${escapeHtml(p.title)}"/>
      <div class="pad">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="price">${fmtBRL(p.promoPrice ?? p.price)}</p>
        <p class="tag">${escapeHtml(p.categoryName || "")}</p>
      </div>
    `;
    card.onclick = () => openModal(p);
    grid.appendChild(card);
  });
}

function openModal(p) {
  const modal = document.getElementById("modal");
  document.getElementById("m_img").src = p.imageUrl;
  document.getElementById("m_title").textContent = p.title;
  document.getElementById("m_price").textContent = fmtBRL(p.promoPrice ?? p.price);
  document.getElementById("m_buy").href = p.productUrl;
  document.getElementById("m_cat").textContent = p.categoryName || "";

  // TikTok: se tiver url cadastrada, usa ela; senão abre busca
  const tiktok = p.tiktokUrl || "";
  const btnTik = document.getElementById("m_tiktok");
  const btnSearch = document.getElementById("m_tiktok_search");
  btnTik.style.display = tiktok ? "inline-block" : "none";
  btnSearch.style.display = "inline-block";

  if (tiktok) btnTik.href = tiktok;
  btnSearch.href = `https://www.tiktok.com/search?q=${encodeURIComponent(p.title)}`;

  modal.showModal();
}

document.getElementById("search").addEventListener("input", render);
document.getElementById("close").onclick = () => document.getElementById("modal").close();
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") document.getElementById("modal").close();
});

function escapeHtml(s) {
  return (s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

load();
