#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

INDICES = [
    {"symbol": "^IBEX", "name": "IBEX 35"},
    {"symbol": "^GSPC", "name": "S&P 500"},
    {"symbol": "^IXIC", "name": "NASDAQ"},
    {"symbol": "^GDAXI", "name": "DAX"},
    {"symbol": "^STOXX50E", "name": "Euro Stoxx 50"},
    {"symbol": "^VIX", "name": "VIX (miedo)"},
]

NEWS_QUERIES = [
    "stock market economy",
    "fed interest rates inflation",
    "earnings results stocks",
    "IBEX bolsa España",
    "geopolitics tariffs markets",
]

IMPACT_RULES = [
    {
        "level": "high",
        "tags": ["macro", "geo"],
        "keywords": [
            "fed", "federal reserve", "banco central", "ecb", "bce", "tipos de inter",
            "interest rate", "inflation", "inflacion", "inflación", "recession",
            "recesion", "recesión", "crisis", "war", "guerra", "tariff", "arance",
            "default", "deuda", "debt ceiling", "shutdown",
        ],
    },
    {
        "level": "medium",
        "tags": ["results", "macro"],
        "keywords": [
            "earnings", "resultados", "beneficio", "profit", "guidance", "prevision",
            "forecast", "jobs report", "empleo", "nóminas", "payroll", "ipo", "merger",
            "acquisition", "fusión", "oil", "petróleo", "opec", "semiconductor",
            "bank", "banco",
        ],
    },
    {
        "level": "medium",
        "tags": ["geo"],
        "keywords": [
            "sanction", "sancion", "sanción", "conflict", "conflicto", "china", "trade"
        ],
    },
]

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PulsoMercados/1.0)"}
OUTPUT = Path(__file__).resolve().parents[2] / "data" / "market.json"


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def classify_news(title: str, publisher: str = "") -> dict:
    text = f"{title} {publisher}".lower()
    tags = set()

    for rule in IMPACT_RULES:
        if any(keyword in text for keyword in rule["keywords"]):
            tags.update(rule["tags"])
            return {"impact": rule["level"], "tags": sorted(tags)}

    if re.search(r"market|mercado|bolsa|stocks|acciones|index|índice|indice", text):
        tags.add("macro")

    return {"impact": "low", "tags": sorted(tags)}


def fetch_index(index: dict) -> dict:
    symbol = urllib.parse.quote(index["symbol"])
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{symbol}?interval=1d&range=2d"
    )
    data = fetch_json(url)
    meta = data["chart"]["result"][0]["meta"]
    previous_close = (
        meta.get("chartPreviousClose")
        or meta.get("previousClose")
        or meta["regularMarketPrice"]
    )
    change = meta["regularMarketPrice"] - previous_close
    change_pct = (change / previous_close * 100) if previous_close else 0

    return {
        "name": index["name"],
        "symbol": index["symbol"],
        "price": meta["regularMarketPrice"],
        "change": change,
        "changePct": change_pct,
        "currency": meta.get("currency", ""),
    }


def fetch_news(query: str) -> list:
    url = (
        "https://query1.finance.yahoo.com/v1/finance/search?q="
        f"{urllib.parse.quote(query)}&newsCount=10&quotesCount=0"
    )
    data = fetch_json(url)
    items = []

    for item in data.get("news", []):
        title = item.get("title")
        link = item.get("link")
        if not title or not link:
            continue

        classified = classify_news(title, item.get("publisher", ""))
        items.append(
            {
                "id": item.get("uuid") or f"{title}-{item.get('providerPublishTime')}",
                "title": title,
                "link": link,
                "publisher": item.get("publisher") or "Fuente externa",
                "time": item.get("providerPublishTime"),
                "impact": classified["impact"],
                "tags": classified["tags"],
            }
        )

    return items


def merge_news(items: list) -> list:
    seen = {}
    for item in items:
        key = item["title"].strip().lower()
        if key not in seen:
            seen[key] = item
    return sorted(seen.values(), key=lambda item: item.get("time") or 0, reverse=True)


def main() -> None:
    indices = []
    index_errors = []

    for index in INDICES:
        try:
            indices.append(fetch_index(index))
        except Exception as error:  # noqa: BLE001 - keep workflow resilient
            index_errors.append({"name": index["name"], "error": str(error)})

    news = []
    news_errors = []

    for query in NEWS_QUERIES:
        try:
            news.extend(fetch_news(query))
        except Exception as error:  # noqa: BLE001
            news_errors.append({"query": query, "error": str(error)})

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "indices": indices,
        "news": merge_news(news),
        "errors": {
            "indices": index_errors,
            "news": news_errors,
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(indices)} indices and {len(payload['news'])} news items")


if __name__ == "__main__":
    main()
