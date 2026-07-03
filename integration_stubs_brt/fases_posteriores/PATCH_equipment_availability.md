# Patch — app/equipment_availability.py (Fluxo 1 na decisão)

Alteração mínima em `check_equipment_conflicts(db, target_date)`: usar a
disponibilidade REAL do galpão para a `target_date`, com **fallback** para
`EquipmentStock.total_quantity`. **Não** sobrescrever `total_quantity`.

## Import (topo do arquivo)

```python
from app.estoque_reconciliation import get_physical_availability
```

## Trecho a mudar

Hoje:

```python
        if not stock_item:
            continue

        available_qty = float(stock_item.total_quantity or 0)
```

Depois (casa por ID do MeEventos, usa disponibilidade FÍSICA, com fallback):

```python
        if not stock_item:
            continue

        # Fluxo 1: disponibilidade FÍSICA do galpão para a data, casada por ID.
        # `stock_item.equipment_id_meeventos` é a chave primária de match (nome é rede).
        fisico = get_physical_availability(
            db, stock_item.equipment_id_meeventos, eq_name, target_date
        )
        if fisico is not None:
            available_qty = fisico                    # físico do galpão (o BRT reaplica reservas)
        else:
            available_qty = float(stock_item.total_quantity or 0)  # fallback
            # TODO: logger.warning("fallback estoque p/ %s em %s", eq_name, target_date)
```

## Observações

- **Por que FÍSICO e não `real_stock_available`:** o BRT já desconta as próprias
  reservas (`equipment_reservations`). Se usasse o `real_stock_available` (já
  descontado pelo galpão), haveria **dupla contagem**. Por isso a função devolve o
  físico (`real + commitments_on_date`), e o BRT aplica as reservas dele por cima.
- **Match por ID:** casa `galpão.id == BRT.equipment_id_meeventos`; nome/alias só como
  rede. Muito mais robusto que casar por nome.
- `get_physical_availability` devolve `None` quando a integração está off, quando o
  galpão não responde ou quando não há match → nesses casos o comportamento é
  **idêntico ao atual** (usa `total_quantity`).
- Gate: só ligar a decisão automática depois do relatório de reconciliação limpo
  (`/name-diff` → id/nome/alias sem "sem match" relevante).
