# Runbook de Go-Live — Galpão + BRT Desenrola rodando juntos no Railway

**Cenário:** BRT Desenrola já está no ar no Railway. Vamos subir o **Galpão** como um novo serviço no **mesmo projeto Railway**, conectar o estoque real (Fluxo 1) e ligar o WhatsApp/IA/resumos — tudo ao mesmo tempo.

**Legenda de responsável:** 🟢 você / painel Railway · 🔵 dev do BRT Desenrola

---

## Fase 0 — Pré-requisitos (antes de subir)

- 🟢 **Repositório do galpão no GitHub.** Fazer `git push` do projeto do galpão já com os arquivos novos: `Dockerfile.railway`, `railway.json`, `.env.example`, `.gitignore`.
- 🟢 **Rotacionar segredos** que estavam expostos (MeEventos, Gemini, GitHub, Google Cloud). Eles vão só nas variáveis do Railway, nunca no Git.
- 🟢 **Gerar a chave da API** do galpão: `openssl rand -hex 32`. Guarde — ela liga os dois sistemas.

> ⚠️ **Atenção aos dados iniciais.** O `.gitignore` ignora a pasta `logs/`, onde vivem `inventory_complete.json` e `qr_units.json` — que são a fonte do `/stock`. Se o serviço subir com essa pasta vazia, o `/stock` volta **vazio**. Ver Fase 1, passo 4.

---

## Fase 1 — Subir o Galpão no Railway 🟢

1. No projeto Railway do BRT Desenrola → **New → Service → Deploy from GitHub repo** → selecione o repo do galpão.
2. O Railway lê o `railway.json` e usa o **`Dockerfile.railway`** (imagem enxuta, só `node server.js`). Healthcheck já aponta para `/api/ping`.
3. **Variables** (aba do serviço do galpão):

   | Variável | Valor |
   | :-- | :-- |
   | `API_KEY` | a chave forte gerada na Fase 0 |
   | `ENABLE_WHATSAPP` | `false` |
   | `MEEVENTOS_API_KEY` | sua chave |
   | `MEEVENTOS_BASE_URL` | `https://app1.meeventos.com.br/brt/api/v1` |
   | `MEEVENTOS_USUARIO` / `MEEVENTOS_SENHA` | credenciais |
   | `GEMINI_API_KEY` | opcional (só se usar o Mark do galpão) |

   Não defina `PORT` — o Railway injeta.
4. **Volume + dados iniciais** (Settings → Volumes): criar volume montado em **`/app/logs`**. Como ele começa vazio, subir os JSON atuais (`inventory_complete.json`, `qr_units.json`, e a pasta `cache_equipamentos/`) para o volume. Duas formas:
   - **Rápida:** temporariamente tirar `logs/` do `.gitignore`, comitar só esses arquivos de dados, subir uma vez, e depois voltar a ignorar; **ou**
   - **Limpa:** usar o CLI do Railway (`railway run`) / um endpoint de sync para popular o volume no primeiro boot.
5. Após o deploy: **Settings → Networking → Generate Domain**. Guarde a URL, ex.: `https://galpao-production.up.railway.app`.
6. **Testar:**
   ```bash
   curl https://galpao-production.up.railway.app/api/ping
   curl -H "x-api-key: SUA_API_KEY" \
     "https://galpao-production.up.railway.app/api/v1/public/stock?date=2026-07-10"
   ```
   Esperado: `/api/ping` → `pong`; `/stock` → lista de itens com `real_stock_available`.

✅ **Marco 1:** galpão no ar e respondendo com dados.

---

## Fase 2 — Conectar o BRT Desenrola ao estoque (Fluxo 1)

> ⚠️ **Decisão técnica (corrigida).** NÃO sobrescrever `EquipmentStock.total_quantity` com `real_stock_available`. O `real_stock_available` **depende da data consultada**; o `total_quantity` é estático. Gravar a disponibilidade de hoje no campo estático faria o BRT decidir errado para eventos futuros (ex.: hoje 4 caixas livres, sábado 0 porque já reservadas → gravar `4` faz o sistema achar que sábado tem 4). Portanto: **consulta real por data com cache**, usando `real_stock_available` como prioridade e `total_quantity` só como fallback.

### 2A — Config 🟢
No serviço do **BRT Desenrola** no Railway, adicionar:

| Variável | Valor |
| :-- | :-- |
| `ESTOQUE_API_BASE_URL` | domínio do galpão (Fase 1.5) |
| `ESTOQUE_API_KEY` | mesma `API_KEY` do galpão |
| `ESTOQUE_CACHE_TTL_SECONDS` | `300` |
| `ESTOQUE_INTEGRATION_ENABLED` | `true` |

### 2B — Leitura + diagnóstico (sem alterar a decisão ainda) 🔵
- Client HTTP para `GET {ESTOQUE_API_BASE_URL}/api/v1/public/stock?date=YYYY-MM-DD` (header `x-api-key`), com **cache por data** (chave `estoque_stock:YYYY-MM-DD`, TTL 300s).
- Serviço de reconciliação de nomes: normalizar (`lower`, `trim`, colapsar espaços) e usar `equipment_aliases` como camada oficial de match. Retorna `real_stock_available` quando há match confiável; `None` quando a API falha ou o match não é confiável.
- Rotas de diagnóstico (leitura pura, não decidem nada):
  ```
  GET /api/v1/integrations/estoque/stock?date=YYYY-MM-DD        # espelha o galpão
  GET /api/v1/integrations/estoque/name-diff?date=YYYY-MM-DD    # relatório de divergência
  ```
  O `name-diff` classifica: match exato · match por alias · itens do galpão sem match no BRT · itens do BRT sem match no galpão.

### 2C — Plugar na decisão, com fallback seguro 🔵
Em `app/equipment_availability.py::check_equipment_conflicts(db, target_date)`, usando a **mesma `target_date` do evento**:

```
se ESTOQUE_INTEGRATION_ENABLED e houver match confiável:
    available_qty = real_stock_available (da target_date)
senão se sem match:
    available_qty = EquipmentStock.total_quantity   # fallback + alerta de reconciliação
senão se API do galpão caiu:
    available_qty = EquipmentStock.total_quantity   # fallback + alerta de fallback
```

Nunca sobrescrever `total_quantity` com disponibilidade de uma data específica.

✅ **Marco 2:** o BRT consulta `/stock?date=` com a data de cada evento e decide sublocação com o número real, mantendo fallback.

> 🚦 **Gate de segurança:** a **decisão automática** de sublocação só é ligada **depois** do relatório `name-diff` estar limpo. Enquanto houver divergência de nomes relevante, rodar em modo diagnóstico (loga o que decidiria, sem agir).

---

## Fase 3 — WhatsApp + IA + Resumos (Cloud API oficial, só no BRT Desenrola)

**Decisão:** resumos vão para **pessoas (números) via WhatsApp Cloud API oficial** — sem ponte QR, sem Chromium no Railway, sem risco de bloqueio. A Cloud API **não** faz grupo (só 1:1); por isso o destino são os números da equipe. Nada a subir de novo: o BRT já tem `app/whatsapp_client.py` (envio oficial, aceita lista de números) e os handlers de resumo.

### 3A — Config 🔵
1. Definir os destinatários: `SUMMARY_RECIPIENTS="5511999999999,5511888888888"`.
2. Confirmar setados no BRT: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BASE_URL`, `WHATSAPP_API_VERSION`.
3. Job no `app/scheduler.py`: gera `daily_summary`/`events_summary` (pode enriquecer com o Fluxo 1) e chama `whatsapp_client.send_text(SUMMARY_RECIPIENTS, body, category="daily_summary")`.

### 3B — Janela de 24h / template ⚠️
Para envio **proativo** (agendado), a Cloud API exige **template aprovado** (a pessoa não iniciou conversa nas últimas 24h). Registrar um template de resumo (utility) com quem administra o WhatsApp Business. Só o que a equipe pede ativamente (janela aberta) pode ir como texto livre.

✅ **Marco 3:** resumo chegando no WhatsApp dos números da equipe (via template no agendado; texto livre no sob demanda).

---

## Fase 4 — Validação conjunta (tudo junto)

- 🟢 `GET /api/v1/public/stock` do galpão responde com `x-api-key`.
- 🔵 Job de sync do BRT rodou e atualizou `EquipmentStock`.
- 🔵 Alerta de sublocação usa o número real.
- 🔵 Resumo chega no WhatsApp dos números da equipe (Cloud API).
- 🔵 Teste ponta a ponta com 1 evento real + relatório de divergência de nomes (matching).

---

## Como validar ANTES de plugar na decisão

**Antes do deploy (local, opcional):** subir o galpão local (`ENABLE_WHATSAPP=false node server.js`) e conferir `curl localhost:3000/api/ping` e `/api/v1/public/stock` com a `API_KEY`.

**Depois do deploy do galpão (smoke test):**
```bash
curl https://galpao-production.up.railway.app/api/ping
curl -H "x-api-key: SUA_API_KEY" \
  "https://galpao-production.up.railway.app/api/v1/public/stock?date=2026-07-10"
```
Confirmar que vêm itens com `real_stock_available`.

**Do lado do BRT, em modo leitura (sem decidir):**
1. Bater na rota de diagnóstico `GET /api/v1/integrations/estoque/stock?date=...` e ver o mesmo retorno do galpão.
2. Rodar `GET /api/v1/integrations/estoque/name-diff?date=...` → este é o **teste que libera o go-live da decisão**. Enquanto houver itens relevantes "sem match", corrigir via `equipment_aliases` antes de ligar a decisão automática.

**Teste com 1 evento real (ponta a ponta):** escolher um evento com equipamentos conhecidos e seguir: MeEventos → BRT → BRT consulta `/stock?date=<data do evento>` → calcula conflito com `real_stock_available` → gera (ou não) alerta de sublocação → resumo no WhatsApp mostra a info certa.

---

## Os pontos que mais travam (fique de olho)

1. **Matching de nomes é o MAIOR risco** — não é a API. Nome divergente entre MeEventos/BRT/galpão faz o sistema sugerir sublocação sem precisar, ou deixar passar falta real. Por isso o gate do `name-diff` antes da decisão automática.
2. **Dados iniciais no volume do galpão** (Fase 1.4). Sem os JSON no `/app/logs`, o `/stock` vem vazio e parece que "não funcionou".
3. **Janela de 24h da Cloud API** (Fase 3B). Resumo proativo (agendado) precisa de **template aprovado**, senão a Meta bloqueia o envio fora da janela. Sem isso, o resumo agendado não sai. (A ponte QR/whatsapp-web.js foi descartada — não é mais um risco.)

---

## Ordem recomendada para "rodar os 2 hoje"

1. Fase 1 (galpão no ar) → validar `/stock`.
2. Fase 3 (WhatsApp Cloud API → números da equipe) → validar um resumo de teste. **Separado do estoque.**
3. Fase 2B (BRT lê o estoque + rotas de diagnóstico + `name-diff`) → provar que os dois conversam.
4. Fase 2C (plugar na decisão) **só depois do `name-diff` limpo**.
5. Fase 4 (validação conjunta).

As Fases 1, 3 e 2B já colocam **os dois rodando, visíveis e conversando hoje**. A decisão automática de sublocação entra depois do relatório de nomes.

## O que NÃO fazer hoje sem teste

- Não sobrescrever `EquipmentStock.total_quantity` em produção.
- Não ativar envio automático de reserva para o galpão (Fluxo 2).
- Não mover card/Trello automaticamente via webhook (Fluxo 3).
- Não usar a ponte QR (grupos) — descartada em favor da Cloud API 1:1.
