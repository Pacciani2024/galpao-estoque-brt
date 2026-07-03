"""
estoque_client.py — Client HTTP para o Controle de Estoque do galpão (Fluxo 1).

ONDE COLOCAR: app/estoque_client.py  (no repo do BRT Desenrola)

Consome a API pública do galpão:
    GET {ESTOQUE_API_BASE_URL}/api/v1/public/stock?date=YYYY-MM-DD   (header x-api-key)

Faz cache em memória por data (TTL configurável). Para múltiplos workers,
troque o cache por Redis (ver TODO abaixo).

Variáveis de ambiente:
    ESTOQUE_API_BASE_URL        ex.: https://galpao-production.up.railway.app
    ESTOQUE_API_KEY             mesma API_KEY definida no galpão
    ESTOQUE_CACHE_TTL_SECONDS   default 300
    ESTOQUE_INTEGRATION_ENABLED "true"/"false" (default "false")
"""
from __future__ import annotations

import os
import time
import threading
from datetime import date
from typing import Any

import requests

# Se o BRT usa app.config.settings, prefira ler de lá. Aqui usamos os.getenv
# para o stub ser autossuficiente.
BASE_URL = os.getenv("ESTOQUE_API_BASE_URL", "").rstrip("/")
API_KEY = os.getenv("ESTOQUE_API_KEY", "")
CACHE_TTL = int(os.getenv("ESTOQUE_CACHE_TTL_SECONDS", "300"))
ENABLED = os.getenv("ESTOQUE_INTEGRATION_ENABLED", "false").lower() == "true"

_HEADERS = {"x-api-key": API_KEY, "Accept": "application/json"}

# Cache simples: { "YYYY-MM-DD": (expira_em_epoch, payload_dict) }
# TODO(prod): trocar por Redis se rodar com >1 worker (uvicorn --workers N).
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_lock = threading.Lock()


def is_configured() -> bool:
    return bool(ENABLED and BASE_URL and API_KEY)


def _date_str(target_date: date | str) -> str:
    return target_date.isoformat() if isinstance(target_date, date) else str(target_date)


def get_stock(target_date: date | str, timeout: int = 15) -> dict[str, Any] | None:
    """
    Retorna o payload cru do galpão para a data:
        { "date_queried": "...", "total_items": N, "data": [ {name, real_stock_available, ...}, ... ] }
    ou None se a integração estiver off / API falhar.
    """
    if not is_configured():
        return None

    key = _date_str(target_date)
    now = time.time()

    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    url = f"{BASE_URL}/api/v1/public/stock"
    try:
        resp = requests.get(url, headers=_HEADERS, params={"date": key}, timeout=timeout)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — queremos degradar com segurança
        # TODO: logar com o logger do BRT (from app.logger import logger)
        print(f"[estoque_client] falha ao consultar /stock?date={key}: {exc}")
        return None

    with _lock:
        _cache[key] = (now + CACHE_TTL, payload)
    return payload


def get_stock_items(target_date: date | str) -> list[dict[str, Any]]:
    """Só a lista de itens (data[]). Lista vazia se indisponível."""
    payload = get_stock(target_date)
    if not payload:
        return []
    return payload.get("data", []) or []


def clear_cache() -> None:
    with _lock:
        _cache.clear()
