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


def ensure_data_dir():
    os.makedirs("data", exist_ok=True)


def save_debug(payload):
    ensure_data_dir()
    with open(DEBUG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def load_db():
    """
    Carrega products.json. Se estiver corrompido, renomeia para products.bad.json e recomeça vazio.
    Isso resolve: json.decoder.JSONDecodeError: Extra data...
    """
    ensure_data_dir()

    if not os.path.exists(OUT_PATH):
        return {"updatedAt": "", "items": []}

    try:
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            return {"updatedAt": "", "items": []}

        if "items" not in data or not isinstance(data["items"], list):
            data["items"] = []
        if "updatedAt" not in data or not isinstance(data["updatedAt"], str):
            data["updatedAt"] = ""

        return data

    except json.JSONDecodeError as e:
        bad_path = "data/products.bad.json"
        try:
            os.replace(OUT_PATH, bad_path)
        except Exception:
            pass

        save_debug(
            {
                "status": "products_json_invalid",
                "error": str(e),
                "note": f"Arquivo corrompido movido para {bad_path}. Recriando products.json limpo.",
            }
        )
        return {"updatedAt": "", "items": []}


def save_db(db):
    ensure_data_dir()
    db["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


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

    r = requests.post(
        SHOPEE_URL,
        data=payload_json.encode("utf-8"),
        headers=headers,
        timeout=60,
    )

    # sempre salva a resposta no debug (mesmo se vier "errors")
    try:
        parsed = r.json()
    except Exception:
        parsed = {"status": "non_json_response", "http_status": r.status_code, "text": r.text}

    save_debug(parsed)

    # se for erro HTTP, levanta exceção (mas o debug já ficou salvo)
    r.raise_for_status()
    return parsed


# Agora usando Connection (nodes/edges) em vez de items
QUERY_PLACEHOLDER = """
query ProductOfferV2($keyword: String!, $page: Int!, $limit: Int!) {
  productOfferV2(
    keyword: $keyword
    page: $page
    limit: $limit
  ) {
    nodes {
      itemId
      itemName
      imageUrl
      price
      promotionPrice
      offerLink
    }
  }
}
"""


def extract_items_from_response(res: dict):
    data = res.get("data") or {}
    conn = data.get("productOfferV2") or {}

    # Caso 1: nodes
    nodes = conn.get("nodes")
    if isinstance(nodes, list):
        return nodes

    # Caso 2: edges -> node
    edges = conn.get("edges")
    if isinstance(edges, list):
        out = []
        for e in edges:
            if isinstance(e, dict) and isinstance(e.get("node"), dict):
                out.append(e["node"])
        return out

    return []


def normalize_items(raw_items, cat):
    items = []
    for it in raw_items or []:
        source_id = str(it.get("itemId") or it.get("itemid") or it.get("item_id") or "")
        if not source_id:
            continue

        title = it.get("itemName") or it.get("name") or it.get("item_name") or "Produto"
        image_url = it.get("imageUrl") or it.get("image") or it.get("image_url") or ""
        offer_link = it.get("offerLink") or it.get("productUrl") or it.get("link") or ""

        price = it.get("price") or 0
        promo = it.get("promotionPrice") or it.get("promoPrice") or None

        try:
            price_f = float(price or 0)
        except Exception:
            price_f = 0.0

        promo_f = None
        if promo is not None and promo != "":
            try:
                promo_f = float(promo)
            except Exception:
                promo_f = None

        items.append(
            {
                "source": "shopee_affiliate",
                "sourceId": source_id,
                "title": title,
                "imageUrl": image_url,
                "price": price_f,
                "promoPrice": promo_f,
                "productUrl": offer_link,
                "categorySlug": cat["slug"],
                "categoryName": cat["name"],
                # Se você quiser somente link de busca no TikTok, esse campo pode ficar sempre null
                "tiktokUrl": None,
            }
        )

    return items


def upsert(db, new_items):
    db.setdefault("items", [])
    idx = {(p.get("source"), p.get("sourceId")): i for i, p in enumerate(db["items"])}

    inserted = 0
    updated = 0

    for p in new_items:
        key = (p.get("source"), p.get("sourceId"))
        if not key[0] or not key[1]:
            continue

        if key in idx:
            i = idx[key]
            old_tiktok = db["items"][i].get("tiktokUrl")
            db["items"][i].update(p)
            if old_tiktok:
                db["items"][i]["tiktokUrl"] = old_tiktok
            updated += 1
        else:
            db["items"].append(p)
            inserted += 1

    return inserted, updated


def main():
    if not APP_ID or not SECRET:
        raise SystemExit("Faltam secrets: SHOPEE_APP_ID / SHOPEE_SECRET")

    ensure_data_dir()

    db = load_db()
    total_ins = 0
    total_upd = 0

    # 1 página por categoria (aumente para 2-5 depois)
    for cat in CATALOGS:
        page = 1
        limit = 20

        res = shopee_graphql(
            QUERY_PLACEHOLDER,
            {"keyword": cat["keyword"], "page": page, "limit": limit},
        )

        # Se vier errors no GraphQL, não quebra o script; apenas não adiciona itens
        if isinstance(res, dict) and "errors" in res:
            continue

        raw_items = extract_items_from_response(res)
        items = normalize_items(raw_items, cat)

        ins, upd = upsert(db, items)
        total_ins += ins
        total_upd += upd

    save_db(db)
    print(f"OK - inserted={total_ins} updated={total_upd} total={len(db['items'])}")


if __name__ == "__main__":
    main()
