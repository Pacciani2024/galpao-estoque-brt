# README Operacional — Integração MeEventos · BRT Desenrola · Galpão · Kira

Material oficial para alinhar **dev, equipe e liderança**. Traduz a arquitetura
técnica para a operação real.

---

## Princípio: um dado tem um dono

> **Um dado tem um dono.**
>
> - **MeEventos** é o **contrato**: o que foi vendido.
> - **Galpão** é a **mão**: o que existe fisicamente e o que foi bipado.
> - **BRT Desenrola** é a **cabeça**: reservas, decisão de sublocação, Trello, financeiro e operação.
> - **Kira** é a **voz**: conversa com a equipe e transforma decisão em orientação.
>
> Cada sistema expõe sua verdade por API ou webhook. Os outros **leem, mas não reescrevem**.

---

## Quem é dono de quê (e o que os outros podem fazer)

| Sistema | É dono de… | Os outros podem… |
| :-- | :-- | :-- |
| **MeEventos** | evento, orçamento, itens vendidos, data | ler (puxar eventos/itens) |
| **Galpão** | estoque físico, unidades QR, manutenção, separação, conferência, pendências | ler `/stock`; **receber** aviso de reserva |
| **BRT Desenrola** | reservas por evento, decisão de sublocação, Trello, financeiro, frota, WhatsApp/Kira | consultar disponibilidade; receber webhooks |
| **Kira** | resposta no WhatsApp, resumo, alerta de falta, orientação | recebe a decisão do BRT |

### A fronteira, com precisão

**O BRT não altera o estoque físico do galpão.** Ele pode **informar
reservas/compromissos**, mas quem muda **disponibilidade física, status de unidade,
manutenção e conferência é sempre o galpão.**

E o inverso: o galpão não decide sublocação, não move card no Trello, não dispara
WhatsApp — ele **avisa** (webhook) e o BRT decide o que fazer.

---

## Como funciona na prática — um evento de ponta a ponta

1. **MeEventos vende** um evento.
2. **BRT cria as reservas** (com o ID do MeEventos de cada item).
3. **BRT consulta o galpão** por ID: "tenho isto fisicamente na data?".
4. **BRT decide**: se falta, **subloca** (Trello + parceiro); a **Kira avisa**.
5. **Galpão bipa a separação** (QR) → **dispara webhook**.
6. **BRT move o card** (Separar → Conferido → Montagem) e a Kira dá o retorno.
7. **Galpão bipa o retorno**; se faltou item, marca **pendência** → BRT alerta.

> Exemplo: falta uma caixa QSC no sábado. Quem descobre? O **BRT** (reserva ×
> disponibilidade do galpão). Quem decide sublocar? O **BRT**. Quem separa e bipa? O
> **galpão**. Quem avisa a equipe? A **Kira**. Cada um faz a sua parte, ninguém pisa
> na do outro.

---

## Regras de ouro (o que protege a operação)

- **Matching primário por ID do MeEventos** (`galpão.id == BRT.equipment_id_meeventos`).
- **Nome/alias só como fallback.**
- **Sem match não automatiza** — vai para o relatório (`id-diff`) e um humano trata via alias.
- **Galpão não decide sublocação; BRT não altera estoque físico.**
- **Independentes, conectados por contrato** — cada um roda e degrada sozinho
  (se o galpão cai, o BRT usa o fallback e não trava).
- **Uma onda por vez, atrás de um gate.**

---

## Diagrama

Ver `arquitetura_responsabilidades.svg` (versão visual desta divisão) — fluxo
`MeEventos → BRT → Galpão → BRT/Trello/Kira`, com donos de escrita, rotas, webhooks e regras.

---

## Estado atual

- **Galpão:** em produção (Railway), `/stock` com 498 itens reais, persistente.
- **BRT Desenrola:** em produção, com IA/WhatsApp e reservas prontos.
- **Integração:** próxima onda (BRT.ESTOQUE.1A) — leitura/diagnóstico por ID, sem automação até o `id-diff` limpo.

Documentos relacionados: `ARQUITETURA_RESPONSABILIDADES.md`,
`RELATORIO_DIAGNOSTICO_INTEGRACAO.md`, `CONTEXTO_PROJETO_INTEGRACAO.md`,
`FASE_BRT_ESTOQUE_1A.md`.
