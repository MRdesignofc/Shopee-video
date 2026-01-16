import os
import json
import time
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List

import requests

# ================= CONFIG =================

SHOPEE_URL = "https://open-api.affiliate.shopee.com.br/graphql"

APP_ID = os.environ.get("SHOPEE_APP_ID", "").strip()
SECRET = os.environ.get("SHOPEE_SECRET", "").strip()

OUT_PATH = "data/products.json"
DEBUG_PATH = "data/debug_last_response.json"

CATALOGS = [
    {"slug": "miniaturas", "name": "Miniaturas de carrinhos", "keyword": "lego f1 bloco construção carro"},
    {"slug": "beleza", "name": "Beleza", "keyword": "skin care maquiagem perfume"},
    {"slug": "moda-feminina", "name": "Moda Feminina", "keyword": "vestido blusa feminina"},
    {"slug": "moda-masculina", "name": "Moda Masculina", "keyword": "camiseta masculina"},
    {"slug": "infantis", "name": "Infantis", "keyword": "brinquedo infantil"},
    {"slug": "eletronicos", "name": "Eletrônicos & Acessórios", "keyword": "fone bluetooth"},
    {"slug": "casa", "name": "Casa & Decoração", "keyword": "decoração casa"},
    {"slug": "esportes", "name": "Esportes & Fitness", "keyword": "academia treino"},
    {"slug": "pet", "name": "Pet Shop", "keyword": "ração pet"},
    {"slug": "brinquedos", "name": "Brinquedos & Hobbies", "keyword": "lego puzzle"},
]

# ================= HELPERS =================

def ensure_data_dir():
    os.makedirs("data", exist_ok=True)


def save_debug(payload: Any):
    ensure_data_dir()
    with open(DEBUG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def load_db() -> Dict[str, Any]:
    ensure_data_dir()
    if not os.path.exists(OUT_PATH):
        return {"updatedAt": "", "items": []}
    try:
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"updatedAt": "", "items": []}


def save_db(db: Dict[str, Any]):
    ensure_data_dir()
    db["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def sign_headers(payload_json: str) -> Dict[str, str]:
    ts = str(int(time.time()))
    base = f"{APP_ID}{ts}{payload_json}{SECRET}"
    sig = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return {
        "Content-Type": "application/json",
        "Authorization": f"SHA256 Credential={APP_ID}, Timestamp={ts}, Signature={sig}",
    }


def shopee_graphql(query: str, variables: dict) -> Dict[str, Any]:
    payload = {"query": query, "variables": variables}
    payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    r = requests.post(
        SHOPEE_URL,
        data=payload_json.encode("utf-8"),
        headers=sign_headers(payload_json),
        timeout=60,
    )

    data = r.json()
    save_debug(data)
    r.raise_for_status()
    return data


# ================= QUERY FINAL =================

QUERY = """
query ProductOfferV2($keyword: String!, $page: Int!, $limit: Int!) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      imageUrl
      price
      offerLink
    }
  }
}
"""


def normalize_items(raw: List[Dict[str, Any]], cat: Dict[str, str]) -> List[Dict[str, Any]]:
    items = []
    for it in raw:
        items.append({
            "source": "shopee_affiliate",
            "sourceId": str(it["itemId"]),
            "title": it.get("productName", "Produto"),
            "imageUrl": it.get("imageUrl", ""),
            "price": float(it.get("price", 0)),
            "promoPrice": None,
            "productUrl": it.get("offerLink", ""),
            "categorySlug": cat["slug"],
            "categoryName": cat["name"],
            "tiktokUrl": None
        })
    return items


def upsert(db: Dict[str, Any], items: List[Dict[str, Any]]):
    index = {(p["source"], p["sourceId"]): i for i, p in enumerate(db["items"])}
    for p in items:
        key = (p["source"], p["sourceId"])
        if key in index:
            db["items"][index[key]].update(p)
        else:
            db["items"].append(p)


# ================= MAIN =================

def main():
    if not APP_ID or not SECRET:
        raise SystemExit("Faltam secrets: SHOPEE_APP_ID / SHOPEE_SECRET")

    db = load_db()

    for cat in CATALOGS:
        res = shopee_graphql(
            QUERY,
            {"keyword": cat["keyword"], "page": 1, "limit": 20}
        )

        nodes = res["data"]["productOfferV2"]["nodes"]
        items = normalize_items(nodes, cat)
        upsert(db, items)

    save_db(db)
    print(f"SYNC OK → {len(db['items'])} produtos salvos")


if __name__ == "__main__":
    main()
