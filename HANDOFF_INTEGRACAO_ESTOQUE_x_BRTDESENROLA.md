# Handoff técnico — Integração Controle de Estoque (galpão) ↔ BRT Desenrola

**Para:** dev que mantém o `brt_meeventos_whatsapp` (BRT Desenrola)
**De:** time do Controle de Estoque (galpão)
**Objetivo:** dar ao BRT Desenrola a **disponibilidade física real** de equipamentos (por data) que hoje ele só estima, e fechar o loop de reservas e movimentações.

> Nenhum código foi alterado ainda. Este documento é o desenho da integração para você revisar e implementar do lado do BRT Desenrola. Do lado do galpão a API pública já existe.

---

## 1. Os dois sistemas em uma frase

| Sistema | Stack | Papel | Fonte da verdade sobre… |
| :-- | :-- | :-- | :-- |
| **BRT Desenrola** (`brt_meeventos_whatsapp`) | FastAPI + Postgres, Railway | Cérebro operacional: MeEventos, WhatsApp, Trello, sublocação, frota | Reservas por evento/data, decisão de sublocar |
| **Controle de Estoque** (galpão) | Node/Express, JSON files, Railway | Realidade física do galpão | Disponibilidade real por data, QR por unidade, manutenção |

O problema hoje: o BRT Desenrola decide sublocação comparando reservas contra `EquipmentStock.total_quantity`, que é um **número estático** vindo do MeEventos. O galpão sabe a disponibilidade **real por data**. Esta integração conecta os dois.

---

## 2. Arquitetura — 3 fluxos

```
   MeEventos ──► BRT Desenrola ──(2) reservas──►  Controle de Estoque (galpão)
                     ▲   │                              │
                     │   └──(1) consulta disponibilidade real (GET /stock)
                     └──────(3) webhooks saída/retorno ─┘
```

1. **(Prioritário) Disponibilidade real** — BRT Desenrola consulta o galpão para saber quanto realmente há disponível numa data.
2. **Reservas** — BRT Desenrola informa ao galpão o que está comprometido por evento.
3. **Webhooks** — galpão avisa o BRT Desenrola quando o evento sai/volta.

---

## 3. Autenticação (vale para os 3 fluxos de leitura/escrita no galpão)

Chave única no header (ou query). Definida como `API_KEY` no Railway do galpão.

```
x-api-key: <API_KEY>          # recomendado
?key=<API_KEY>                # alternativa
```

Erro de chave: `401 {"error": "Acesso Negado: API Key inválida ou ausente."}`

Guarde a chave no `.env`/variáveis do BRT Desenrola (sugestão: `ESTOQUE_API_BASE_URL` e `ESTOQUE_API_KEY`).

---

## 4. FLUXO 1 — Disponibilidade real (o mais importante)

### 4.1 Endpoint do galpão a consumir

```
GET {ESTOQUE_API_BASE_URL}/api/v1/public/stock?date=YYYY-MM-DD
Header: x-api-key: <API_KEY>
```

Resposta (resumida):

```json
{
  "timestamp": "2026-07-10T01:34:24.021Z",
  "date_queried": "2026-07-10",
  "total_items": 482,
  "data": [
    {
      "id": "2",
      "name": "CAIXA ATIVA QSC K12",
      "category": "SONORIZAÇÃO",
      "total_stock": 6,
      "real_stock_available": 4,      // <-- USAR ESTE
      "maintenance": 0,
      "commitments_on_date": 0,
      "value": "250,00",
      "units_detail": [ {"qr_code":"000004","status":"disponivel","last_event":null} ]
    }
  ]
}
```

O campo que interessa é **`real_stock_available`** = físico − manutenção − reservas já lançadas para aquela data.

### 4.2 Onde encaixa no seu código

O ponto único de decisão é `app/equipment_availability.py::check_equipment_conflicts(db, target_date)`. Hoje ele faz:

```python
stock_item = db.query(EquipmentStock).filter(
    EquipmentStock.equipment_name == eq_name
).first()
available_qty = float(stock_item.total_quantity or 0)   # número ESTÁTICO
```

Ele é chamado em 3 lugares (todos passam por essa mesma função, então basta mudar aqui):

- `app/operations_brain.py:477`
- `app/services/subrental_ops.py:59`
- `app/whatsapp/handlers/reservations.py:193,211`

**Duas opções de implementação** (escolha uma):

**Opção A — Consulta em tempo real (mais preciso, por data).**
Dentro de `check_equipment_conflicts`, substituir a leitura de `total_quantity` por uma consulta ao galpão para `target_date`, casando por nome:

```python
# pseudo
stock_map = estoque_client.get_stock(target_date)   # dict normalizado por nome
available_qty = stock_map.get(normalize(eq_name), fallback_total_quantity)
```

Prós: disponibilidade correta para a data exata. Contras: chamada de rede na avaliação (cachear a resposta por data por alguns minutos resolve).

**Opção B — Job de sync periódico (mais simples, mantém o schema atual).**
Um job no `app/scheduler.py` (APScheduler já existe) chama `GET /stock` (sem data ou data=hoje) e atualiza `EquipmentStock.total_quantity` com `real_stock_available`. `check_equipment_conflicts` continua igual.
Prós: zero mudança na lógica de conflito, sem latência. Contras: perde a granularidade por data (usa a foto mais recente).

> **Recomendação (corrigida): use a Opção A com cache + fallback.** A Opção B (sobrescrever `total_quantity`) é perigosa: `real_stock_available` **depende da data**, e `total_quantity` é estático. Gravar a disponibilidade de hoje no campo estático faz o BRT decidir errado para eventos futuros (hoje 4 livres, sábado 0 por já reservadas → gravar `4` faz achar que sábado tem 4). Consulte `/stock?date=<data do evento>` em tempo real, com cache por data, e mantenha `total_quantity` só como fallback. **Nunca** sobrescreva `total_quantity` com a disponibilidade de uma data específica.

### 4.3 Spec pronta para o dev (Fluxo 1)

```
Decisão: NÃO sobrescrever EquipmentStock.total_quantity com real_stock_available
(real_stock_available depende da data; total_quantity é fallback estático).
Implementar leitura real por data com cache:

1. Variáveis:
   ESTOQUE_API_BASE_URL, ESTOQUE_API_KEY,
   ESTOQUE_CACHE_TTL_SECONDS=300, ESTOQUE_INTEGRATION_ENABLED=true

2. Client HTTP:
   GET {ESTOQUE_API_BASE_URL}/api/v1/public/stock?date=YYYY-MM-DD  (header x-api-key)

3. Cache por data: chave estoque_stock:YYYY-MM-DD, TTL 300s

4. Serviço de reconciliação de nomes:
   - normalizar (lower, trim, colapsar espaços)
   - equipment_aliases como camada oficial de match
   - retornar real_stock_available quando match confiável; None se API falha/sem match

5. Rotas de diagnóstico (leitura pura):
   GET /api/v1/integrations/estoque/stock?date=YYYY-MM-DD
   GET /api/v1/integrations/estoque/name-diff?date=YYYY-MM-DD
     (match exato | match por alias | galpão sem match no BRT | BRT sem match no galpão)

6. app/equipment_availability.py::check_equipment_conflicts(db, target_date):
   - se ESTOQUE_INTEGRATION_ENABLED: consultar disponibilidade real usando target_date
   - se número: usar como available_qty
   - se None: fallback EquipmentStock.total_quantity + log/alerta (reconciliação ou fallback)

7. NÃO implementar ainda: envio de reservas ao galpão, webhooks do galpão,
   movimentação automática de Trello, alteração destrutiva em total_quantity.

Objetivo: BRT consulta estoque real por data e usa real_stock_available na decisão
de conflito/sublocação, com fallback seguro. Ligar a decisão automática só após o
relatório name-diff estar limpo.
```

---

## 5. FLUXO 2 — Reservas do BRT Desenrola para o galpão

Quando o BRT Desenrola cria/atualiza reservas de um evento (`equipment_reservations`), ele pode informar o galpão para que o `commitments_on_date` do galpão fique correto.

Endpoint do galpão (já existe):

```
POST {ESTOQUE_API_BASE_URL}/api/eventos/{event_id}/add-item
Header: x-api-key: <API_KEY>          # ver observação de segurança abaixo
Body: { "nome": "CAIXA ATIVA QSC K12", "quantidade": 2 }
```

Gatilho sugerido do seu lado: após persistir as reservas em `repo_list_event_reservations` / mudança de status para confirmado. Enviar um item por reserva (ou em lote, se preferir criar um endpoint batch no galpão).

> **Segurança:** hoje, no galpão, `/api/eventos/:id/add-item` **ainda não exige** `x-api-key` (só os `/api/v1/public/*` exigem). Antes de usar em produção, o time do galpão vai proteger esse endpoint com o mesmo middleware `apiKeyAuth`. Já assuma o header no seu client.

---

## 6. FLUXO 3 — Webhooks do galpão para o BRT Desenrola

O galpão dispara POST JSON quando um evento muda de estado físico. Você expõe um endpoint receptor e o registra em `config/webhooks.json` do galpão.

Endpoint receptor sugerido (do seu lado, FastAPI):

```
POST /webhook/estoque        (seguindo o padrão dos seus outros webhooks em /webhook/*)
```

Eventos e payload:

| Evento | Quando |
| :-- | :-- |
| `event.dispatched` | Tudo separado e despachado do galpão |
| `event.returned` | Retorno completo |
| `event.pending` | Retorno parcial (faltaram itens) |

```json
{
  "event": "event.returned",
  "timestamp": "2026-07-10T19:30:00.000Z",
  "data": {
    "eventId": "593",
    "eventName": "Show Exemplo",
    "status": "returned",
    "separatedItems": []
  },
  "delta": { "expected": 50, "returned": 50, "missing": 0, "items_missing": [] }
}
```

Ações sugeridas no BRT Desenrola ao receber:

- `event.dispatched` → mover card para lista **08 (Conferido/Carregar)** ou **09 (Em montagem)**; atualizar `EquipmentReservation.status`.
- `event.returned` → mover para **10 (Retorno/Conferência)** / **12 (Concluído)**.
- `event.pending` → criar pendência / alerta WhatsApp com `delta.items_missing`.

O galpão faz retry com backoff (3x). Responda `200` rápido e processe async.

---

## 7. O ponto crítico: casamento de nomes

Os dois lados identificam equipamento por **nome normalizado**, não por ID compartilhado.

- Galpão normaliza assim: `lower().trim()` + colapsa espaços.
- BRT Desenrola já tem `equipment_aliases` (`normalized_alias`, criado no passo 88B.2) para resolver variações do MeEventos.

Recomendação: **usar a tabela `equipment_aliases` como camada única de reconciliação** entre MeEventos ↔ BRT ↔ galpão. Ao consumir `/stock`, resolva `item.name` do galpão para o `equipment_stock` correto via alias. Ideal a médio prazo: o galpão também expõe `equipment_id_meeventos` por item para casar por ID em vez de nome (fica como pedido de evolução para o galpão).

Sem isso, itens com nome divergente vão parecer "sem estoque" e gerar sublocação falsa (ou o contrário). Vale um relatório de divergências de nome como primeiro teste.

---

## 8. Referência rápida da API do galpão

| Método | Endpoint | Auth | Uso |
| :-- | :-- | :-- | :-- |
| GET | `/api/ping` | não | Health check |
| GET | `/api/v1/public/stock?date=YYYY-MM-DD` | sim | **Fluxo 1** — disponibilidade real |
| GET | `/api/v1/public/events/{eventId}` | sim | Status de separação/devolução |
| GET | `/api/v1/public/pendencies` | sim | Pendências (itens faltantes) |
| POST | `/api/eventos/{id}/add-item` | (será) sim | **Fluxo 2** — informar reserva |

Spec OpenAPI completa: `openapi.yaml` (no repo do galpão).

---

## 9. Decisões que preciso de você (dev BRT Desenrola)

1. **Fluxo 1: Opção A (tempo real por data, com cache) — recomendada.** A Opção B (sync sobrescrevendo `total_quantity`) foi descartada por quebrar eventos futuros. Confirmar TTL do cache (`ESTOQUE_CACHE_TTL_SECONDS`, sugerido 300s).
2. **Gate:** concorda em só ligar a decisão automática após o `name-diff` limpo?
3. **Fluxo 2:** dispara em qual status da reserva? (`pre_reserved`, confirmado, ambos?)
4. **Fluxo 3:** confirma o path `/webhook/estoque` e o mapeamento evento→lista do Trello.
5. **Matching:** topa usar `equipment_aliases` como fonte única? Precisa que o galpão exponha `equipment_id_meeventos`?

---

## 10. Checklist de implementação (BRT Desenrola)

- [ ] Adicionar `ESTOQUE_API_BASE_URL` e `ESTOQUE_API_KEY` nas variáveis (Railway).
- [ ] Criar client HTTP para `/api/v1/public/stock` com cache por data.
- [ ] Fluxo 1: adaptar `check_equipment_conflicts` (Opção A) **ou** criar job no `scheduler.py` (Opção B).
- [ ] Camada de resolução de nome via `equipment_aliases`.
- [ ] Fluxo 2: enviar reservas ao galpão no gatilho de status escolhido.
- [ ] Fluxo 3: endpoint `POST /webhook/estoque` + mapeamento de status/Trello.
- [ ] Teste de ponta a ponta com 1 evento real e relatório de divergência de nomes.

## 11. WhatsApp + IA + Resumos (Cloud API oficial, vive SÓ no BRT Desenrola)

**Decisão (atualizada):** os resumos vão para **pessoas (números individuais) via WhatsApp Cloud API oficial** — **sem** a ponte QR. Mais robusto, sem Chromium no Railway e sem risco de bloqueio do número. A camada de WhatsApp/IA fica **só no BRT Desenrola**; o WhatsApp do galpão fica **desligado** (`ENABLE_WHATSAPP=false`).

> Por que não grupo? A Cloud API oficial **não envia nem lê mensagens de grupo** (só `recipient_type: individual`). Postar em grupo exigiria a ponte QR (whatsapp-web.js), que foi descartada. Se um dia o grupo virar requisito, reabrir a discussão da ponte QR.

### 11.1 O que já existe (nada a criar do zero)

- **Envio oficial:** `app/whatsapp_client.py::WhatsAppClient.send_text(to_phone, body, category)` já fala com `graph.facebook.com/.../messages`. Aceita **um número, uma lista ou string separada por vírgula/;** — ou seja, já manda para vários destinatários.
- **IA + resumos:** `ai_client.py`, `conversation_ai.py`, `command_router.py` e os handlers `daily_summary`, `weekly_summary`, `events_summary`, `budgets_summary`. "Gerar resumo" já é função nativa.

### 11.2 Como ligar

1. Definir os destinatários (números da equipe), ex.: variável `SUMMARY_RECIPIENTS="5511999999999,5511888888888"`.
2. Job no `app/scheduler.py` (APScheduler já existe): gera o resumo (`daily_summary`/`events_summary`) e chama `whatsapp_client.send_text(SUMMARY_RECIPIENTS, body, category="daily_summary")`.
3. Enriquecer o resumo com estoque/faltas puxando o **Fluxo 1** (`/api/v1/public/stock`) do galpão.
4. Confirmar que já estão setados: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BASE_URL`, `WHATSAPP_API_VERSION`.

### 11.3 Atenção: janela de 24h e templates (Cloud API)

A Cloud API só permite **mensagem livre** para um número dentro de **24h** após esse número ter mandado mensagem para o business. Para **resumo proativo** (a pessoa não mandou nada antes), é preciso usar um **template aprovado** (categoria utility) — senão a Meta bloqueia o envio fora da janela.

- **Caminho recomendado:** registrar um template de resumo (ex.: um corpo com variáveis) e enviar por template. Alinhar isso com quem administra a conta do WhatsApp Business.
- Alternativa: se a equipe interage com o bot regularmente (mantém a janela aberta), o texto livre funciona — mas é menos confiável para agendado.

Este é o único ponto que precisa de preparação extra nesse fluxo.

---

## 12. Pendências do lado do galpão (o outro time cuida)

- [ ] Proteger `/api/eventos/:id/add-item` (e demais escritas) com `apiKeyAuth`.
- [ ] Restringir CORS ao domínio do BRT Desenrola.
- [ ] Persistência em volume/DB no Railway (hoje os dados vivem em JSON efêmero).
- [ ] (Evolução) expor `equipment_id_meeventos` por item no `/stock`.
