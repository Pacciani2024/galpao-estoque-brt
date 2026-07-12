# 📦 BRT Galpão — API de Dados via GitHub

> Documentação do sistema de sincronização entre o PC do Galpão e o App do Vendedor.  
> Atualizado automaticamente a cada 15 minutos pelo servidor do galpão.

---

## 🗂️ Estrutura do Repositório

```
Galpao/
├── dados/
│   └── estoque.json          ← Catálogo completo com preços
├── eventos/
│   └── ativos.json           ← Eventos próximos com itens e pendências
├── saidas/
│   └── despachados.json      ← Eventos que saíram para a rua
└── pedidos/
    └── [arquivos do vendedor] ← EXCLUSIVO do vendedor. O galpão só lê.
```

---

## 📄 `dados/estoque.json` — Catálogo com Preços

### Acesso
```
GET https://api.github.com/repos/BRT-STUDIO01/Galpao/contents/dados/estoque.json
Authorization: Bearer SEU_TOKEN
```

```javascript
// Decodificar resposta (campo content é Base64)
const res  = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
const data = await res.json();
const json = JSON.parse(atob(data.content));
```

### Estrutura
```json
{
  "atualizado": "2026-02-19T17:21:47Z",
  "totalItens": 489,
  "totalProprios": 388,
  "totalSublocacao": 101,
  "itens": []
}
```

### Campos de cada item
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | ID no MeEventos |
| `nome` | string | Nome do item |
| `categoria` | string | `SONORIZAÇÃO`, `ILUMINAÇÃO`, `INSUMOS`, etc. |
| `marca` | string | Marca |
| `modelo` | string | Modelo |
| `tipo` | `"proprio"` \| `"sublocacao"` | **proprio** = estoque > 0 / **sublocacao** = estoque 0 |
| `disponivel` | number | Quantidade no galpão (`0` para sublocação) |
| `precoVenda` | number | Preço de locação em reais (ponto decimal) |
| `descricao` | string | Descrição técnica |

```javascript
// Filtros recomendados
const proprios   = itens.filter(i => i.tipo === 'proprio');
const sublocacao = itens.filter(i => i.tipo === 'sublocacao');
const som        = itens.filter(i => i.categoria === 'SONORIZAÇÃO');
```

---

## 📅 `eventos/ativos.json` — Eventos Próximos

Lista de eventos agendados com todos os itens necessários e o status de separação do galpão.

### Estrutura
```json
{
  "atualizado": "2026-02-19T17:21:47Z",
  "totalEventos": 6,
  "eventos": []
}
```

### Campos de cada evento
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | ID do evento |
| `nome` | string | Nome do evento |
| `cliente` | string | Nome do cliente |
| `dataEvento` | string | Data (`AAAA-MM-DD`) |
| `horaEvento` | string | Hora (`HH:MM:SS`) |
| `local` | string | Nome do local |
| `cidade` / `estado` | string | Localização |
| `endereco` | string | Endereço completo |
| `tipo` | string | Tipo de evento (Social, Corporativo, etc.) |
| `datasAdicionais` | array \| null | Datas extras (montagem, desmontagem) |
| `totalItens` | number | Total de equipamentos no evento |
| `itensSeparados` | number | Qtd já confirmada pelo galpão |
| `itensPendentes` | number | Qtd ainda não separada |
| `percentualSeparacao` | number | `0` a `100` |
| `statusSeparacao` | string | `nao_iniciado`, `in_progress`, `dispatched` |
| `equipamentos` | array | Lista detalhada (ver abaixo) |

### Campos de cada item em `equipamentos[]`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome do equipamento |
| `categoria` | string | Categoria |
| `quantidade` | number | Qtd necessária para o evento |
| `separado` | number | Qtd já separada pelo galpão |
| `pendente` | number | Qtd que ainda falta separar |
| `ok` | boolean | `true` se 100% separado |

---

## 🚚 `saidas/despachados.json` — Eventos na Rua

Eventos que já saíram do galpão, com status de devolução.

### Estrutura
```json
{
  "atualizado": "2026-02-19T17:21:47Z",
  "totalDespachadados": 3,
  "eventos": []
}
```

### Campos de cada evento
| Campo | Tipo | Descrição |
|---|---|---|
| `eventId` | string | ID do evento |
| `nomeEvento` | string | Nome do evento |
| `status` | string | `dispatched`, `returned_partial`, `returned`, `completed` |
| `dataEvento` | string | Data do último update |
| `totalItens` | number | Total de itens planejados |
| `itensSeparados` | number | Itens efetivamente separados |
| `percentual` | number | `0` a `100` |
| `itens` | array | `[{ nome, quantidade }]` |

### Status possíveis
| Status | Significado |
|---|---|
| `dispatched` | Material saiu, ainda não voltou |
| `returned_partial` | Parte voltou, ainda tem itens na rua |
| `returned` | Tudo devolvido ao galpão |
| `completed` | Encerrado |

---

## 📬 `pedidos/` — Orçamentos dos Vendedores

Pasta **exclusiva dos vendedores**. O galpão **não escreve** aqui — apenas lê para processar pedidos.

### Formato do arquivo de pedido
Cada vendedor cria um arquivo `pedido_[tag]_[timestamp].json`:

```json
{
  "vendedor":    "vi",
  "nomeVendedor": "Vinicius",
  "criadoEm":   "2026-02-19T17:00:00Z",
  "evento": {
    "nome":          "Nome do Evento",
    "cliente":       "Nome do Cliente",
    "dataMontagem":  "2026-03-10",
    "dataOperacao":  "2026-03-11",
    "dataDesmontagem": "2026-03-12",
    "local":         "Local do Evento",
    "cidade":        "São Paulo",
    "estado":        "SP"
  },
  "itens": [
    { "id": "2", "nome": "CAIXA ATIVA QSC K12", "quantidade": 2, "precoUnitario": 250.00 }
  ],
  "totalEstimado": 500.00,
  "observacoes": ""
}
```

---

## ⚙️ Frequência de Atualização

| Quando | Ação |
|---|---|
| 30s após startup do servidor | Primeiro sync a cada reinício |
| **A cada 15 minutos** | Sync automático das 3 pastas |

---

## 🔐 Segurança

- Repositório **privado** — nenhum dado fica público
- O `GITHUB_TOKEN` fica apenas no `.env` do PC do galpão
- O App do vendedor deve usar um **token separado** com permissão `contents:read` para leitura e `contents:write` apenas em `pedidos/`
