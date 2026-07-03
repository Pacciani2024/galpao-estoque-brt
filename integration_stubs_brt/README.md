# Stubs de integração (BRT Desenrola ↔ Galpão) — para o dev

Arquivos-esqueleto para colar no repo do **BRT Desenrola** (FastAPI), **em fases**.
Não subir tudo de uma vez — estoque e resumo/WhatsApp são frentes separadas.

## Confirmado no código real do BRT (não é suposição)

- `EquipmentAlias` **existe** (`app/models/legacy.py`, tabela `equipment_aliases`; campos `equipment_stock_id`, `normalized_alias`, `is_active`). Não precisa migration na 1A.
- `app/models/__init__.py` = `from .legacy import *` → `from app.models import EquipmentStock, EquipmentAlias` funciona.
- Os testes de regressão citados na 1A existem em `tests/`.

## FASE BRT.ESTOQUE.1A — Diagnóstico read-only (subir SÓ isto agora)

| Arquivo (aqui) | Destino no BRT |
| :-- | :-- |
| `estoque_client.py` | `app/estoque_client.py` |
| `estoque_reconciliation.py` | `app/estoque_reconciliation.py` |
| `estoque_routes.py` | `app/api/integrations_estoque.py` |
| — | registrar router em `app/main.py` |
| — | `tests/test_estoque_integration_diagnostics.py` |

Passo a passo e regras completas: `../FASE_BRT_ESTOQUE_1A.md` (prompt pronto pro dev).

Env (começar com integração **off**):
```
ESTOQUE_API_BASE_URL=https://<dominio-galpao>.up.railway.app
ESTOQUE_API_KEY=<mesma API_KEY do galpão>
ESTOQUE_CACHE_TTL_SECONDS=300
ESTOQUE_INTEGRATION_ENABLED=false
```

Registrar rotas (`app/main.py`):
```python
from app.api import integrations_estoque as api_integrations_estoque
app.include_router(
    api_integrations_estoque.router,
    prefix="/api/v1/integrations/estoque",
    tags=["estoque"],
)
```

## Fases seguintes (pasta `fases_posteriores/` — NÃO subir agora)

- **BRT.ESTOQUE.1B** — matching de nomes: rodar `/name-diff` até limpar, ajustar `equipment_aliases`.
- **BRT.ESTOQUE.1C** — `fases_posteriores/PATCH_equipment_availability.md`: plugar a disponibilidade real na decisão, mantendo fallback; ligar `ESTOQUE_INTEGRATION_ENABLED=true` só após testes.
- **Resumo/WhatsApp** — `fases_posteriores/summary_dispatch.py`: outra frente (Cloud API 1:1 + template). Depois do estoque estável.
- Mais adiante: Fluxo 2 (reservas ao galpão), Fluxo 3 (webhooks).

## Notas

- Cache em memória; trocar por Redis se rodar com múltiplos workers.
- Com `ESTOQUE_INTEGRATION_ENABLED=false` ou sem match, tudo cai no fallback atual — nada muda no comportamento de hoje.
- Contexto: `../HANDOFF_INTEGRACAO_ESTOQUE_x_BRTDESENROLA.md`, `../RUNBOOK_GOLIVE_2_SISTEMAS.md`.
