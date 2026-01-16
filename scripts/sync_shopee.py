import os
import json
import time
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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


def save_debug(payload: Any):
    ensure_data_dir()
    with open(DEBUG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def load_db() -> Dict[str, Any]:
    """
    Lê products.json. Se estiver inválido, renomeia para products.bad.json e recomeça limpo.
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


def save_db(db: Dict[str, Any]):
    ensure_data_dir()
    db["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def sign_headers(payload_json: str) -> Dict[str, str]:
    ts = str(int(time.time()))
    base = f"{APP_ID}{ts}{payload_json}{SECRET}"
    sig = hashlib.sha256(base.encode("utf-8")).hexdigest()
    auth = f"SHA256 Credential={APP_ID}, Timestamp={ts}, Signature={sig}"
    return {"Content-Type": "application/json", "Authorization": auth}


def shopee_graphql(query: str, variables: Optional[dict] = None) -> Dict[str, Any]:
    body = {"query": query, "variables": variables or {}}
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

    r.raise_for_status()
    return parsed


# ---------- INTROSPECÇÃO (descobrir campos reais) ----------

INTROSPECT_TYPE_QUERY = """
query IntrospectType($name: String!) {
  __type(name: $name) {
    name
    fields {
      name
    }
  }
}
"""


def get_type_fields(type_name: str) -> Optional[List[str]]:
    """
    Retorna lista de campos do tipo GraphQL, se introspecção estiver liberada.
    Se estiver bloqueada, retorna None.
    """
    try:
        res = shopee_graphql(INTROSPECT_TYPE_QUERY, {"name": type_name})
        if "errors" in res:
            return None
        t = (res.get("data") or {}).get("__type")
        if not t or not isinstance(t, dict):
            return None
        fields = t.get("fields") or []
        out = []
        for f in fields:
            if isinstance(f, dict) and isinstance(f.get("name"), str):
                out.append(f["name"])
        return out
    except Exception:
        return None


def pick_first_existing(fields: List[str], candidates: List[str]) -> Optional[str]:
    s = set(fields)
    for c in candidates:
        if c in s:
            return c
    return None


def build_product_offer_v2_query(product_fields: List[str]) -> str:
    """
    Monta query usando nodes { ... } com campos que EXISTEM no schema.
    """
    # candidatos comuns (variantes possíveis no schema)
    id_field = pick_first_existing(product_fields, ["itemId", "item_id", "id"])
    name_field = pick_first_existing(product_fields, ["itemName", "name", "title", "productName", "itemTitle"])
    image_field = pick_first_existing(product_fields, ["imageUrl", "image", "image_url", "cover", "coverImage"])
    price_field = pick_first_existing(product_fields, ["price", "minPrice", "maxPrice", "salePrice", "currentPrice"])
    promo_field = pick_first_existing(product_fields, ["promotionPrice", "promoPrice", "discountPrice", "finalPrice"])
    link_field = pick_first_existing(product_fields, ["offerLink", "productUrl", "link", "shortLink", "url"])

    # fallbacks seguros (pra não quebrar a query)
    # se algum campo não existir, a gente simplesmente não pede ele
    selection = []
    if id_field:
        selection.append(id_field)
    if name_field:
        selection.append(name_field)
    if image_field:
        selection.append(image_field)
    if price_field:
        selection.append(price_field)
    if promo_field:
        selection.append(promo_field)
    if link_field:
        selection.append(link_field)

    # Se por algum motivo a introspecção veio muito “seca”, garantimos ao menos 1 campo
    if not selection:
        selection = ["__typename"]

    selection_block = "\n      ".join(selection)

    return f"""
query ProductOfferV2($keyword: String!, $page: Int!, $limit: Int!) {{
  productOfferV2(
    keyword: $keyword
    page: $page
    limit: $limit
  ) {{
    nodes {{
      {selection_block}
    }}
    edges {{
      node {{
        {selection_block}
      }}
    }}
  }}
}}
"""


def extract_items_from_response(res: Dict[str, Any]) -> List[Dict[str, Any]]:
    data = (res.get("data") or {})
    conn = (data.get("productOfferV2") or {})

    nodes = conn.get("nodes")
    if isinstance(nodes, list):
        return [x for x in nodes if isinstance(x, dict)]

    edges = conn.get("edges")
    if isinstance(edges, list):
        out = []
        for e in edges:
            if isinstance(e, dict) and isinstance(e.get("node"), dict):
                out.append(e["node"])
        return out

    return []


def to_float(x: Any) -> float:
    try:
        return float(x)
    except Exception:
        return 0.0


def normalize_items(raw_items: List[Dict[str, Any]], cat: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Normaliza qualquer variação de campos para o formato do seu site.
    Se não existir nome, usa fallback "Item <id>".
    """
    out = []

    for it in raw_items or []:
        # id
        source_id = (
            str(it.get("itemId") or it.get("item_id") or it.get("id") or "")
        ).strip()
        if not source_id:
            continue

        title = (
            it.get("itemName")
            or it.get("name")
            or it.get("title")
            or it.get("productName")
            or it.get("itemTitle")
            or f"Item {source_id}"
        )

        image_url = (
            it.get("imageUrl")
            or it.get("image")
            or it.get("image_url")
            or it.get("cover")
            or it.get("coverImage")
            or ""
        )

        product_url = (
            it.get("offerLink")
            or it.get("productUrl")
            or it.get("link")
            or it.get("shortLink")
            or it.get("url")
            or ""
        )

        price = (
            it.get("price")
            or it.get("minPrice")
            or it.get("salePrice")
            or it.get("currentPrice")
            or 0
        )

        promo = (
            it.get("promotionPrice")
            or it.get("promoPrice")
            or it.get("discountPrice")
            or it.get("finalPrice")
            or None
        )

        out.append(
            {
                "source": "shopee_affiliate",
                "sourceId": source_id,
                "title": str(title),
                "imageUrl": str(image_url),
                "price": to_float(price),
                "promoPrice": to_float(promo) if promo is not None and promo != "" else None,
                "productUrl": str(product_url),
                "categorySlug": cat["slug"],
                "categoryName": cat["name"],
                "tiktokUrl": None,  # você usa busca no TikTok pelo nome no front
            }
        )

    return out


def upsert(db: Dict[str, Any], new_items: List[Dict[str, Any]]):
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

    # 1) Carrega db local
    db = load_db()

    # 2) Descobre campos reais do schema
    product_fields = get_type_fields("ProductOfferV2")

    # 3) Se introspecção estiver bloqueada, usa um fallback minimalista que não costuma quebrar
    #    (e ainda assim salva debug com os errors para ajustarmos)
    if not product_fields:
        # fallback: tenta campos mais "prováveis", mas sem travar o script (se der erro, debug mostra)
        query = """
query ProductOfferV2($keyword: String!, $page: Int!, $limit: Int!) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
    nodes { itemId offerLink imageUrl price }
    edges { node { itemId offerLink imageUrl price } }
  }
}
"""
    else:
        query = build_product_offer_v2_query(product_fields)

    total_ins = 0
    total_upd = 0

    # 4) Sincroniza (1 página por categoria por enquanto)
    for cat in CATALOGS:
        variables = {"keyword": cat["keyword"], "page": 1, "limit": 20}
        res = shopee_graphql(query, variables)

        # se vier errors, apenas pula (sem quebrar) — debug já fica salvo
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
