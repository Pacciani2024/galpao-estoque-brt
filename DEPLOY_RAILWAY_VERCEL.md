# Deploy — Backend no Railway + Frontend no Vercel

Guia passo a passo para colocar o Controle de Estoque no ar e conectar ao brt desenrola.

---

## Parte 1 — Backend no Railway

### 1. Preparar o repositório

1. Confirme que o `.gitignore` (já criado) ignora `.env`, `google-cloud-key.json`,
   `node_modules/`, `.wwebjs_auth/` e `logs/`.
2. **Rotacione as chaves** que estavam no `.env`/`google-cloud-key.json` antes de
   subir (MeEventos, Gemini, GitHub, Google Cloud) — elas foram expostas no disco.
3. Faça push do projeto para um repositório Git (GitHub/GitLab).

### 2. Criar o serviço no Railway

1. Em [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Selecione o repositório. O Railway lê o `railway.json` e usa o
   **`Dockerfile.railway`** (imagem enxuta que roda só `node server.js`).
3. O healthcheck já aponta para `/api/ping`.

### 3. Configurar variáveis de ambiente

Em **Variables**, adicione (baseie-se no `.env.example`):

| Variável | Valor |
| :-- | :-- |
| `API_KEY` | chave forte — `openssl rand -hex 32` |
| `ENABLE_WHATSAPP` | `false` |
| `MEEVENTOS_API_KEY` | sua chave |
| `MEEVENTOS_BASE_URL` | `https://app1.meeventos.com.br/brt/api/v1` |
| `MEEVENTOS_USUARIO` / `MEEVENTOS_SENHA` | credenciais |
| `GEMINI_API_KEY` | sua chave (se usar o Mark) |

> Não defina `PORT` — o Railway injeta automaticamente e o código já usa `process.env.PORT`.

### 4. Persistência dos dados (IMPORTANTE)

O sistema grava estoque, QR units e progresso em arquivos JSON dentro de `logs/`.
O disco do Railway é **efêmero**: sem volume, você perde os dados a cada deploy.

- **Solução rápida:** em **Settings → Volumes**, crie um volume e monte em `/app/logs`.
- **Solução robusta (futuro):** migrar os JSON para Postgres (o Railway oferece
  um Postgres em 1 clique).

### 5. Publicar e testar

1. Após o deploy, o Railway gera um domínio: `https://SEU-BACKEND.up.railway.app`.
2. Teste:

```bash
curl https://SEU-BACKEND.up.railway.app/api/ping
curl -H "x-api-key: SUA_CHAVE" "https://SEU-BACKEND.up.railway.app/api/v1/public/stock"
```

---

## Parte 2 — Frontend no Vercel

O frontend hoje está em `public/` (HTML/CSS/JS estático) e chama a API por
caminhos relativos (`/api/...`). Para separá-lo no Vercel:

1. Faça deploy da pasta `public/` como projeto estático no Vercel.
2. Ajuste as chamadas fetch para apontar ao backend do Railway. Duas opções:
   - Definir uma constante `API_BASE = "https://SEU-BACKEND.up.railway.app"` e
     prefixar as chamadas; **ou**
   - Usar um rewrite no `vercel.json` para redirecionar `/api/*` ao Railway:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://SEU-BACKEND.up.railway.app/api/:path*" }
  ]
}
```

3. No backend, restrinja o CORS ao domínio do Vercel (hoje está aberto a todos).

> Alternativa mais simples: deixar o frontend servido pelo próprio backend no
> Railway (já funciona via `express.static('public')`) e usar o Vercel só se
> quiser separar de fato.

---

## Parte 3 — Conectar o brt desenrola

1. **Leitura:** o brt desenrola consome `GET /api/v1/public/stock` etc. com o header
   `x-api-key`.
2. **Notificações:** aponte o webhook do estoque para o brt desenrola em
   `config/webhooks.json`.
3. Detalhes completos em [`INTEGRACAO_BRT_DESENROLA.md`](./INTEGRACAO_BRT_DESENROLA.md).

---

## Checklist final

- [ ] Chaves antigas rotacionadas
- [ ] `.env` e `google-cloud-key.json` fora do Git
- [ ] Variáveis configuradas no Railway (`API_KEY`, `ENABLE_WHATSAPP=false`, MeEventos…)
- [ ] Volume montado em `/app/logs` (persistência)
- [ ] `/api/ping` responde em produção
- [ ] `/api/v1/public/stock` responde com `x-api-key`
- [ ] CORS restrito ao frontend/brt desenrola
- [ ] Endpoints de escrita protegidos com `apiKeyAuth`
- [ ] Webhook do brt desenrola configurado
