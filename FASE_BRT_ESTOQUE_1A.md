# FASE BRT.ESTOQUE.1A — Diagnóstico read-only (BRT Desenrola ↔ Galpão)

Objetivo desta fase: conectar os dois sistemas **em modo diagnóstico**, sem tocar
em decisão automática, sem resumo/WhatsApp, sem migration. Risco operacional zero.

---

## Confirmações no código real do BRT (já verificadas)

- `EquipmentAlias` **existe** (`app/models/legacy.py`, tabela `equipment_aliases`; campos `equipment_stock_id`, `normalized_alias`, `is_active`). **Não precisa migration nesta fase.**
- `app/models/__init__.py` = `from .legacy import *` → `from app.models import EquipmentStock, EquipmentAlias` funciona.
- Testes de regressão citados abaixo existem em `tests/`.

## Comportamento com a integração DESLIGADA (importante)

A 1A sobe com `ESTOQUE_INTEGRATION_ENABLED=false`. Nesse estado:

- `/stock` → **503 controlado** (o client não consulta o galpão quando off).
- `/name-diff` → **relatório controlado com `integration_enabled: false`** e listas vazias (não quebra).
- Para validar a **conexão real** com o galpão, ligar a env para `true` **temporariamente, em ambiente controlado**, depois que o galpão estiver no ar. Não deixar `true` como padrão até passar pelo gate.

## Escopo — o que ENTRA na 1A

- `app/estoque_client.py`
- `app/estoque_reconciliation.py`
- `app/api/integrations_estoque.py`
- registro do router em `app/main.py`
- `tests/test_estoque_integration_diagnostics.py`

## O que NÃO entra agora

- `PATCH_equipment_availability.md` (decisão automática) → fase 1C
- `summary_dispatch.py` / scheduler de resumo / envio WhatsApp → fase à parte
- Fluxo 2 (reservas ao galpão), Fluxo 3 (webhooks)
- `git add .` / commit antes dos testes / deploy

---

## Prompt pronto para o dev

```txt
Objetivo:
Implementar BRT.ESTOQUE.1A — diagnóstico read-only da integração BRT Desenrola ↔ Galpão.

Contexto:
O serviço Galpão / Controle de Estoque expõe:
  GET /api/v1/public/stock?date=YYYY-MM-DD
  Header: x-api-key: <ESTOQUE_API_KEY>
O BRT deve consumir essa API apenas em modo diagnóstico nesta fase.

NÃO aplicar PATCH_equipment_availability.md.
NÃO mexer em decisão automática de sublocação.
NÃO sobrescrever EquipmentStock.total_quantity.
NÃO implementar summary_dispatch.py, scheduler, envio de reservas ou webhooks.
NÃO usar git add . / NÃO commitar antes dos testes / NÃO deployar.

Arquivos a criar:
- app/estoque_client.py
- app/estoque_reconciliation.py
- app/api/integrations_estoque.py
Arquivo a alterar:
- app/main.py
Teste a criar:
- tests/test_estoque_integration_diagnostics.py

Variáveis de ambiente:
  ESTOQUE_API_BASE_URL=https://<dominio-galpao>.up.railway.app
  ESTOQUE_API_KEY=<mesma API_KEY do galpão>
  ESTOQUE_CACHE_TTL_SECONDS=300
  ESTOQUE_INTEGRATION_ENABLED=false
Regra: o app NÃO pode quebrar se as variáveis não existirem. Com off:
  is_configured()=false; get_stock()=None; get_stock_items()=[];
  /stock => 503 controlado; /name-diff => resposta controlada (integration_enabled:false, listas vazias).

1) app/estoque_client.py
   - usar requests; ler env via settings do projeto se existir, senão os.getenv
   - BASE_URL sem barra final
   - get_stock(date) -> dict | None ; get_stock_items(date) -> list
   - cache por data com TTL ; clear_cache() para testes
   - se API falhar: retornar None + logar warning; nunca levantar exceção pro resto do app
   (base: integration_stubs_brt/estoque_client.py)

2) app/estoque_reconciliation.py
   - MATCHING POR ID (primário): galpão item['id'] == BRT equipment_id_meeventos.
     Nome direto e alias (equipment_aliases) só como rede. EquipmentStock e
     EquipmentReservation têm equipment_id_meeventos; EquipmentStock tem também o nome.
   - DISPONIBILIDADE FÍSICA (não real_stock_available): físico = real + commitments_on_date.
     O BRT reaplica as próprias reservas → usar o físico evita dupla contagem.
   - funções: normalize(name),
     get_physical_availability(db, equipment_id_meeventos, equipment_name, target_date),
     reconciliation_report(db, target_date)  [id-diff + name-diff]
   - retorna float se match confiável; None se off/falha/sem match
   (base: integration_stubs_brt/estoque_reconciliation.py)

3) app/api/integrations_estoque.py
   - GET /api/v1/integrations/estoque/stock?date=YYYY-MM-DD
       valida date; chama get_stock; 503 controlado se None; senão payload
   - GET /api/v1/integrations/estoque/name-diff?date=YYYY-MM-DD
       valida date; chama name_diff_report; retorna contagens + listas
   (base: integration_stubs_brt/estoque_routes.py)

4) app/main.py
   from app.api import integrations_estoque as api_integrations_estoque
   app.include_router(api_integrations_estoque.router,
                      prefix="/api/v1/integrations/estoque", tags=["estoque"])
   - respeitar padrão de routers já usado; não duplicar prefix; não quebrar health

5) tests/test_estoque_integration_diagnostics.py — cobrir:
   - is_configured() false sem env
   - get_stock None quando off ; get_stock_items [] quando off
   - get_stock usa header x-api-key quando configurado (mockar requests)
   - cache por data ; clear_cache limpa
   - normalize padroniza nomes
   - name_diff_report funciona
   - rota /stock 503 quando off ; date inválida 400
   - rota /name-diff date inválida 400 ; /name-diff off retorna integration_enabled:false
   - app importa sem erro com router registrado
   - nenhuma alteração em EquipmentStock.total_quantity

6) Regressão obrigatória:
   .venv/bin/python -m pytest tests/test_estoque_integration_diagnostics.py -q
   .venv/bin/python -m pytest \
     tests/test_88w7w3b_open_budgets_summary.py \
     tests/test_88w7w4a_events_summary.py \
     tests/test_88w7w4b_weekly_summary.py \
     tests/test_88w7w5c_team_tasks.py \
     tests/test_89_menu_whatsapp.py \
     tests/test_estoque_integration_diagnostics.py -q

7) Antes de commit, mostrar:
   git diff --stat HEAD app/estoque_client.py app/estoque_reconciliation.py \
     app/api/integrations_estoque.py app/main.py tests/test_estoque_integration_diagnostics.py
   grep -R "summary_dispatch\|PATCH_equipment_availability\|EquipmentStock.total_quantity" -n app tests || true
   grep -R "ESTOQUE_" -n app tests | head -50

8) NÃO commitar ainda. Mostrar: arquivos criados/alterados, testes, exemplo de
   resposta de /stock e /name-diff, riscos restantes. NÃO deployar. NÃO git add .
```

---

## Checklist de aprovação antes do commit

1. App sobe mesmo com `ESTOQUE_INTEGRATION_ENABLED=false`.
2. `/api/v1/integrations/estoque/stock` retorna 503 controlado se off.
3. `/api/v1/integrations/estoque/name-diff` funciona sem quebrar modelos.
4. Nenhuma decisão automática foi alterada.
5. Nenhum `summary_dispatch` entrou.
6. Testes novos passam.
7. Regressão passa.

## Ordem correta do projeto (aprovada)

1. **GALPÃO.1 — hardening do serviço galpão** (proteger endpoints de escrita, restringir CORS). ⚠️ Ver nota abaixo.
2. **GALPÃO.2 — deploy Railway do galpão** (brief `BRIEF_DEV_DEPLOY_GALPAO.md`).
3. **BRT.ESTOQUE.1A — diagnóstico read-only no BRT** (este documento).
4. **BRT.ESTOQUE.1B — name-diff real e aliases.**
5. **BRT.ESTOQUE.1C — patch da decisão com fallback.**

> **Nota sobre GALPÃO.1:** proteger os endpoints de escrita (`/api/eventos/:id/add-item`,
> `/api/transfer-item` etc.) com `apiKeyAuth` **quebraria o dashboard atual do galpão**,
> que chama essas rotas sem chave. Antes de aplicar, decidir: (a) dar a chave ao frontend,
> (b) isentar mesma-origem, ou (c) proteger só as rotas realmente externas. CORS restrito
> também depende de já conhecer o domínio do frontend/BRT. Tratar com cuidado, não às cegas.
