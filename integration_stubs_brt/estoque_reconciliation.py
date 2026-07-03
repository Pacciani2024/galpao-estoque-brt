"""
estoque_reconciliation.py — Casamento galpão ↔ BRT (por ID do MeEventos) + disponibilidade.

ONDE COLOCAR: app/estoque_reconciliation.py  (repo do BRT Desenrola)

ESTRATÉGIA DE MATCHING (nesta ordem):
  1) por ID do MeEventos  -> galpão item['id'] == BRT equipment_id_meeventos  (PRIMÁRIO, exato)
  2) por nome normalizado -> nome do galpão == nome do EquipmentStock
  3) por alias            -> equipment_aliases (nome normalizado -> equipment_stock)
  Sem match em nenhum -> None (o chamador cai no fallback total_quantity + alerta).

DISPONIBILIDADE USADA: FÍSICA (disponível + granel − manutenção), NÃO o
real_stock_available. Motivo: o BRT aplica as PRÓPRIAS reservas por cima; usar o número
já descontado pelo galpão (real_stock_available) causaria DUPLA CONTAGEM.
Identidade do /stock:  físico = real_stock_available + commitments_on_date.
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


def _physical(item: dict) -> float:
    """Disponibilidade FÍSICA do galpão (antes das reservas do BRT)."""
    try:
        real = float(item.get("real_stock_available") or 0)
        commit = float(item.get("commitments_on_date") or 0)
        return real + commit  # físico = real + compromissos (que o BRT reaplica)
    except (TypeError, ValueError):
        return 0.0


def _build_indexes(target_date: date | str) -> tuple[dict[str, float], dict[str, float]]:
    """Retorna (por_id, por_nome) -> disponibilidade física. Vazios se off/falha."""
    by_id: dict[str, float] = {}
    by_name: dict[str, float] = {}
    for item in estoque_client.get_stock_items(target_date):
        phys = _physical(item)
        iid = item.get("id")
        if iid is not None and str(iid):
            by_id[str(iid)] = phys
        n = normalize(item.get("name"))
        if n:
            by_name[n] = phys
    return by_id, by_name


def _resolve_equipment_stock_id(db: Session, normalized_name: str) -> int | None:
    """Descobre a qual EquipmentStock o nome (normalizado) pertence, via alias ou nome direto."""
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
    for s in db.query(EquipmentStock).all():
        if normalize(s.equipment_name) == normalized_name:
            return s.id
    return None


def get_physical_availability(
    db: Session,
    equipment_id_meeventos: str | int | None,
    equipment_name: str | None,
    target_date: date | str,
) -> float | None:
    """
    Disponibilidade FÍSICA do galpão para (equipamento, data). Casa por ID primeiro.
    None quando integração off / API falhou / sem match confiável.
    """
    if not estoque_client.is_configured():
        return None

    by_id, by_name = _build_indexes(target_date)
    if not by_id and not by_name:
        return None

    # 1) por ID do MeEventos (exato)
    if equipment_id_meeventos not in (None, ""):
        key = str(equipment_id_meeventos)
        if key in by_id:
            return by_id[key]

    # 2) por nome direto
    tn = normalize(equipment_name)
    if tn and tn in by_name:
        return by_name[tn]

    # 3) por alias
    if tn:
        brt_stock_id = _resolve_equipment_stock_id(db, tn)
        if brt_stock_id is not None:
            for gname, qty in by_name.items():
                if _resolve_equipment_stock_id(db, gname) == brt_stock_id:
                    return qty
    return None


# Compat: nome antigo aponta para a versão física (fonte única de disponibilidade).
get_real_availability = get_physical_availability


def reconciliation_report(db: Session, target_date: date | str) -> dict:
    """
    Relatório de reconciliação (id-diff + name-diff) — GATE antes da decisão automática.
    Classifica cada item do galpão: match por ID | por nome | por alias | sem match.
    Com integração OFF, retorna relatório controlado e vazio (não quebra).
    """
    if not estoque_client.is_configured():
        return {
            "integration_enabled": False,
            "date": estoque_client._date_str(target_date),
            "note": "Integração OFF (ESTOQUE_INTEGRATION_ENABLED=false). "
                    "Ligue temporariamente em ambiente controlado para o diagnóstico real.",
            "counts": {"match_por_id": 0, "match_por_nome": 0, "match_por_alias": 0,
                       "galpao_sem_match": 0, "brt_sem_match": 0},
            "galpao_sem_match": [], "brt_sem_match": [],
        }

    items = estoque_client.get_stock_items(target_date)
    brt_stock = db.query(EquipmentStock).all()
    brt_ids = {str(s.equipment_id_meeventos) for s in brt_stock if s.equipment_id_meeventos}
    brt_norm = {normalize(s.equipment_name): s for s in brt_stock}

    by_id, by_nome, by_alias, sem_match = [], [], [], []
    galpao_ids, galpao_names = set(), set()

    for item in items:
        iid = str(item.get("id") or "")
        gname = normalize(item.get("name"))
        label = item.get("name")
        if iid:
            galpao_ids.add(iid)
        if gname:
            galpao_names.add(gname)

        if iid and iid in brt_ids:
            by_id.append(label)
        elif gname in brt_norm:
            by_nome.append(label)
        elif _resolve_equipment_stock_id(db, gname) is not None:
            by_alias.append(label)
        else:
            sem_match.append(label)

    brt_sem_match = [
        s.equipment_name for s in brt_stock
        if (not s.equipment_id_meeventos or str(s.equipment_id_meeventos) not in galpao_ids)
        and normalize(s.equipment_name) not in galpao_names
        and _resolve_equipment_stock_id(db, normalize(s.equipment_name)) is None
    ]

    return {
        "integration_enabled": True,
        "date": estoque_client._date_str(target_date),
        "counts": {
            "match_por_id": len(by_id),
            "match_por_nome": len(by_nome),
            "match_por_alias": len(by_alias),
            "galpao_sem_match": len(sem_match),
            "brt_sem_match": len(brt_sem_match),
        },
        "galpao_sem_match": sorted(sem_match),
        "brt_sem_match": sorted(brt_sem_match),
    }


# Compat com a rota/testes que chamam name_diff_report.
name_diff_report = reconciliation_report
