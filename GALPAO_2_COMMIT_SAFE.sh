#!/usr/bin/env bash
# GALPÃO.2 — commit seguro do serviço Galpão (rodar no seu Mac, dentro da pasta do projeto).
# Versão adaptada: NÃO apaga .git (preserva histórico).
# NÃO faz push nem deploy. Só prepara o commit local, com guard anti-segredo.
set -euo pipefail

echo "==> Verificando repo git existente..."
if [ ! -d ".git" ]; then
  echo "!! ERRO: Não encontrei um .git aqui. Rode dentro da pasta do projeto."
  exit 1
fi

echo "==> Configurando identidade (local)"
git config user.email "djrodrigoalves01@gmail.com"
git config user.name "Pacciani"

echo "==> Garantindo branch main"
git checkout -b main 2>/dev/null || git checkout main 2>/dev/null || true

echo "==> Conferindo que os segredos estão ignorados"
for f in .env google-cloud-key.json node_modules logs dist .wwebjs_auth .wwebjs_cache data/access_keys.json; do
  if git check-ignore -q "$f"; then echo "   IGNORADO  $f"; else echo "   !! ATENÇÃO: NÃO ignorado: $f"; fi
done

echo "==> Staging explícito (sem 'git add .')"
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
  BRIEF_DEV_DEPLOY_GALPAO.md FASE_BRT_ESTOQUE_1A.md RELATORIO_GALPAO_1_HARDENING.md \
  RELATORIO_GALPAO_2_COMMIT_DEPLOY.md \
  integration_stubs_brt

echo "==> GUARD anti-segredo (aborta se algo sensível entrou no stage)"
if git diff --cached --name-only | grep -iE '\.env$|google-cloud-key|node_modules/|^logs/|inventory_complete|qr_units|wwebjs|\.zip$|\.tar\.gz$|\.exe$|\.mp3$|access_keys|charts/'; then
  echo "!! ABORTADO: arquivo sensível no stage. Rode: git reset HEAD <arquivo>"
  exit 1
fi
echo "   OK — nenhum arquivo sensível no stage."

echo "==> Arquivos que serão commitados: $(git diff --cached --name-only | wc -l | tr -d ' ')"
git diff --cached --stat | tail -10

echo "==> Commit"
git commit -m "chore(estoque): prepare galpao service for Railway deploy"
echo "   Commit criado: $(git rev-parse --short HEAD)"

cat <<'EOF'

============================================================
PRÓXIMOS PASSOS (fazer manualmente, com sua conta):

1) Criar um repositório VAZIO no GitHub (sem README).
2) Ligar o remote e dar push (troque a URL pela do seu repo):
     git remote add origin git@github.com:<org>/<repo-galpao>.git
     git push -u origin main
3) No Railway (projeto do BRT) → New Service → Deploy from GitHub → repo do galpão.
   Variáveis: API_KEY (nova, forte), ENABLE_WHATSAPP=false, MEEVENTOS_*.
   Volume em /app/logs + semear inventory_complete.json, qr_units.json, cache_equipamentos/.
============================================================
EOF
