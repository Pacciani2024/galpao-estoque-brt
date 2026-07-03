# Integração: MeEventos ↔ Controle de Estoque ↔ BRT Desenrola

Este documento descreve como os três sistemas conversam e qual é o contrato
estável que o **brt desenrola** deve usar para se conectar ao Controle de Estoque.

---

## 1. Visão geral da arquitetura

```
        ┌──────────────┐   scraping + API     ┌────────────────────────┐
        │  MeEventos    │◀────────────────────▶│  Controle de Estoque    │
        │  (eventos)    │   (Puppeteer/token)  │  (backend Node/Express) │
        └──────────────┘                       │  Railway                │
                                               └───────────┬────────────┘
                                                           │
                                    API pública (x-api-key)│  Webhooks (push)
                                                           ▼
                                               ┌────────────────────────┐
                                               │      BRT Desenrola       │
                                               │  (seu outro sistema)     │
                                               └────────────────────────┘
```

- **MeEventos → Estoque**: o estoque puxa eventos e equipamentos do MeEventos
  (via API oficial `modules/api.js` + scraping `modules/scraper_cookie.js`).
  Essa parte já funciona e não precisa mudar.
- **Estoque → BRT Desenrola**: duas formas complementares:
  1. **Pull (o brt desenrola consulta)** — API REST `/api/v1/public/*`.
  2. **Push (o estoque avisa)** — Webhooks quando um evento sai/volta.
- **BRT Desenrola → Estoque**: chamadas de escrita para criar eventos,
  adicionar itens e transferir equipamentos (ver seção 4).

---

## 2. Autenticação

Toda a API pública usa uma chave única definida na variável de ambiente
`API_KEY` (configurada no Railway).

Envie em **todas** as chamadas, de uma das formas:

```
x-api-key: SUA_CHAVE        (header — recomendado)
?key=SUA_CHAVE              (query param — alternativa)
```

Resposta a chave inválida/ausente: `401 { "error": "Acesso Negado..." }`.

> Gere a chave com `openssl rand -hex 32` e guarde-a como segredo nos dois lados.

---

## 3. Leitura (BRT Desenrola consulta o Estoque) — PULL

| Método | Endpoint | Uso |
| :-- | :-- | :-- |
| GET | `/api/v1/public/stock?date=YYYY-MM-DD` | Disponibilidade real por data (desconta reservas de eventos). |
| GET | `/api/v1/public/events/:eventId` | Status de separação/devolução de um evento. |
| GET | `/api/v1/public/pendencies` | Itens que faltaram no retorno (pendências). |
| GET | `/api/ping` | Health check. |

Exemplo:

```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://SEU-BACKEND.up.railway.app/api/v1/public/stock?date=2026-07-10"
```

Campos principais de `stock`: `real_stock_available` (o que importa para
reservar), `commitments_on_date`, `maintenance`, `units_detail[]` (QR + status).

A especificação completa está em [`openapi.yaml`](./openapi.yaml).

---

## 4. Escrita (BRT Desenrola grava no Estoque) — PUSH

Estes endpoints já existem no `server.js` e permitem o fluxo bidirecional que
você pediu. **Recomendação:** proteja-os com a mesma `x-api-key` antes de expor
publicamente (hoje alguns estão sem auth — ver seção 6).

| Método | Endpoint | Função |
| :-- | :-- | :-- |
| POST | `/api/kira/create-event` | Cria um evento no estoque. |
| POST | `/api/kira/add-items-to-event` | Adiciona itens a um evento. |
| POST | `/api/eventos/:id/add-item` | Adiciona um item (nome + quantidade) a um evento. |
| POST | `/api/transfer-item` | Cross-docking: transfere item de um evento para outro. |
| POST | `/api/eventos/:id/sync` | Força sincronização (scraper) de um evento. |
| POST | `/api/inventario/item` | Cadastra novo item no inventário. |

Exemplo (adicionar item a um evento):

```bash
curl -X POST -H "x-api-key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"nome":"CAIXA ATIVA QSC K12","quantidade":2}' \
  "https://SEU-BACKEND.up.railway.app/api/eventos/593/add-item"
```

---

## 5. Notificações automáticas (Estoque avisa o BRT Desenrola) — WEBHOOKS

Configure a URL do brt desenrola em `config/webhooks.json`:

```json
{
  "webhooks": [
    {
      "url": "https://brt-desenrola.up.railway.app/webhooks/estoque",
      "events": ["event.dispatched", "event.returned", "event.pending"]
    }
  ]
}
```

Eventos disponíveis:

| Evento | Quando dispara |
| :-- | :-- |
| `event.dispatched` | Todos os itens separados e evento despachado. |
| `event.returned` | Retorno completo ao estoque. |
| `event.pending` | Retorno parcial (faltaram itens). |

Payload recebido pelo brt desenrola (POST JSON):

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

O envio tem retry com backoff exponencial (3 tentativas). Falhas ficam em
`logs/webhooks_error.log`.

> **Dica:** para confirmar recebimento, seu endpoint deve responder `200`
> rapidamente e processar de forma assíncrona.

---

## 6. Ajustes recomendados antes de produção

1. **Proteger endpoints de escrita** com `apiKeyAuth` (hoje `/api/eventos/:id/add-item`,
   `/api/transfer-item` etc. estão abertos).
2. **CORS**: hoje está liberado para todos (`app.use(cors())`). Restrinja ao
   domínio do frontend (Vercel) e ao brt desenrola.
3. **Persistência**: os dados vivem em arquivos JSON em `logs/`. O filesystem do
   Railway é **efêmero** — a cada redeploy os dados somem. Use um **Volume do
   Railway** montado em `logs/` ou migre para um banco (Postgres). Ver o guia de
   deploy.
4. **Segredos**: rotacione as chaves que estavam commitadas (MeEventos, Gemini,
   GitHub, Google Cloud) e mantenha só nas variáveis do Railway.
