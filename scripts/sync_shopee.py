import os, json, time, hashlib
import requests
from datetime import datetime, timezone

DEBUG_PATH = "data/debug_last_response.json"

SHOPEE_URL = "https://open-api.affiliate.shopee.com.br/graphql"

APP_ID = os.environ.get("SHOPEE_APP_ID", "").strip()
SECRET = os.environ.get("SHOPEE_SECRET", "").strip()

OUT_PATH = "data/products.json"

# Mapeia seus catálogos -> estratégia de busca (keyword)
CATALOGS = [
  {"slug":"miniaturas","name":"Miniaturas de carrinhos", "keyword":"hot wheels miniatura 1:64 diecast"},
  {"slug":"beleza","name":"Beleza", "keyword":"skin care maquiagem perfume"},
  {"slug":"moda-feminina","name":"Moda Feminina", "keyword":"vestido blusa calça feminina"},
  {"slug":"moda-masculina","name":"Moda Masculina", "keyword":"camiseta bermuda calça masculina"},
  {"slug":"infantis","name":"Infantis", "keyword":"roupa infantil brinquedo infantil"},
  {"slug":"eletronicos","name":"Eletrônicos & Acessórios", "keyword":"fone bluetooth cabo carregador"},
  {"slug":"casa","name":"Casa & Decoração", "keyword":"organizador decoração casa"},
  {"slug":"esportes","name":"Esportes & Fitness", "keyword":"academia treino suplementação"},
  {"slug":"pet","name":"Pet Shop", "keyword":"ração pet brinquedo pet"},
  {"slug":"brinquedos","name":"Brinquedos & Hobbies", "keyword":"lego puzzle colecionável"}
]

def load_db():
  if not os.path.exists(OUT_PATH):
    return {"updatedAt":"", "items":[]}
  with open(OUT_PATH, "r", encoding="utf-8") as f:
    return json.load(f)

def save_db(db):
  db["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
  with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

def sign_headers(payload_json: str):
  ts = str(int(time.time()))
  base = f"{APP_ID}{ts}{payload_json}{SECRET}"
  sig = hashlib.sha256(base.encode("utf-8")).hexdigest()
  # Formato “SHA256 Credential=..., Timestamp=..., Signature=...” (varia por doc/ambiente)
  auth = f"SHA256 Credential={APP_ID}, Timestamp={ts}, Signature={sig}"
  return {
    "Content-Type": "application/json",
    "Authorization": auth
  }

def shopee_graphql(query: str, variables: dict):
  body = {"query": query, "variables": variables}
  payload_json = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
  headers = sign_headers(payload_json)
  r = requests.post(SHOPEE_URL, data=payload_json.encode("utf-8"), headers=headers, timeout=60)
  r.raise_for_status()
  return r.json()

# TODO: cole aqui sua query real do Playground Shopee Affiliate.
# Dica: use paginação page/limit e keyword/sortType conforme docs/playground.
QUERY_PLACEHOLDER = """
query ProductOfferList($keyword:String!, $page:Int!, $limit:Int!) {
  # Substitua pelo nome real do resolver/field do playground.
  # Exemplo fictício:
  productOfferList(keyword:$keyword, page:$page, limit:$limit) {
    items {
      itemId
      itemName
      imageUrl
      price
      promoPrice
      productUrl
    }
  }
}
"""

def normalize_items(raw_items, cat):
  items = []
  for it in raw_items:
    source_id = str(it.get("itemId") or it.get("itemid") or "")
    if not source_id:
      continue
    items.append({
      "source": "shopee_affiliate",
      "sourceId": source_id,
      "title": it.get("itemName") or it.get("name") or "Produto",
      "imageUrl": it.get("imageUrl") or it.get("image") or "",
      "price": float(it.get("price") or 0),
      "promoPrice": float(it.get("promoPrice") or 0) if it.get("promoPrice") else None,
      "productUrl": it.get("productUrl") or it.get("offerLink") or "",
      "categorySlug": cat["slug"],
      "categoryName": cat["name"],
      # TikTok pode ser preenchido manualmente depois (curadoria):
      "tiktokUrl": None
    })
  return items

def upsert(db, new_items):
  idx = {(p["source"], p["sourceId"]): i for i, p in enumerate(db["items"])}
  inserted = 0
  updated = 0
  for p in new_items:
    key = (p["source"], p["sourceId"])
    if key in idx:
      i = idx[key]
      # mantém tiktokUrl se já existe
      tiktok = db["items"][i].get("tiktokUrl")
      db["items"][i].update(p)
      if tiktok:
        db["items"][i]["tiktokUrl"] = tiktok
      updated += 1
    else:
      db["items"].append(p)
      inserted += 1
  return inserted, updated

def main():
  if not APP_ID or not SECRET:
    raise SystemExit("Faltam secrets: SHOPEE_APP_ID / SHOPEE_SECRET")

  db = load_db()
  total_ins = total_upd = 0

  for cat in CATALOGS:
    page = 1
    limit = 20

    # Puxa 2 páginas por categoria (ajuste conforme seu limite/necessidade)
    for _ in range(2):
res = shopee_graphql(QUERY_PLACEHOLDER, {"keyword": cat["keyword"], "page": page, "limit": limit})

with open(DEBUG_PATH, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)

raw_items = (((res.get("data") or {}).get("productOfferList") or {}).get("items")) or []
items = normalize_items(raw_items, cat)
ins, upd = upsert(db, items)

      total_ins += ins
      total_upd += upd

      page += 1

  save_db(db)
  print(f"OK - inserted={total_ins} updated={total_upd} total={len(db['items'])}")

if __name__ == "__main__":
  main()
