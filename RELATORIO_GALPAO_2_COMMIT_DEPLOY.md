# Relatório — GALPÃO.2 (commit seguro + preparação de deploy)

## Resumo executivo

Todo o **pré-commit foi executado e validado**. O commit em si **não pôde ser
finalizado a partir deste ambiente** por uma limitação técnica (o sandbox não
consegue fazer as operações internas do git na pasta sincronizada por Dropbox —
não remove `index.lock` nem renomeia objetos). Solução entregue: um script pronto
(`GALPAO_2_COMMIT.sh`) para você rodar **no seu Mac**, onde o git funciona normal.
Sem push e sem deploy (dependem da sua conta GitHub/Railway).

## Validações executadas (resultados reais)

- `node --check server.js` → **OK**; `node --check scheduler.js` → **OK**.
- Auth local (`API_KEY=test-secret`): ping 200 · sem key 401 · `?key=` 401 · key errada 401 · header correto 200. ✅
- `git check-ignore` confirmou ignorados: `.env`, `google-cloud-key.json`, `node_modules`, `logs`, `dist`, `.wwebjs_auth`, `.wwebjs_cache`, `data/access_keys.json`. ✅
- **Guard anti-segredo** (dry-run do stage): 0 arquivos sensíveis. ✅
- Nenhum script solto (`MeEventosClient`, `inspect_inventory`, etc.) é `require`-ado pelo app — repo continua funcional sem os arquivos de debug.

## O que o commit vai conter (staging explícito, sem `git add .`)

- **Configs:** `.dockerignore`, `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `Dockerfile`, `Dockerfile.railway`, `docker-compose.yml`, `ecosystem.config.js`, `railway.json`, `openapi.yaml`
- **App:** `server.js`, `scheduler.js`, `MeEventosClient.js`, e as pastas `agent/`, `modules/`, `services/`, `scripts/`, `config/`, `public/`
- **Docs:** `README.md`, `DOCUMENTATION_API_HOOKS.md`, `DEPLOY_RAILWAY_VERCEL.md`, `INTEGRACAO_BRT_DESENROLA.md`, `HANDOFF_...md`, `RUNBOOK_...md`, `BRIEF_...md`, `FASE_BRT_ESTOQUE_1A.md`, `RELATORIO_GALPAO_1_HARDENING.md`, `integration_stubs_brt/`

**Fora do commit** (ignorado/não adicionado): `.env`, `google-cloud-key.json`, `data/`, `logs/`, `dist/`, `node_modules/`, `.wwebjs_auth/`, `vini/`, PDFs/CSV/BAT soltos, `*.tar.gz/.zip/.exe/.mp3`.

## Como finalizar (no seu Mac)

```bash
cd "<pasta do galpão>"
bash GALPAO_2_COMMIT.sh
```
O script (v2): **PRESERVA o `.git` existente** (só inicializa se não houver), confere
ignores, **varre `config/` e os docs por segredo**, faz o staging explícito (incluindo
`RELATORIO_GALPAO_2_COMMIT_DEPLOY.md`), roda o **guard ampliado** + scanner de conteúdo,
e cria o commit. **Não** faz push.

> ⚠️ **git + Dropbox não combinam.** A pasta é sincronizada por Dropbox, o que gera
> locks e "conflicted copies" dentro do `.git` (foi o que travou o commit pelo sandbox).
> **Recomendação forte:** mover o projeto para uma pasta fora do Dropbox
> (ex.: `~/dev/controle-estoque-galpao`) antes de trabalhar com git. Se mantiver no
> Dropbox, antes do commit verifique a saúde do repo:
> `git status` sem erros, `git log --oneline -5`, e `find .git -iname "*conflicted*"`.

## Push + deploy (manual, com sua conta)

1. Criar repo **vazio** no GitHub. Ligar remote e `git push -u origin main`.
2. Railway → projeto do BRT → New Service → Deploy from GitHub → repo do galpão.
   - Variables: `API_KEY` (nova, `openssl rand -hex 32`), `ENABLE_WHATSAPP=false`, `MEEVENTOS_*`. Não definir `PORT`.
   - Volume em `/app/logs` + semear `inventory_complete.json`, `qr_units.json`, `cache_equipamentos/`.
3. Validar pós-deploy: `/api/ping` 200; `/stock` sem key 401; `?key=` 401; key errada 401; header correto 200 (ou vazio controlado se o volume não estiver populado).

## As 3 coisas a não deixar passar (sua recomendação)

1. **Gerar `API_KEY` nova.** (sugestão pronta: `a8f0…` já gerada, ou gere outra)
2. **Rotacionar segredos antigos** (MeEventos, Gemini, GitHub, Google Cloud) — estavam em disco.
3. **Confirmar Volume `/app/logs`** e semear os JSON — sem isso `/stock` responde vazio.

## Riscos restantes

- Commit ainda não criado (roda no Mac via script).
- Push/deploy dependem de conta GitHub + Railway (manual).
- CORS aberto e rotas internas de escrita ainda sem auth (por design — itens de fase seguinte).
- Volume não populado → `/stock` vazio (controlado, não quebra).

## Liberação para BRT.ESTOQUE.1A

**Ainda não.** BRT.ESTOQUE.1A só começa depois do galpão **no ar** (deploy feito + `/stock` respondendo em produção). Sequência: rodar o script → push → deploy Railway → validar `/stock` → então liberar 1A.
