#!/usr/bin/env bash
# GALPÃO.2 — commit seguro do serviço Galpão (rodar no seu Mac, dentro da pasta do projeto).
# PRESERVA o histórico git existente. NÃO faz push nem deploy.
#
# Uso:
#   cd "<pasta do galpão>"
#   bash GALPAO_2_COMMIT.sh
#
set -euo pipefail

# ------------------------------------------------------------------
# 0) Repositório: preservar o existente; só inicializar se não houver.
# ------------------------------------------------------------------
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "==> Repositório git existente detectado — PRESERVANDO histórico."
else
  echo "==> Nenhum repo git — inicializando novo."
  git init -q
  git branch -M main
fi
git config user.email "djrodrigoalves01@gmail.com" 2>/dev/null || true
git config user.name  "Pacciani" 2>/dev/null || true

# ------------------------------------------------------------------
# 1) Conferir que os segredos estão ignorados
# ------------------------------------------------------------------
echo "==> Conferindo ignores de segredos/runtime"
for f in .env google-cloud-key.json node_modules logs dist .wwebjs_auth .wwebjs_cache data/access_keys.json public/charts; do
  if git check-ignore -q "$f"; then echo "   IGNORADO  $f"; else echo "   !! ATENÇÃO: NÃO ignorado: $f"; fi
done

# ------------------------------------------------------------------
# 2) Revisar config/ antes de adicionar
# ------------------------------------------------------------------
echo "==> Revisando config/ (arquivos + varredura de segredo)"
find config -type f -maxdepth 3 -print 2>/dev/null || true
if grep -RniE "token|secret|api_key|apikey|password|senha|bearer|authorization" config 2>/dev/null; then
  echo "!! Possível segredo em config/. Revise antes de continuar."; exit 1
fi
echo "   config/ sem segredos aparentes."

# ------------------------------------------------------------------
# 3) Varredura de segredo colado nos docs (antes de commitar)
# ------------------------------------------------------------------
echo "==> Varredura de segredo em docs/*.md e integration_stubs_brt/"
if grep -RniE "a8f07095[a-f0-9]{20,}|MEEVENTOS_SENHA=[^ <]|MEEVENTOS_API_KEY=[A-Za-z0-9]|GEMINI_API_KEY=[A-Za-z0-9]|github_pat_[A-Za-z0-9]|private_key|client_email|sk-[A-Za-z0-9]{20,}" \
     *.md integration_stubs_brt 2>/dev/null; then
  echo "!! Possível chave/segredo REAL em documentação. Mascare antes de commitar."; exit 1
fi
echo "   docs sem segredo real aparente (placeholders são ok)."

# ------------------------------------------------------------------
# 4) Staging explícito (sem 'git add .')
# ------------------------------------------------------------------
echo "==> Staging explícito"
git add \
  .dockerignore .gitignore .env.example \
  server.js scheduler.js MeEventosClient.js \
  package.json package-lock.json \
  Dockerfile Dockerfile.railway docker-compose.yml ecosystem.config.js railway.json \
  openapi.yaml \
  agent modules services scripts config public \
  README.md DOCUMENTATION_API_HOOKS.md \
  DEPLOY_RAILWAY_VERCEL.md INTEGRACAO_BRT_DESENROLA.md \
  HANDOFF_INTEGRACAO_ESTOQUE_x_BRTDESENROLA.md RUNBOOK_GOLIVE_2_SISTEMAS.md \
  BRIEF_DEV_DEPLOY_GALPAO.md FASE_BRT_ESTOQUE_1A.md \
  RELATORIO_GALPAO_1_HARDENING.md RELATORIO_GALPAO_2_COMMIT_DEPLOY.md \
  GALPAO_2_COMMIT.sh \
  integration_stubs_brt

# Belt-and-suspenders: garantir que charts/ nunca entra mesmo se o ignore falhar.
git reset -q -- public/charts 2>/dev/null || true

# ------------------------------------------------------------------
# 5) GUARD anti-segredo ampliado (aborta se algo sensível entrou)
# ------------------------------------------------------------------
echo "==> GUARD anti-segredo ampliado"
if git diff --cached --name-only | grep -iE '\.env$|google-cloud-key|node_modules/|^logs/|^data/|inventory_complete|qr_units|wwebjs|\.zip$|\.tar\.gz$|\.exe$|\.mp3$|access_keys|^public/charts/|charts/'; then
  echo "!! ABORTADO: arquivo sensível/runtime no stage. Rode: git reset HEAD <arquivo>"; exit 1
fi
echo "   OK — nenhum arquivo sensível no stage."

# ------------------------------------------------------------------
# 6) Scanner de conteúdo nos arquivos staged (revisão; pode ter falso positivo)
# ------------------------------------------------------------------
echo "==> Scanner de possíveis segredos no CONTEÚDO staged (revise se aparecer algo)"
git diff --cached --name-only \
  | xargs -I{} grep -nIE "API_KEY=[A-Za-z0-9]|MEEVENTOS_API_KEY=[A-Za-z0-9]|MEEVENTOS_SENHA=[A-Za-z0-9]|GEMINI_API_KEY=[A-Za-z0-9]|github_pat_|private_key|client_email|sk-[A-Za-z0-9]{20,}" {} 2>/dev/null || true

# ------------------------------------------------------------------
# 7) Resumo + commit
# ------------------------------------------------------------------
echo "==> Arquivos que serão commitados: $(git diff --cached --name-only | wc -l | tr -d ' ')"
git diff --cached --stat | tail -6

git commit -q -m "chore(estoque): hardening + Railway-ready (GALPÃO.1/2)"
echo "   Commit criado: $(git rev-parse --short HEAD)"

cat <<'EOF'

============================================================
Rode e me envie a saída:
  git log --oneline -1
  git status --short
  git diff --cached --name-only    (deve estar vazio após o commit)

PRÓXIMOS PASSOS (manual, sua conta):
1) Criar repo VAZIO no GitHub (sem README).
2) git remote add origin git@github.com:<org>/<repo-galpao>.git
   git push -u origin main
3) Railway (projeto do BRT) → New Service → Deploy from GitHub → repo do galpão.
   Variables: API_KEY (NOVA, forte), ENABLE_WHATSAPP=false, MEEVENTOS_*.
   Volume /app/logs + semear inventory_complete.json, qr_units.json, cache_equipamentos/.
============================================================
EOF
