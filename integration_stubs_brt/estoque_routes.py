"""
estoque_routes.py — Rotas de DIAGNÓSTICO da integração (leitura pura, não decidem nada).

ONDE COLOCAR: app/api/integrations_estoque.py  (repo do BRT Desenrola)
E registrar no app/main.py:
    from app.api import integrations_estoque as api_integrations_estoque
    app.include_router(api_integrations_estoque.router, prefix="/api/v1/integrations/estoque", tags=["estoque"])

Endpoints:
    GET /api/v1/integrations/estoque/stock?date=YYYY-MM-DD      -> espelha o galpão
    GET /api/v1/integrations/estoque/name-diff?date=YYYY-MM-DD  -> relatório de divergência (GATE)
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException

from app.database import SessionLocal
from app import estoque_client
from app.estoque_reconciliation import name_diff_report

router = APIRouter()


def _parse_date(value: str | None) -> str:
    if not value:
        return date.today().isoformat()
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date inválida (use YYYY-MM-DD).") from exc


@router.get("/stock")
def integ_stock(date: str | None = None) -> dict:
    """Espelha o /stock do galpão para a data (debug de conectividade)."""
    d = _parse_date(date)
    payload = estoque_client.get_stock(d)
    if payload is None:
        raise HTTPException(
            status_code=503,
            detail="Integração de estoque off ou galpão indisponível.",
        )
    return {"ok": True, "source": "galpao", "date": d, "payload": payload}


@router.get("/name-diff")
def integ_name_diff(date: str | None = None) -> dict:
    """Relatório de divergência de nomes. Rodar ANTES de ligar a decisão automática."""
    d = _parse_date(date)
    with SessionLocal() as db:
        report = name_diff_report(db, d)
    return {"ok": True, **report}
