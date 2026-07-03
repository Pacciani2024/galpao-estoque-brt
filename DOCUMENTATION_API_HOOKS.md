# 📚 Documentação da API e Sistema de Hooks

Este documento descreve a funcionalidade da API REST do servidor (`server.js`) e do sistema de Webhooks/Eventos (`webhookService.js`), explicando o que cada parte faz e como interagir com elas.

---

## 🔗 Sistema de Webhooks (Eventos Automáticos)

O sistema possui um mecanismo de "Reação Automática" que monitora o status dos eventos. Quando algo importante acontece (ex: um caminhão sai para entrega ou volta), o sistema "avisa" outros sistemas externos.

### 🎯 Como funciona?

1. O usuário salva o progresso de separação/devolução no Frontend.
2. O servidor detecta a mudança de status (ex: de "Em Separação" para "Despachado").
3. O servidor consulta `config/webhooks.json` para ver quem quer receber esse aviso.
4. O servidor envia um POST HTTP (JSON) para as URLs configuradas.

### 📢 Eventos Disponíveis

| Evento | Descrição | Gatilho |
| :--- | :--- | :--- |
| **`event.dispatched`** | **Saída de Evento**. Todos os itens foram separados e o check-out foi finalizado. | Status muda para `dispatched`. |
| **`event.returned`** | **Retorno Completo**. Todos os itens voltaram do evento para o estoque. | Status muda para `returned`. |
| **`event.pending`** | **Retorno Parcial/Pendência**. O evento voltou, mas alguns itens faltaram ou foram extraviados. | Status muda para `returned_partial`. |

### 📦 Formato dos Dados (Payload)

Quando um evento ocorre, o sistema envia o seguinte JSON para o Webhook:

```json
{
  "event": "event.returned",
  "timestamp": "2024-02-11T19:30:00.000Z",
  "data": {
    "eventId": "593",
    "eventName": "Show Exemplo",
    "status": "returned",
    "separatedItems": [ ... lista de itens ... ]
  },
  "delta": {
    "expected": 50,
    "returned": 50,
    "missing": 0,
    "items_missing": []
  }
}
```

> **Nota:** O campo `delta` só é enviado em eventos de retorno (`returned` ou `pending`) para indicar se houve perdas.

### 📡 Broadcast UDP (Smart Discovery)

Além dos Webhooks HTTP, o sistema envia um pacote UDP na rede local (Broadcast) avisando sobre a mudança de status. Isso permite que painéis de LED ou automações locais reajam instantaneamente sem configuração de URL.

---

## 🛠️ Referência da API (Endpoints)

A API REST roda na porta **3000** e serve tanto o Frontend quanto integrações externas.

### 📦 Gestão de Inventário

| Método | Endpoint | Função |
| :--- | :--- | :--- |
| Método | Endpoint | Função |
| :--- | :--- | :--- |
| `GET` | `/api/inventario` | Retorna o **inventário completo**. (Nota: Valores de custo/venda são omitidos aqui por privacidade). |
| `GET` | `/api/v1/public/stock` | **API Pública (Softer)**: Retorna estoque com valores (`value`) e suporte a consulta por data (`?date=YYYY-MM-DD`). |
| `POST` | `/api/inventario/item` | Cadastra um **novo item** no sistema. |
| `POST` | `/api/inventario/item/update-barcodes` | Vincula **Códigos de Barras (EAN)** ou Lotes a um item existente. Permite definir quantidade por lote. |
| `GET` | `/api/qr-units` | Lista todas as **Unidades Únicas (QR Codes)** e seus status (`disponivel`, `em_uso`, `manutencao`). |
| `POST` | `/api/qr-units` | Atualiza o status/log de manutenção de uma unidade QR específica. |
| `GET` | `/api/inventario/export-codes` | **Backup**: Gera um arquivo CSV com todos os códigos EAN e QR vinculados para importação. |
| `POST` | `/api/sync-inventory` | Força uma sincronização manual do inventário (executa script externo). |

### 🔒 API Pública (Integração Externa)

Endpoint criado especificamente para integração com plataformas como **Softr** ou APIs de terceiros.

| Método | Endpoint | Parâmetros | Função |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/public/stock` | `key`, `date` | Consulta disponibilidade real considerando reservas em eventos. |

#### 📅 Disponibilidade por Data

Ao passar o parâmetro `?date=YYYY-MM-DD`, o sistema:

1. Carrega todos os eventos agendados.
2. Soma os itens já reservados para aquela data específica.
3. Retorna a disponibilidade real (Físico - Manutenção - Reservas).

#### 📦 Exemplo de Resposta (JSON)

```json
{
  "timestamp": "2026-02-12T01:34:24.021Z",
  "date_queried": "current",
  "total_items": 482,
  "data": [
    {
      "id": "2",
      "name": "CAIXA ATIVA QSC K12",
      "category": "SONORIZAÇÃO",
      "total_stock": 6,
      "real_stock_available": 4,
      "maintenance": 0,
      "commitments_on_date": 0,
      "value": "250,00",
      "units_detail": [
        { "qr_code": "000004", "status": "disponivel", "last_event": null },
        { "qr_code": "000005", "status": "disponivel", "last_event": null }
      ]
    }
  ]
}
```

> **Dica**: Use o parâmetro `&date=YYYY-MM-DD` para obter a disponibilidade real em uma data futura. Sem este parâmetro, o sistema assume a disponibilidade física atual.

---

## 🗓️ Logística de Eventos

| Método | Endpoint | Função |
| :--- | :--- | :--- |
| `GET` | `/api/eventos` | Lista os **próximos eventos**. Mescla dados da API externa (MeEventos) com o cache local de equipamentos e status de separação. |
| `POST` | `/api/eventos/:id/sync` | **Manual Sync**: Força o Scraper a buscar os dados atualizados de um evento específico. (Botão "Atualizar"). |
| `POST` | `/api/sync-events` | Força a atualização de TODOS os eventos. |
| `GET` | `/api/tick-progress/:id` | Retorna o progresso atual da separação/devolução de um evento. |
| `POST` | `/api/tick-progress/:id` | **Salva o progresso** da separação. **É aqui que os Webhooks são disparados** se o status mudar. |
| `POST` | `/api/transfer-item` | **Cross-docking**: Transfere itens de um evento (origem) direto para outro (destino) sem passar pelo estoque "Disponível". |

### 🤖 Mark AI (Assistente)

| Método | Endpoint | Função |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Envia uma mensagem para o Mark. Ele tem acesso aos dados do inventário e eventos para responder contextualmente. |
| `POST` | `/api/tts` | **Text-to-Speech**: Gera áudio da resposta do Mark usando Google Cloud TTS. |
| `GET` | `/api/mark-context` | Fornece um "resumo do mundo" para o Mark (últimas ações, status do estoque) para ele saber o que está acontecendo. |
| `POST` | `/api/conversations` | Salva o histórico da conversa para aprendizado/contexto futuro. |

### 📊 Monitoramento e Stats

| Método | Endpoint | Função |
| :--- | :--- | :--- |
| `GET` | `/api/stats` | Retorna os números para o **Dashboard Principal** (Total Itens, Em Uso, Manutenção, Disponível). |
| `GET` | `/api/ping` | Teste de conectividade (Heartbeat). |
| `GET` | `/monitor` | Acessa a página de monitoramento do servidor. |

---

## 📂 Estrutura de Arquivos Relevante

- **`server.js`**: Ponto de entrada da API e definição das rotas.
- **`services/webhookService.js`**: Lógica de disparo e retentativa dos Webhooks.
- **`config/webhooks.json`**: Lista de URLs que receberão os eventos.
- **`logs/tick_progress/`**: Onde o estado de cada evento é salvo (JSON).
- **`logs/qr_units.json`**: Banco de dados das unidades únicas (QR Codes).
- **`logs/inventory_complete.json`**: Banco de dados do inventário geral.
