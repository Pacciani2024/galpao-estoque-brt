"""
summary_dispatch.py — Envio de resumo para os números da equipe via WhatsApp Cloud API.

ONDE COLOCAR: app/summary_dispatch.py  (repo do BRT Desenrola)

Usa o whatsapp_client existente (Cloud API oficial, envio 1:1 / lista de números).
NÃO usa grupo (a Cloud API não suporta grupo).

Variáveis de ambiente:
    SUMMARY_RECIPIENTS   "5511999999999,5511888888888"
    SUMMARY_TEMPLATE_NAME  (opcional) nome do template aprovado p/ envio proativo

⚠️ Janela de 24h: para envio PROATIVO/agendado (a pessoa não iniciou conversa),
a Cloud API exige TEMPLATE aprovado. send_text (texto livre) só funciona dentro
da janela de 24h após a pessoa te escrever. Ver TODO em send_summary().
"""
from __future__ import annotations

import os

# Ajuste ao caminho real:
from app.whatsapp_client import WhatsAppClient  # type: ignore
from app import estoque_client
from app.estoque_reconciliation import normalize

SUMMARY_RECIPIENTS = [
    r.strip() for r in os.getenv("SUMMARY_RECIPIENTS", "").replace(";", ",").split(",") if r.strip()
]
SUMMARY_TEMPLATE_NAME = os.getenv("SUMMARY_TEMPLATE_NAME", "")


def build_summary_text(target_date: str, base_summary: str = "") -> str:
    """
    Monta o corpo do resumo. Aqui você pluga os handlers existentes do BRT
    (daily_summary / events_summary) em `base_summary` e enriquece com o estoque
    real do galpão (faltas na data).
    """
    lines = [f"📋 Resumo BRT — {target_date}"]
    if base_summary:
        lines.append(base_summary)

    # Enriquecimento com estoque do galpão (Fluxo 1): destaca itens zerados/baixos.
    items = estoque_client.get_stock_items(target_date)
    criticos = [
        i for i in items
        if isinstance(i.get("real_stock_available"), (int, float))
        and i["real_stock_available"] <= 0
    ]
    if criticos:
        lines.append("\n⚠️ Sem disponibilidade nesta data:")
        for i in criticos[:15]:
            lines.append(f"• {i.get('name')}")
    return "\n".join(lines)


def send_summary(target_date: str, base_summary: str = "") -> dict:
    """
    Envia o resumo para SUMMARY_RECIPIENTS.

    TODO(prod): para envio agendado/proativo, trocar send_text por envio de
    TEMPLATE (SUMMARY_TEMPLATE_NAME) — a Cloud API bloqueia texto livre fora da
    janela de 24h. O whatsapp_client do BRT pode precisar de um método
    send_template(to, template_name, params). send_text abaixo serve para o
    fluxo SOB DEMANDA (janela aberta) e para testes.
    """
    if not SUMMARY_RECIPIENTS:
        return {"ok": False, "error": "SUMMARY_RECIPIENTS vazio."}

    body = build_summary_text(target_date, base_summary)
    client = WhatsAppClient()
    if not client.is_configured():
        return {"ok": False, "error": "WhatsApp Cloud API não configurada."}

    return client.send_text(SUMMARY_RECIPIENTS, body, category="daily_summary")
