# Patch — app/equipment_availability.py (Fluxo 1 na decisão)

Alteração mínima em `check_equipment_conflicts(db, target_date)`: usar a
disponibilidade REAL do galpão para a `target_date`, com **fallback** para
`EquipmentStock.total_quantity`. **Não** sobrescrever `total_quantity`.

## Import (topo do arquivo)

```python
from app.estoque_reconciliation import get_real_availability
```

## Trecho a mudar

Hoje:

```python
        if not stock_item:
            continue

        available_qty = float(stock_item.total_quantity or 0)
```

Depois:

```python
        if not stock_item:
            continue

        # Fluxo 1: disponibilidade real por data (com fallback seguro).
        real = get_real_availability(db, eq_name, target_date)
        if real is not None:
            available_qty = real                      # número real do galpão
        else:
            available_qty = float(stock_item.total_quantity or 0)  # fallback
            # TODO: logger.warning("fallback estoque p/ %s em %s", eq_name, target_date)
```

## Observações

- `get_real_availability` já devolve `None` quando a integração está off
  (`ESTOQUE_INTEGRATION_ENABLED=false`), quando o galpão não responde ou quando
  não há match confiável de nome → nesses casos o comportamento é **idêntico ao atual**.
- Isso torna a ativação segura: subir com `ESTOQUE_INTEGRATION_ENABLED=false`,
  validar as rotas de diagnóstico e o `name-diff`, e só então ligar para `true`.
- Gate: só considerar a decisão automática confiável depois do `name-diff` limpo.
