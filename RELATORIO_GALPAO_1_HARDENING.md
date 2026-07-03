# Relatório — GALPÃO.1 (hardening seguro do serviço Galpão)

Executado localmente na cópia do Mac. **Sem commit, sem deploy, sem `git add`.**

---

## 1. Arquivos alterados/criados

| Arquivo | Ação |
| :-- | :-- |
| `.dockerignore` | **criado** — impede segredos/logs/node_modules na imagem |
| `server.js` | **editado** — API_KEY sem fallback + só header x-api-key + 503 se não configurada |

Nenhuma rota do dashboard foi alterada. Nenhuma decisão de negócio foi tocada.

## 2. Correção da API_KEY (Tarefa 2) — trecho

Antes:
```js
key: process.env.API_KEY || 'brt-secret-key-123',
```
Depois:
```js
key: process.env.API_KEY || null,
// ...
if (!API_CONFIG.key) {
    return res.status(503).json({ error: 'Servidor sem API_KEY configurada. Defina API_KEY no ambiente.' });
}
```
Sem chave padrão. Se `API_KEY` não existir, os endpoints públicos recusam com **503** (erro de configuração, não 200 inseguro).

## 3. Correção do x-api-key (Tarefa 3) — trecho

Antes:
```js
const key = req.headers[API_CONFIG.header] || req.query.key; // Header OU Query Param
```
Depois:
```js
const key = req.headers[API_CONFIG.header]; // Apenas header — ?key= não é mais aceito
```
`?key=` deixa de funcionar (não vaza mais chave em logs/URL). Só `x-api-key` correto passa.

## 4. .dockerignore (Tarefa 1)

```
.env
.env.*
google-cloud-key.json
data/access_keys.json
node_modules/
.wwebjs_auth*/
.wwebjs_cache/
logs/
public/charts/
dist/
*.mp3
*.tar.gz
*.zip
*.exe
*.backup
.DS_Store
._*
.vscode/
.git/
```

## 5. Validações locais (Tarefas 9) — resultados reais

`node --check server.js` → **OK**.

Servidor subido com `API_KEY=test-secret ENABLE_WHATSAPP=false`:

| Teste | Esperado | Obtido |
| :-- | :-- | :-- |
| `GET /api/ping` | 200 | **200** ✅ |
| `GET /stock` sem key | 401 | **401** ✅ |
| `GET /stock?key=test-secret` | 401 | **401** ✅ |
| `GET /stock` com `x-api-key: errado` | 401 | **401** ✅ |
| `GET /stock` com `x-api-key: test-secret` | 200 | **200** ✅ |

Servidor subido **sem** `API_KEY`:

| Teste | Esperado | Obtido |
| :-- | :-- | :-- |
| `GET /stock` (público) | 503 config | **503** ✅ |
| `GET /api/stats` (dashboard) | 200 sem chave | **200** ✅ |
| `GET /api/eventos` (dashboard) | 200 sem chave | **200** ✅ |

→ **O dashboard não foi afetado.** Só os `/api/v1/public/*` exigem chave.

## 6. Docker build (Tarefa 10)

Docker **não está disponível** neste ambiente. Comandos para o dev rodar localmente:
```bash
docker build -f Dockerfile.railway -t galpao-estoque-test .
docker run --rm galpao-estoque-test sh -lc 'ls -la | grep -E ".env|google-cloud-key|logs|tar.gz|zip|mp3|wwebjs" || true'
```
Esperado (com o `.dockerignore` criado): **nenhum** desses arquivos aparece na imagem.

## 7. Mapa de rotas (Tarefa 5)

### A) Públicas / read-only (externas, já protegidas com x-api-key)
`/api/v1/public/stock`, `/api/v1/public/events/:eventId`, `/api/v1/public/pendencies`. Health: `/api/ping` (aberto, correto).

### B) Rotas usadas pelo DASHBOARD (frontend chama SEM chave — não proteger às cegas)
`/api/chat`, `/api/tts`, `/api/verify-access`, `/api/stats`, `/api/eventos`, `/api/eventos/:id/add-item`, `/api/eventos/:id/sync`, `/api/inventario`, `/api/inventario/item`, `/api/inventario/item/update-barcodes`, `/api/inventario/export-codes`, `/api/qr-units` (GET/POST), `/api/qr-units/delete`, `/api/event-separations`, `/api/separations/completed`, `/api/separations/pendencies`, `/api/tick-progress/:id` (GET/POST), `/api/dashboard/messages` (GET/POST/DELETE), `/api/export-qr-codes`, `/api/sync-inventory`, `/api/sync-events`, **`/api/transfer-item`**.

### C) Rotas de escrita NÃO usadas pelo frontend (candidatas a proteção externa)
`/api/kira/create-event`, `/api/kira/add-items-to-event`, `/api/jira/mark-returns`, `/api/conversations`.

### D) Sensíveis (escrita/movimentação — subconjunto de B e C)
Movimentam estoque/eventos: `tick-progress` (dispara webhooks), `transfer-item`, `qr-units`/`qr-units/delete`, `inventario/item*`, `event-separations`, `kira/*`, `eventos/:id/*`, `sync-*`.

> Confirmação importante: **`/api/transfer-item` e `/api/eventos/:id/...` são usados pelo dashboard.** Protegê-los com `apiKeyAuth` agora **quebraria a interface**.

## 8. Proposta de proteção das rotas de escrita (sem quebrar o dashboard)

Recomendação (Estratégia 3+4): **não** proteger as rotas internas do dashboard agora. Em vez disso, quando o BRT precisar escrever (Fluxo 2), expor **endpoints externos dedicados sob `/api/v1/public/*` com `apiKeyAuth`**, por exemplo `POST /api/v1/public/reservations`, deixando as rotas internas do dashboard intactas.

Vantagens: superfície externa única e autenticada; dashboard não muda; fácil de auditar. As rotas C (`/api/kira/*`, `/api/jira/*`, `/api/conversations`) que **não** são usadas pelo frontend podem receber `apiKeyAuth` já numa próxima passada, se confirmarmos que nada interno as chama.

Descartadas por ora: proteger tudo (quebra dashboard); confiar em same-origin via Origin/Referer (burlável, frágil).

## 9. CORS (Tarefa 6)

Hoje: `app.use(cors())` — **aberto a qualquer origem**. Risco: qualquer site pode chamar a API do navegador. Proposta para produção (aplicar quando os domínios estiverem definidos):
```js
app.use(cors({ origin: [
  'https://<dominio-galpao>.up.railway.app',
  'https://<dominio-brt>.up.railway.app',
  'https://<dominio-proprio-brt>'
]}));
```
Não apliquei porque **depende dos domínios finais** e o dashboard local precisa continuar funcionando. Fica como item de GALPÃO.2/produção.

## 10. Railway readiness (Tarefa 7)

- `PORT` → `process.env.PORT || 3000` ✅
- `app.listen(PORT, '0.0.0.0', ...)` ✅
- `railway.json` → `Dockerfile.railway` ✅ (healthcheck `/api/ping`)
- `Dockerfile.railway` → `ENV ENABLE_WHATSAPP=false` + `CMD ["node","server.js"]` ✅
- Não definir `PORT` manualmente no Railway ✅

## 11. Volume de dados (Tarefa 8)

`/api/v1/public/stock` depende de `logs/inventory_complete.json`, `logs/qr_units.json`, `logs/cache_equipamentos/`. Como `logs/` não entra no git nem na imagem:

- **Comportamento atual quando o arquivo não existe:** o código faz `if (!fs.existsSync(inventoryPath)) return res.json({ items: [] });` → retorna **lista vazia, sem 500**. É um erro controlado (não quebra), mas silencioso.
- **Ação no Railway:** montar **Volume em `/app/logs`** e semear `inventory_complete.json`, `qr_units.json`, `cache_equipamentos/`. Sem isso, `/stock` responde vazio.

## 12. Riscos restantes

1. **Rotas de escrita internas ainda abertas** (por design, para não quebrar o dashboard). Endereçar via namespace externo autenticado (Seção 8) na fase de escrita.
2. **CORS aberto** até definirmos domínios (Seção 9).
3. **Volume não populado** → `/stock` vazio silencioso (Seção 11).
4. Segredos que estavam em disco (`.env`, `google-cloud-key.json`) devem ser **rotacionados** antes do deploy.

## 13. Recomendação

**Pode seguir para GALPÃO.2 (deploy Railway)** com as condições:
- rotacionar segredos;
- configurar `API_KEY` forte + `ENABLE_WHATSAPP=false` nas Variables;
- montar Volume em `/app/logs` e semear os dados;
- CORS restrito e proteção das rotas externas de escrita entram como itens acompanhados (não bloqueiam o primeiro deploy, que é read-only autenticado).
