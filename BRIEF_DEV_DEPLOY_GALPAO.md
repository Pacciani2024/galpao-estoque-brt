# Brief para o dev — Subir o Galpão (Controle de Estoque) no Railway

Contexto: precisamos colocar o **Controle de Estoque do galpão** (Node/Express) como um serviço novo **no mesmo projeto Railway do BRT Desenrola**, para o BRT consumir a disponibilidade real por data. O código já foi ajustado e **validado localmente** (server.js passa no `node --check`, `/api/ping` e `/api/v1/public/stock` respondendo com dados reais).

Você cuida do GitHub + Railway (você já tem esse pipeline). Abaixo o passo a passo e os cuidados.

---

## 1. Antes do push — segredos

- O `.gitignore` já ignora `.env`, `google-cloud-key.json`, `node_modules/`, `.wwebjs_auth/`, `logs/`, `dist/`, `*.tar.gz/.zip/.exe`. **Confirme** que nada disso vai no commit.
- **Rotacione** as chaves que estavam no `.env`/`google-cloud-key.json` (MeEventos, Gemini, GitHub, Google Cloud) — elas ficaram expostas em disco. Vão só nas variáveis do Railway.

## 2. Git + GitHub

```bash
cd "<pasta do galpão>"
git init
git add .
git commit -m "chore: deploy inicial galpão (Railway-ready)"
git branch -M main
git remote add origin git@github.com:<org>/<repo-galpao>.git
git push -u origin main
```

## 3. Criar o serviço no Railway

- No **projeto do BRT Desenrola** → New → Service → Deploy from GitHub → repo do galpão.
- O `railway.json` já aponta para **`Dockerfile.railway`** (imagem enxuta, roda só `node server.js`; WhatsApp/voz off). Healthcheck em `/api/ping`.

## 4. Variáveis (aba Variables do serviço do galpão)

```
API_KEY=<API_KEY_FORTE — gere com: openssl rand -hex 32 e envie por canal seguro>
ENABLE_WHATSAPP=false
MEEVENTOS_API_KEY=<chave>
MEEVENTOS_BASE_URL=https://app1.meeventos.com.br/brt/api/v1
MEEVENTOS_USUARIO=<usuario>
MEEVENTOS_SENHA=<senha>
GEMINI_API_KEY=<opcional>
```
Não defina `PORT` — o Railway injeta e o código já usa `process.env.PORT`.
> `API_KEY` é segredo. Se preferir, gere outra (`openssl rand -hex 32`) — só precisa ser a mesma nos dois lados.

## 5. Volume + dados iniciais (CRÍTICO)

O `/stock` lê de `logs/inventory_complete.json` e `logs/qr_units.json`. Como `logs/` está no `.gitignore`, esses arquivos **não vão no push**. Então:

1. Settings → Volumes → montar volume em **`/app/logs`**.
2. Semear os dados no volume (uma vez): `inventory_complete.json`, `qr_units.json` e a pasta `cache_equipamentos/`. Via `railway run` / `railway ssh` ou copiando no primeiro boot. Sem isso, `/stock` volta vazio.

## 6. Validação pós-deploy

```bash
curl https://<dominio-galpao>.up.railway.app/api/ping
curl -H "x-api-key: <API_KEY>" \
  "https://<dominio-galpao>.up.railway.app/api/v1/public/stock?date=2026-07-10"
```
Esperado: `pong`; e lista de itens com `real_stock_available`. Testar uma data COM evento e uma SEM, para confirmar que `commitments_on_date` varia (é o comportamento por-data).

## 7. Ligar no BRT Desenrola (Fluxo 1)

No serviço do BRT, adicionar:
```
ESTOQUE_API_BASE_URL=https://<dominio-galpao>.up.railway.app
ESTOQUE_API_KEY=<mesma API_KEY>
ESTOQUE_CACHE_TTL_SECONDS=300
ESTOQUE_INTEGRATION_ENABLED=true
```
A implementação do Fluxo 1 (consulta real por data com cache + fallback, **sem** sobrescrever `EquipmentStock.total_quantity`) está detalhada em `HANDOFF_INTEGRACAO_ESTOQUE_x_BRTDESENROLA.md` (seção 4.3 tem a spec pronta) e o runbook em `RUNBOOK_GOLIVE_2_SISTEMAS.md`.

> Regra de ouro: ligar a **decisão automática** de sublocação só depois do relatório `name-diff` estar limpo (matching de nomes é o maior risco).

## 8. O que NÃO fazer neste primeiro deploy

- Não sobrescrever `EquipmentStock.total_quantity`.
- Não ativar envio automático de reservas ao galpão (Fluxo 2) nem webhooks (Fluxo 3) ainda.
- WhatsApp do galpão fica OFF (`ENABLE_WHATSAPP=false`); a camada de WhatsApp/IA/resumos é só no BRT.

---

Dúvidas de integração: ver `HANDOFF_INTEGRACAO_ESTOQUE_x_BRTDESENROLA.md`, `RUNBOOK_GOLIVE_2_SISTEMAS.md` e `openapi.yaml` (na raiz do repo do galpão).
