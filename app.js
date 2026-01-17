let ALL = [];
let viewCompact = false;

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
  // tenta raiz, depois /data
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

  document.getElementById("m_img").src = p.imageUrl || "";
  document.getElementById("m_title").textContent = p.title || "Produto";
  document.getElementById("m_price").textContent = fmtBRL(p.promoPrice ?? p.price);
  document.getElementById("m_buy").href = p.productUrl || "#";
  document.getElementById("m_cat").textContent = p.categoryName || "";
  document.getElementById("m_tiktok").href = p.tiktokUrl || buildTikTokUrl(p.title || "produto");

  modal.showModal();
}

function makeCard(p) {
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
  return card;
}

function fillGrid(id, items, limit) {
  const grid = document.getElementById(id);
  if (!grid) return;

  grid.innerHTML = "";
  items.slice(0, limit).forEach((p) => grid.appendChild(makeCard(p)));

  grid.classList.toggle("is-compact", viewCompact);
}

function renderAll() {
  // filtros simples pelos controles novos (se existirem)
  const q = (document.getElementById("q")?.value || "").toLowerCase().trim();
  const cat = document.getElementById("cat")?.value || "all";

  let list = ALL;

  if (q) list = list.filter((p) => (p.title || "").toLowerCase().includes(q));
  if (cat !== "all") list = list.filter((p) => p.categorySlug === cat);

  // “vitrines”
  fillGrid("gridTrending", list, 12);
  fillGrid("gridBest", [...list].sort((a,b)=> (b.price||0)-(a.price||0)), 12);
  fillGrid("gridDeals", [...list].filter(p=>p.promoPrice!=null), 12);
  fillGrid("gridAll", list, 48);
}

function populateCats() {
  const sel = document.getElementById("cat");
  if (!sel) return;

  const map = new Map();
  for (const p of ALL) map.set(p.categorySlug, p.categoryName);

  const cats = [...map.entries()].map(([slug, name]) => ({ slug, name }));
  cats.sort((a,b)=>a.name.localeCompare(b.name));

  sel.innerHTML =
    `<option value="all">Todas categorias</option>` +
    cats.map(c => `<option value="${c.slug}">${c.name}</option>`).join("");
}

function wireUI() {
  document.getElementById("q")?.addEventListener("input", renderAll);
  document.getElementById("cat")?.addEventListener("change", renderAll);

  document.getElementById("toggleView")?.addEventListener("click", (e) => {
    viewCompact = !viewCompact;
    e.currentTarget.setAttribute("aria-pressed", String(viewCompact));
    renderAll();
  });

  document.getElementById("close")?.addEventListener("click", () => {
    document.getElementById("modal")?.close();
  });
  document.getElementById("modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "modal") document.getElementById("modal")?.close();
  });
}

/** products-live.js chama isso */
window.renderProducts = function (items) {
  ALL = Array.isArray(items) ? items : [];
  populateCats();
  renderAll();
};

async function boot() {
  wireUI();

  const { url, data } = await loadProductsJson();
  const items = Array.isArray(data.items) ? data.items : [];

  ALL = items;

  populateCats();
  renderAll();

  statusText(`Atualizado: ${data.updatedAt || "—"} • ${items.length} itens • fonte: ${url}`);
}

boot().catch((e) => {
  console.error(e);
  statusText("❌ Erro ao carregar produtos");
});
