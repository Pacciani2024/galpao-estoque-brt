# Arquitetura de Responsabilidades — Galpão ↔ BRT Desenrola ↔ MeEventos

Documento de alinhamento (dono de cada domínio, fronteiras e roadmap). Objetivo:
os três sistemas se complementarem sem "bater de frente" nem duplicar verdade.

---

## 1. Princípio central

Cada sistema é **dono de uma verdade** e ninguém pisa na do outro:

- **MeEventos** = origem dos **eventos e itens contratados** (fonte comercial primária).
- **BRT Desenrola** = **cérebro comercial e operacional** (reservas, decisão de sublocação, Trello, WhatsApp/IA, financeiro, frota).
- **Galpão (Controle de Estoque)** = **realidade física** (unidades/QR, disponibilidade real, manutenção, separação/conferência, etiquetas).

Regra de ouro: **um dado tem UM dono.** Os outros consomem, não reescrevem.

---

## 2. Matriz de responsabilidades

| Domínio | Dono | Consome (leitura) | Observação |
| :-- | :-- | :-- | :-- |
| Eventos / itens contratados | MeEventos | BRT, Galpão | ideal: 1 puxador (ver §5) |
| Reservas por evento/data | **BRT** | Galpão (opcional) | `equipment_reservations` |
| Decisão de sublocação | **BRT** | — | `check_equipment_conflicts` |
| Disponibilidade física real por data | **Galpão** | BRT | `/api/v1/public/stock` |
| Unidades / QR / status por unidade | **Galpão** | BRT | `units_detail` |
| Manutenção de equipamento | **Galpão** | BRT | reduz disponibilidade |
| Separação / conferência (scan out/in) | **Galpão** | BRT | dispara webhooks |
| Pendências (itens faltantes no retorno) | **Galpão** | BRT | `/pendencies` + webhook |
| Etiquetas (QR/EAN) e cross-docking | **Galpão** | BRT (aciona) | ferramentas físicas |
| Pipeline Trello | **BRT** | — | listas 01–13 |
| WhatsApp / IA / resumos | **BRT** | — | Cloud API 1:1 |
| Financeiro / orçamentos | **BRT** | — | budget engine |
| Frota / rastreamento | **BRT** | — | carsystem, vehicle positions |
| Escrita no MeEventos | **BRT** | — | `meeventos_write_client` |

---

## 3. Fronteiras — o que cada um NÃO faz

**Galpão não:** cria evento comercial, decide sublocação, move card no Trello,
dispara WhatsApp, escreve no MeEventos, faz orçamento. (Mark/IA e WhatsApp do
galpão ficam **desligados** em produção — `ENABLE_WHATSAPP=false`.)

**BRT não:** rastreia unidade física, controla QR, define disponibilidade física,
executa separação/conferência, imprime etiqueta. Para saber "quanto realmente
tem", **pergunta ao galpão** (não recalcula).

---

## 4. Fluxos de integração (direção dos dados)

1. **Disponibilidade (Galpão → BRT).** BRT consulta `/api/v1/public/stock?date=` para decidir
   conflito/sublocação. Leitura por data, com cache e fallback. **(Fluxo 1)**
2. **Reservas (BRT → Galpão).** BRT informa o que está comprometido por evento,
   para o galpão refletir compromissos. **(Fluxo 2 — fase posterior)**
3. **Conferência (Galpão → BRT).** Saída/retorno/pendência do galpão notifica o
   BRT via webhook → move card no Trello + alerta. **(Fluxo 3 — fase posterior)**

---

## 5. Governança de conflitos (as 3 regras que evitam briga)

1. **MeEventos com um puxador só (meta).** Hoje os dois scrapeiam o MeEventos.
   A médio prazo, o galpão passa a receber os eventos **do BRT** (ou um serviço
   único puxa e ambos leem) — elimina carga dupla e divergência.
2. **Disponibilidade tem dono único: o galpão.** O BRT nunca sobrescreve
   `EquipmentStock.total_quantity` com número de uma data; usa o `/api/v1/public/stock`
   real e mantém `total_quantity` só como fallback.
3. **Casamento de nomes via `equipment_aliases`.** Camada única de reconciliação
   entre MeEventos ↔ BRT ↔ galpão. Gate: decisão automática só depois do
   relatório `name-diff` limpo.

---

## 6. Roadmap das ondas de valor

| Onda | Entrega | Status | Gate para avançar |
| :-- | :-- | :-- | :-- |
| **0** | Hardening + deploy do galpão no Railway | ✅ **CONCLUÍDA** | `/api/v1/public/stock` respondendo em produção ✅ |
| **1** | Disponibilidade real por data (Fluxo 1) | ⏭️ próxima (BRT.ESTOQUE.1A→1C) | `name-diff` limpo antes da decisão automática |
| **2** | Conferência → Trello + pendências (Fluxo 3) | pendente | Onda 1 estável |
| **3** | Unidade/manutenção (status por QR no BRT) | pendente | Onda 1 estável |
| **4** | Etiquetas + cross-docking acionáveis pelo BRT | pendente | Ondas 1–2 |

Regra de ouro do roadmap: **uma onda por vez, sempre atrás de um gate.** Nada de
ligar escrita/automação sem a leitura estar validada.

---

## 7. O que NÃO aproveitar do galpão (evitar duplicação)

- **IA própria (Mark/Kira, Gemini)** → o BRT já tem IA melhor; galpão fica como
  ajuda local do dashboard, não como IA do sistema.
- **Clima / rotas (external_apis)** → o BRT tem logística/geo mais completa.
- **Frota** → domínio do BRT (carsystem, vehicle positions).
- **WhatsApp do galpão** → desligado; canal único é a Cloud API no BRT.

Esses pontos ficam no galpão para uso interno/local, mas **não** entram na
integração nem viram fonte de verdade.

---

## 8. Resumo de uma linha

**Galpão = onde as coisas estão. BRT = o que fazer com elas. MeEventos = o que foi
vendido.** Cada verdade com um dono; o resto consome por API/webhook, atrás de gates.

---

*Documento criado em 2026-07-03. Atualizar a cada onda concluída.*
