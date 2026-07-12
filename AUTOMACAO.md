# ⏰ Configuração de Scraping Automatizado - BRT Audiovisual

## 📋 Resumo da Configuração

Sistema de automação configurado conforme solicitado:

### 1. 📦 **Scraping de Inventário**

- **Frequência**: 1x por dia às **11:00 AM**
- **Razão**: Horário de abertura do sistema quando funcionário chega
- **Script**: `scripts/test_inventory_scraper.js`
- **Cron**: `0 11 * * *`

### 2. 📅 **Scraping de Eventos + API**

- **Frequência**: **A cada 10 minutos**
- **Execução adicional**: **Ao iniciar o programa** (5s após startup)
- **Script**: `scripts/sync_eventos_equipamentos.js`
- **Cron**: `*/10 * * * *`
- **Startup**: Executado automaticamente no boot

### 3. 🔗 **Merge de Dados**

- **Frequência**: 2 minutos após cada sync de eventos
- **Script**: `scripts/merge_eventos_equipamentos.js`
- **Cron**: `2,12,22,32,42,52 * * * *`

### 4. 📊 **Monitoramento**

- **Frequência**: A cada 30 minutos
- **Script**: `scripts/monitor_sistema.js`

### 5. 🤖 **Alertas Mark AI**

- **Frequência**: 1x por dia às 08:00 AM
- **Script**: `scripts/mark_alertas.js`

---

## 🚀 Como Funciona

O scheduler agora inicia **automaticamente** quando você abre o programa com `INICIAR.bat`.

**Não precisa mais rodar scheduler separadamente!**

### Timeline de Execução (Exemplo)

```
08:00 AM ────> 🤖 Alertas Mark
11:00 AM ────> 📦 Scraping Inventário (abertura)
A cada 10min ─> 📅 Scraping Eventos + API
               └─> (0, 10, 20, 30, 40, 50 minutos)
2min depois ──> 🔗 Merge automático
A cada 30min ─> 📊 Monitoramento
```

---

## ⚙️ Arquivos Modificados

### 1. `scheduler.js`

Reescrito completamente com nova agenda:

- ✅ Inventário às 11h
- ✅ Eventos a cada 10min
- ✅ Sync no startup (5s delay)
- ✅ Logs otimizados

### 2. `server.js`

Adicionado inicialização automática do scheduler:

```javascript
// Scheduler inicia automaticamente com o servidor
require('./scheduler.js');
```

---

## 📝 Cron Expressions Explicadas

| Expressão | Significado |
|-----------|-------------|
| `0 11 * * *` | Todo dia às 11:00 |
| `*/10 * * * *` | A cada 10 minutos |
| `2,12,22,32,42,52 * * * *` | Nos minutos 2, 12, 22, etc |
| `*/30 * * * *` | A cada 30 minutos |
| `0 8 * * *` | Todo dia às 08:00 |

---

## 🧪 Como Testar

### 1. Iniciar o sistema

```batch
INICIAR.bat
```

### 2. Verificar logs no console

Você verá mensagens como:

```
⏰ SCHEDULER INICIADO
✅ Scraping inicial agendado para 5s após startup
✅ Agendado: Sync Inventário (11:00 diariamente)
✅ Agendado: Sync Eventos (a cada 10 minutos)
```

### 3. Aguardar 5 segundos

O primeiro scraping de eventos irá executar automaticamente!

### 4. Aguardar 10 minutos

O próximo scraping automático irá rodar.

### 5. Aguardar até 11:00 AM

O scraping de inventário irá executar no horário.

---

## 📊 Monitorando Execuções

### Logs em Tempo Real

O console mostrará todas as execuções:

```
🔄 [CRON] Sync Eventos + Equipamentos
⏰ Horário: 15/12/2025 14:20:00
✅ Sync concluído com sucesso!
```

### Arquivos de Relatório

- `logs/sync_report.json` - último sync de eventos
- `logs/inventory_result.json` - último sync de inventário
- `logs/eventos_completos.json` - dados processados

---

## ⚠️ Importante

### Primeira Execução

Na primeira vez que iniciar o sistema:

1. **Startup sync** (5s): Carrega eventos
2. **Primeira execução às X:00** ou **X:10** etc: Próximo sync automático
3. **Primeira execução às 11:00**: Primeiro scraping de inventário

### Desempenho

- Cada scraping de eventos pode levar **~30 segundos** dependendo da quantidade
- Pause de 3s entre cada evento para não sobrecarregar o servidor
- Inventário completo pode levar **até 2 minutos**

### Parar o Sistema

- Use `PARAR.bat` ou
- Pressione `Ctrl+C` na janela do servidor
- O scheduler para automaticamente

---

## 🔧 Ajustes Futuros

Se precisar mudar horários, edite `scheduler.js`:

```javascript
// Exemplo: mudar inventário para 09:00
cron.schedule('0 9 * * *', () => {
    // ...
});

// Exemplo: mudar eventos para 5 minutos
cron.schedule('*/5 * * * *', () => {
    // ...
});
```

---

## ✅ Status Atual

- ✅ Scheduler integrado ao servidor
- ✅ Execução automática no startup
- ✅ Inventário: 11:00 AM diário
- ✅ Eventos: 10 minutos + startup
- ✅ API sempre atualizada
- ✅ Logs completos
