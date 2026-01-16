import os
import json
import time
import hashlib
from datetime import datetime, timezone

import requests

SHOPEE_URL = "https://open-api.affiliate.shopee.com.br/graphql"

APP_ID = os.environ.get("SHOPEE_APP_ID", "").strip()
SECRET = os.environ.get("SHOPEE_SECRET", "").strip()

OUT_PATH = "data/products.json"
DEBUG_PATH = "data/debug_last_response.json"

# Mapeia seus catálogos -> estratégia de busca (keyword)
CATALOGS = [
    {"slug": "miniaturas", "name": "Miniaturas de carrinhos", "keyword": "hot wheels miniatura 1:64 diecast"},
    {"slug": "beleza", "name": "Beleza", "keyword": "skin care maquiagem perfume"},
    {"slug": "moda-feminina", "name": "Moda Feminina", "keyword": "vestido blusa calça feminina"},
    {"slug": "moda-masculina", "name": "Moda Masculina", "keyword": "camiseta bermuda calça masculina"},
    {"slug": "infantis", "name": "Infantis", "keyword": "roupa infantil brinquedo infantil"},
    {"slug": "eletronicos", "name": "Eletrônicos & Acessórios", "keyword": "fone bluetooth cabo carregador"},
    {"slug": "casa", "name": "Casa & Decoração", "keyword": "organizador decoração casa"},
    {"slug": "esportes", "name": "Esportes & Fitness", "keyword": "academia treino suplementação"},
    {"slug": "pet", "name": "Pet Shop", "keyword": "ração pet brinquedo pet"},
    {"slug": "brinquedos", "name": "Brinquedos & Hobbies", "keyword": "lego puzzle colecionável"},
]


def load_db():
    if not os.path.exists(OUT_PATH):
        return {"updatedAt": "", "items": []}
    with open(OUT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_db(db):
    db["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def save_debug(payload):
    # Sempre grava debug (sucesso/erro) pra você ver o que a Shopee devolveu
    with open(DEBUG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def sign_headers(payload_json: str):
    ts = str(int(time.time()))
    base = f"{APP_ID}{ts}{payload_json}{SECRET}"
    sig = hashlib.sha256(base.encode("utf-8")).hexdigest()
    auth = f"SHA256 Credential={APP_ID}, Timestamp={ts}, Signature={sig}"
    return {
        "Content-Type": "application/json",
        "Authorization": auth,
    }


def shopee_graphql(query: str, variables: dict):
    body = {"query": query, "variables": variables}
    payload_json = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    headers = sign_headers(payload_json)

    try:
        r = requests.post(
            SHOPEE_URL,
            data=payload_json.encode("utf-8"),
            headers=headers,
            timeout=60,
        )
        # Se der erro HTTP, ainda vamos salvar o corpo no debug
        text = r.text
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        # tenta salvar o corpo mesmo em erro
        save_debug(
            {
                "status": "http_error",
                "error": str(e),
                "response_text": text if "text" in locals() else None,
            }
        )
        raise
    except Exception as e:
        save_debug({"status": "exception", "error": str(e)})
        raise


# ⚠️ Substitua pela query REAL do Playground Shopee Affiliate.
QUERY_PLACEHOLDER = """
query ProductOfferList($keyword:String!, $page:Int!, $limit:Int!) {
  productOfferList(keyword:$keyword, page:$page, limit:$limit) {
    items {
      itemId
      itemName
      imageUrl
      price
      promoPrice
      productUrl
      offerLink
    }
  }
}
"""


def normalize_items(raw_items, cat):
    items = []
    for it in raw_items or []:
        source_id = str(it.get("itemId") or it.get("itemid") or it.get("item_id") or "")
        if not source_id:
            continue

        price = it.get("price")
        promo = it.get("promoPrice") if "promoPrice" in it else it.get("promo_price")

        items.append(
            {
                "source": "shopee_affiliate",
                "sourceId": source_id,
                "title": it.get("itemName") or it.get("name") or it.get("item_name") or "Produto",
                "imageUrl": it.get("imageUrl") or it.get("image") or it.get("image_url") or "",
                "price": float(price or 0),
                "promoPrice": float(promo) if promo else None,
                "productUrl": it.get("productUrl") or it.get("offerLink") or it.get("link") or "",
                "categorySlug": cat["slug"],
                "categoryName": cat["name"],
                # Você pode remover isso se quiser só TikTok search (sem curadoria)
                "tiktokUrl": None,
            }
        )
    return items


def upsert(db, new_items):
    idx = {(p["source"], p["sourceId"]): i for i, p in enumerate(db.get("items", []))}
    inserted = 0
    updated = 0

    for p in new_items:
        key = (p["source"], p["sourceId"])
        if key in idx:
            i = idx[key]
            # mantém tiktokUrl se já existe
            old_tiktok = db["items"][i].get("tiktokUrl")
            db["items"][i].update(p)
            if old_tiktok:
                db["items"][i]["tiktokUrl"] = old_tiktok
            updated += 1
        else:
            db["items"].append(p)
            inserted += 1

    return inserted, updated


def extract_items_from_response(res: dict):
    """
    Tenta achar lista de itens em alguns caminhos comuns,
    porque o nome do resolver pode variar no schema.
    """
    data = (res or {}).get("data") or {}
    if not isinstance(data, dict) or not data:
        return []

    # Caso 1: seu caminho original
    # data.productOfferList.items
    pol = data.get("productOfferList")
    if isinstance(pol, dict) and isinstance(pol.get("items"), list):
        return pol["items"]

    # Caso 2: às vezes pode vir como getProductOfferList / productOfferV2 etc.
    for key, val in data.items():
        if isinstance(val, dict) and isinstance(val.get("items"), list):
            return val["items"]

    # Caso 3: lista direta
    for key, val in data.items():
        if isinstance(val, list):
            return val

    return []


def main():
    if not APP_ID or not SECRET:
        raise SystemExit("Faltam secrets: SHOPEE_APP_ID / SHOPEE_SECRET")

    os.makedirs("data", exist_ok=True)
    db = load_db()

    total_ins = 0
    total_upd = 0

    # grava um debug inicial (ajuda a saber que o script rodou)
    save_debug({"status": "starting", "ts": datetime.now(timezone.utc).isoformat()})

    for cat in CATALOGS:
        page = 1
        limit = 20

        # Por enquanto 1 página por categoria. Aumente depois.
        for _ in range(1):
            res = shopee_graphql(
                QUERY_PLACEHOLDER,
                {"keyword": cat["keyword"], "page": page, "limit": limit},
            )

            # salva a última resposta (debug)
            save_debug(res)

            raw_items = extract_items_from_response(res)
            items = normalize_items(raw_items, cat)

            ins, upd = upsert(db, items)
            total_ins += ins
            total_upd += upd

            page += 1

    save_db(db)
    print(f"OK - inserted={total_ins} updated={total_upd} total={len(db['items'])}")


if __name__ == "__main__":
    main()
