"""
estoque_reconciliation.py — Casamento de nomes galpão ↔ BRT + disponibilidade real.

ONDE COLOCAR: app/estoque_reconciliation.py  (repo do BRT Desenrola)

Resolve o nome do item do galpão para o equipamento correto no BRT usando a
tabela equipment_aliases (camada oficial de match). Nunca faz fuzzy livre.

Regra de retorno de get_real_availability():
    - match confiável  -> real_stock_available (float) para a target_date
    - sem match / API off / falha -> None  (o chamador cai no fallback total_quantity)
"""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy.orm import Session

# Ajuste os imports aos nomes reais do BRT:
from app.models import EquipmentStock, EquipmentAlias  # type: ignore
from app import estoque_client


def normalize(name: str | None) -> str:
    """lower + trim + colapsa espaços (mesma normalização do galpão)."""
    if not name:
        return ""
    return re.sub(r"\s+", " ", name.strip().lower())


def _build_stock_index(target_date: date | str) -> dict[str, float]:
    """
    { nome_normalizado_do_galpão -> real_stock_available }.
    Vazio se a integração estiver off ou a API falhar.
    """
    index: dict[str, float] = {}
    for item in estoque_client.get_stock_items(target_date):
        n = normalize(item.get("name"))
        if not n:
            continue
        try:
            index[n] = float(item.get("real_stock_available") or 0)
        except (TypeError, ValueError):
            continue
    return index


def _resolve_equipment_stock_id(db: Session, normalized_name: str) -> int | None:
    """Descobre a qual EquipmentStock o nome (normalizado) pertence, via alias."""
    alias = (
        db.query(EquipmentAlias)
        .filter(
            EquipmentAlias.normalized_alias == normalized_name,
            EquipmentAlias.is_active.is_(True),
        )
        .first()
    )
    if alias:
        return alias.equipment_stock_id

    # Fallback: match direto pelo nome do próprio EquipmentStock (também normalizado).
    stock = db.query(EquipmentStock).all()
    for s in stock:
        if normalize(s.equipment_name) == normalized_name:
            return s.id
    return None


def get_real_availability(
    db: Session,
    equipment_name: str,
    target_date: date | str,
) -> float | None:
    """
    Disponibilidade real do galpão para (equipamento, data), resolvida por alias.
    None quando não há match confiável ou a API do galpão não respondeu.
    """
    if not estoque_client.is_configured():
        return None

    stock_index = _build_stock_index(target_date)
    if not stock_index:
        return None  # API off/vazia -> chamador usa fallback

    target_norm = normalize(equipment_name)

    # 1) match direto pelo nome que veio do galpão
    if target_norm in stock_index:
        return stock_index[target_norm]

    # 2) match via alias: descobre o stock_id do item do BRT e tenta achar,
    #    entre os nomes do galpão, algum que resolva para o mesmo stock_id.
    brt_stock_id = _resolve_equipment_stock_id(db, target_norm)
    if brt_stock_id is None:
        return None

    for galpao_norm, qty in stock_index.items():
        if _resolve_equipment_stock_id(db, galpao_norm) == brt_stock_id:
            return qty

    return None


def name_diff_report(db: Session, target_date: date | str) -> dict:
    """
    Relatório de divergência de nomes — GATE do go-live da decisão automática.
    Classifica: match exato | match por alias | galpão sem match no BRT | BRT sem match no galpão.

    Com a integração DESLIGADA (ESTOQUE_INTEGRATION_ENABLED=false) retorna um
    relatório controlado e vazio (não quebra). Para diagnóstico real, ligar a env
    temporariamente em ambiente controlado depois do galpão estar no ar.
    """
    if not estoque_client.is_configured():
        return {
            "integration_enabled": False,
            "date": estoque_client._date_str(target_date),
            "note": "Integração de estoque OFF (ESTOQUE_INTEGRATION_ENABLED=false). "
                    "Ligue temporariamente em ambiente controlado para o diagnóstico real.",
            "counts": {
                "match_exato": 0, "match_por_alias": 0,
                "galpao_sem_match_no_brt": 0, "brt_sem_match_no_galpao": 0,
            },
            "match_exato": [], "match_por_alias": [],
            "galpao_sem_match_no_brt": [], "brt_sem_match_no_galpao": [],
        }

    stock_index = _build_stock_index(target_date)
    galpao_names = set(stock_index.keys())

    brt_stock = db.query(EquipmentStock).all()
    brt_norm = {normalize(s.equipment_name): s for s in brt_stock}

    exact, via_alias, galpao_sem_match = [], [], []

    for gname in galpao_names:
        if gname in brt_norm:
            exact.append(gname)
        elif _resolve_equipment_stock_id(db, gname) is not None:
            via_alias.append(gname)
        else:
            galpao_sem_match.append(gname)

    brt_sem_match = [
        n for n in brt_norm
        if n not in galpao_names and _resolve_equipment_stock_id(db, n) is None
    ]

    return {
        "integration_enabled": True,
        "date": estoque_client._date_str(target_date),
        "counts": {
            "match_exato": len(exact),
            "match_por_alias": len(via_alias),
            "galpao_sem_match_no_brt": len(galpao_sem_match),
            "brt_sem_match_no_galpao": len(brt_sem_match),
        },
        "match_exato": sorted(exact),
        "match_por_alias": sorted(via_alias),
        "galpao_sem_match_no_brt": sorted(galpao_sem_match),
        "brt_sem_match_no_galpao": sorted(brt_sem_match),
    }
