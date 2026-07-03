# Contexto do Projeto — Integração Galpão (Controle de Estoque) ↔ BRT Desenrola

Documento de contexto para leitura junto com o `RELATORIO_DIAGNOSTICO_INTEGRACAO.md`.
Resume **o que é o projeto, o que já foi feito, o estado atual e o que fazer a seguir.**

---

## 1. O projeto em uma frase

Ligar dois sistemas que já existem — o **Controle de Estoque do galpão** (Node/Express,
verdade física do estoque com QR) e o **BRT Desenrola** (FastAPI, cérebro comercial:
MeEventos, WhatsApp, Trello, sublocação, financeiro) — de forma **independente e
conectada por contrato**, para o BRT decidir sublocação com a **disponibilidade real**
do galpão, e a operação física (separação/conferência) alimentar o BRT de volta.

---

## 2. O que já foi feito (linha do tempo)

**Análise.** Mapeamos os dois sistemas. O galpão já tinha uma API pública (`/api/v1/public/stock`)
e webhooks; o BRT já tinha reservas, IA e WhatsApp Cloud API.

**GALPÃO.1 — Hardening seguro (concluído).**
- Criado `.dockerignore` (segredos/logs/artefatos fora da imagem).
- `API_KEY` sem fallback inseguro; autenticação **só via header `x-api-key`** (removido `?key=`); `.trim()` na chave (resolveu mismatch por espaço/newline).
- Servidor cria pastas `logs/`/`data/` no boot (evita crash ENOENT no container).
- Mapeamos as rotas: as de escrita do **dashboard** ficaram abertas de propósito (protegê-las quebraria a interface) — proteção externa fica para fase dedicada.
- Validado localmente (node --check + curls de auth) e documentado em `RELATORIO_GALPAO_1_HARDENING.md`.

**GALPÃO.2 — Commit + deploy (concluído).**
- Repositório no GitHub: `Pacciani2024/galpao-estoque-brt` (commit seguro, sem segredos).
- Deploy no Railway como serviço no mesmo projeto do BRT (`Dockerfile.railway`, healthcheck `/api/ping`).
- **Seed automático**: os 498 itens (`inventory_complete.json` + `qr_units.json`) embarcam na imagem em `seed/` e são copiados para `logs/` no primeiro boot.
- **Produção validada:** `/api/ping` → 200; `/api/v1/public/stock` → **200 com 498 itens reais**, auth funcionando.

**Diagnóstico de integração (concluído).** Ver `RELATORIO_DIAGNOSTICO_INTEGRACAO.md`.
Achado principal: **os dois sistemas compartilham o ID do MeEventos** (galpão `id` ↔
BRT `equipment_id_meeventos`) → dá para casar por **ID**, não por nome.

**Arquitetura de responsabilidades (concluído).** Ver `ARQUITETURA_RESPONSABILIDADES.md`.
Cada sistema dono de uma verdade; independentes; conectados por API/webhooks.

---

## 3. Estado atual

- **Galpão:** no ar no Railway, `/stock` com 498 itens, auth OK.
- **BRT Desenrola:** no ar no Railway (já estava), com IA + WhatsApp Cloud API prontos.
- **Integração:** ainda **não** existe — os dois rodam em paralelo, sem se falar. O BRT
  ainda não consome o `/stock`.
- **Pendência de infra:** falta criar o **Volume `/app/logs`** no galpão (sem ele, o
  que você bipar/alterar se perde a cada redeploy — volta ao seed).

---

## 4. O que eu recomendo fazer (nesta ordem)

**1. Criar o Volume `/app/logs`** no galpão (Railway → Volumes → Mount Path `/app/logs`).
É o único item de infra pendente e é o que garante que a operação física persista.

**2. Onda 1 — BRT.ESTOQUE.1A (leitura + diagnóstico), casando por ID.**
O dev implementa no BRT o cliente do `/stock` + as rotas de diagnóstico, **priorizando
o matching por `equipment_id_meeventos`** (nome/alias como fallback). Rodar o
`id-diff`/`name-diff` até ficar limpo. **Nada de decisão automática ainda.** Base:
`FASE_BRT_ESTOQUE_1A.md` + `integration_stubs_brt/` (ajustar para ID-primeiro).

**3. Onda 1C — ligar a disponibilidade real na decisão** de sublocação, com fallback
seguro, só depois do diagnóstico limpo.

**4. Kira no número oficial (frente paralela).** A IA já existe no BRT e o webhook da
WhatsApp Cloud API também. Falta configurar o webhook no Meta + dar a persona "Kira".
Não depende do estoque — pode correr junto.

**5. Ondas 2 e 3 (depois).** Separação/conferência → Trello (webhooks); reservas BRT → galpão.

**6. Robustez (encaixar quando fizer sentido).** Proteger o dashboard do galpão com
login; CORS restrito; migrar para "um puxador só do MeEventos" (`MeEventos → BRT → Galpão`).

---

## 5. Princípios que guiam tudo

- **Um dado tem um dono** (galpão = física; BRT = comercial). Ninguém duplica verdade.
- **Casar por ID do MeEventos**, nome só como rede de segurança.
- **Independentes, conectados por contrato** (API + webhooks) — cada um roda e
  degrada sozinho. É o que permite adicionar plugins/softwares sem risco.
- **Uma onda por vez, atrás de um gate.** Sempre começar em leitura/diagnóstico.

---

## 6. Índice dos documentos gerados (para o dev)

- `RELATORIO_DIAGNOSTICO_INTEGRACAO.md` — diagnóstico + solução (matching por ID).
- `ARQUITETURA_RESPONSABILIDADES.md` — quem é dono de quê.
- `FASE_BRT_ESTOQUE_1A.md` — passo a passo da Onda 1 (diagnóstico read-only).
- `integration_stubs_brt/` — stubs Python prontos (client, reconciliação, rotas).
- `HANDOFF_INTEGRACAO_ESTOQUE_x_BRTDESENROLA.md` — contrato dos 3 fluxos + WhatsApp.
- `openapi.yaml` — especificação da API do galpão.
- `RUNBOOK_GOLIVE_2_SISTEMAS.md` / `BRIEF_DEV_DEPLOY_GALPAO.md` — deploy.
- `RELATORIO_GALPAO_1_HARDENING.md` / `RELATORIO_GALPAO_2_COMMIT_DEPLOY.md` — o que foi feito.

---

## 7. Riscos e pendências abertas

1. **Volume não criado** → dados do galpão voláteis (prioridade 1).
2. **Matching de nomes** → mitigado pelo ID; ainda exige `id-diff` limpo antes da automação.
3. **Dashboard do galpão sem login** → exposto na URL pública (tratar).
4. **Duplo puxar do MeEventos** → resolver na maturidade (`MeEventos → BRT → Galpão`).
5. **Chaves de API expostas em chat/histórico** → manter só no Railway; rotacionar se necessário.

---

## 8. Resumo de uma linha

**Galpão no ar com 498 itens reais; BRT no ar com IA/WhatsApp; falta ligar os dois —
começando pela leitura da disponibilidade real, casada por ID do MeEventos, atrás de
gates, mantendo os sistemas independentes e conectados por contrato.**
