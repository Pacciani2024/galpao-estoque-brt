# Relatório, Diagnóstico e Solução — Integração Galpão ↔ BRT Desenrola

Objetivo: entender o galpão a fundo, diagnosticar como ligar nos dois sistemas e
propor o **melhor projeto possível** de integração.

---

## 0. Sumário executivo (o achado principal)

Os dois sistemas **compartilham o mesmo identificador**: o **ID do equipamento no
MeEventos**. No galpão ele é o `id` de cada item; no BRT é o
`equipment_reservations.equipment_id_meeventos`. Isso permite casar os itens por
**ID exato** — muito mais robusto do que casar por **nome** (que era o maior risco
do projeto). Recomendação central: **matching por ID primeiro**, nome/alias só como
rede de segurança.

---

## 1. Como o galpão funciona (modelo de dados real)

O galpão é a **verdade física** do estoque. Três camadas de dados:

**a) Catálogo — `inventory_complete.json` (498 itens).** Cada item vem da API do
MeEventos (`/equipment`) e tem: `id` (**= ID MeEventos**), `nome`, `categoria`,
`marca`, `modelo`, `estoque` (quantidade total), `valorCusto`/`valorVenda`,
`codigo`, `descricao`. Ex.: `{ id: "2", nome: "CAIXA ATIVA QSC K12", estoque: 5 }`.

**b) Unidades físicas — `qr_units.json` (167 itens têm QR).** Para os itens que você
etiquetou no MVP, cada unidade física tem um QR próprio:
`{ qrCode: "000004", status: "disponivel" | "em_uso" | "manutencao", maintenanceLogs }`.
Os outros itens (dos 498) são controlados por **quantidade / código de barras (EAN)
/ granel**, sem QR unitário.

**c) Compromissos — eventos do MeEventos + `cache_equipamentos/`.** Para cada evento,
o galpão sabe quais equipamentos (nome + quantidade) foram contratados.

**Como o `/api/v1/public/stock` combina tudo:** para a data consultada, ele soma as
unidades `disponivel` + o granel, subtrai manutenção e subtrai os compromissos de
eventos naquela data → devolve `real_stock_available` por item, com o detalhe das
unidades (`units_detail`). É exatamente a disponibilidade real por data.

> Em resumo, o galpão sabe **o que existe, quantos, quais unidades, em que estado e
> quanto está livre numa data** — coisa que o MeEventos e o BRT não sabem.

---

## 2. Como o BRT Desenrola funciona (no que toca ao estoque)

O BRT é o **cérebro comercial/operacional**. Ele puxa os eventos e os itens
contratados do MeEventos e cria **reservas** (`equipment_reservations`) com:
`event_id`, `equipment_name`, **`equipment_id_meeventos`**, `quantity`, `start_date`,
`status`. Tem ainda a tabela `equipment_stock` (agregado estático) e a
`equipment_aliases` (para variações de nome). A decisão de **sublocar** nasce em
`check_equipment_conflicts(data)`, comparando reservas × estoque.

Ponto-chave: o BRT **já grava o ID do MeEventos** em cada reserva
(`app/rules.py: equipment_id_meeventos = item.meeventos_id`).

---

## 3. Diagnóstico — onde os dois se encontram

| | Galpão | BRT Desenrola |
| :-- | :-- | :-- |
| Chave do equipamento | `id` (= ID MeEventos) + `nome` | `equipment_id_meeventos` + `equipment_name` |
| O que sabe | disponibilidade física real, unidades, manutenção | reservas por evento/data, decisão comercial |
| O que falta | não sabe compromisso comercial futuro | não sabe a realidade física |

**O encontro perfeito:** o BRT pergunta ao galpão "quanto tem de verdade do item
`X` na data `D`?" e o galpão responde. A única dúvida sempre foi **como identificar
que o item X do BRT é o item X do galpão** — e a resposta agora é clara: **pelo ID
do MeEventos**, que os dois já têm.

**Risco que isso elimina:** casar por nome é frágil ("CAIXA ATIVA QSC K12" vs "Caixa
QSC K12.1" etc.). Casar por ID acaba com a maior fonte de erro (sublocação falsa ou
falta não detectada).

---

## 4. Solução recomendada — matching em 3 camadas

Para o **melhor projeto possível**, o BRT resolve a disponibilidade assim, em ordem:

1. **Por ID do MeEventos (primário).** `galpão.id == BRT.equipment_id_meeventos`.
   Exato, à prova de variação de nome. Cobre a maioria dos itens.
2. **Por alias (secundário).** Se algum lado não tiver o ID (item manual, avulso),
   usa a tabela `equipment_aliases` para resolver o nome ao item certo.
3. **Por nome normalizado (fallback).** Última tentativa (`lower`+`trim`+espaços).
   Se nem isso casar → marca como "sem match" e **não decide sozinho** (gera alerta).

**Gate de qualidade (id-diff / name-diff).** Antes de ligar a decisão automática de
sublocação, roda um relatório que classifica cada item em: casado por ID · casado
por alias · casado por nome · **sem match**. Só liga a automação quando os "sem
match" relevantes estiverem tratados (via alias). Isso protege a operação de erro.

**Degradação graciosa.** Se o galpão estiver fora do ar, o BRT usa o
`equipment_stock.total_quantity` como fallback e segue funcionando — nunca trava.

---

## 5. Os três fluxos da integração

1. **Disponibilidade real (Galpão → BRT).** BRT consulta
   `/api/v1/public/stock?date=` e usa `real_stock_available` (casado por ID) na
   decisão de conflito/sublocação. Cache por data + fallback. **(Onda 1)**
2. **Conferência (Galpão → BRT).** Quando você inicia separação / despacha / recebe
   de volta, o galpão dispara **webhook** com o `event_id` → o BRT move o card no
   Trello e atualiza o status. **(Onda 2)**
3. **Reservas (BRT → Galpão).** O BRT informa ao galpão o que está comprometido por
   evento, fechando o loop dos compromissos. **(Onda 3, opcional)**

---

## 6. Roadmap com gates (a ordem segura)

| Onda | Entrega | Gate |
| :-- | :-- | :-- |
| 0 | Galpão no ar (auth + dados) | ✅ concluída (`/stock` com 498 itens) |
| 1 | BRT lê `/stock` por ID (diagnóstico → decisão) | id-diff/name-diff limpo |
| 2 | Separação/conferência → Trello (webhooks) | Onda 1 estável |
| 3 | Reservas BRT → galpão | Ondas 1–2 |

Regra: **uma onda por vez, cada uma atrás de um gate**, sempre começando em modo
leitura/diagnóstico antes de ligar qualquer automação.

---

## 7. Recomendações para o "melhor projeto possível"

1. **Casar por ID do MeEventos**, nome/alias só como rede. (o achado deste relatório)
2. **Expor o ID no contrato:** o `/stock` já devolve `id`; a 1A deve casar por ele.
   Evolução: expor também `codigo` para auditoria.
3. **Um puxador só do MeEventos (meta).** Hoje galpão e BRT puxam separado. Maduro:
   `MeEventos → BRT → Galpão`, para nunca divergirem de ID/nome.
4. **Independentes, conectados por contrato.** Cada sistema roda e faz deploy
   sozinho, dono da sua verdade, degradando com elegância. Isso é o que permite
   plugar novos softwares/plugins sem risco para os outros.
5. **id-diff como saúde contínua.** Rodar o relatório periodicamente para pegar itens
   novos sem ID/alias antes que virem erro.
6. **Semear/persistir dados** (Volume `/app/logs`) e proteger o dashboard (login) —
   itens de robustez que já estão mapeados.

---

## 8. Resumo de uma linha

**Os dois já falam a mesma língua — o ID do MeEventos.** O melhor projeto é: galpão
dono da verdade física, BRT dono da decisão comercial, casando por **ID** (nome só
como rede), conectados por API + webhooks, independentes e degradando com elegância.
