# 🤖 Sistema de Controle de Estoque - BRT Audiovisual

Sistema completo de gerenciamento de inventário, eventos e equipamentos com IA integrada.

---

## ✅ Features Principais

### Backend (100%)

- ✅ **Events API** - 5 eventos ativos filtrados
- ✅ **Equipment Scraper** - Scraping por evento
- ✅ **Inventory Scraper** - 482 itens completos
- ✅ **QR Code System** - Controle de saídas/devoluções
- ✅ **Public Stock API** - Integração externa (Softer) com trava por data 📅
- ✅ **External APIs** - Clima, rotas, preços

### Mark AI Agent

- ✅ **Gemini AI** - Processamento inteligente  
- ✅ **Google Cloud TTS** - Voz neural PT-BR
- ✅ **Interface Web** - Chat com voz
- ✅ **Alertas Proativos** - Notificações automáticas

### Automação

- ✅ **Cron Jobs** - Sync automático
- ✅ **Monitoramento** - Sistema 24/7
- ✅ **Notificações** - Windows push

---

## 🚀 Quick Start

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar .env

```env
GEMINI_API_KEY=sua_chave_aqui
GOOGLE_CLOUD_KEY_FILE=./google-cloud-key.json
```

### 3. Iniciar Sistemas

**Mark com Voz:**

```bash
npm start
# Abra: http://localhost:3000
```

**Scheduler (Automação):**

```bash
node scheduler.js
```

---

## 📋 Scripts Disponíveis

### Sync e Integração

```bash
node scripts/sync_eventos_equipamentos.js    # Sync eventos + equipamentos
node scripts/merge_eventos_equipamentos.js   # Integrar dados
```

### QR Code System

```bash
node scripts/criar_lista_separacao.js 576    # Criar lista
node scripts/confirmar_qr.js 576 "Item" QR001 saida   # Confirmar saída
node scripts/status_lista.js 576             # Ver progresso
node scripts/finalizar_separacao.js 576      # Finalizar saída
node scripts/finalizar_devolucao.js 576      # Finalizar devolução
node scripts/estoque_disponivel.js           # Ver estoque
```

### Mark AI

```bash
node scripts/chat_agent.js                   # CLI chat
node scripts/test_mark.js                    # Testar Mark
npm start                                     # Web + Voz
```

### Monitoramento

```bash
node scripts/monitor_sistema.js              # Status sistema
node scripts/mark_alertas.js                 # Alertas inteligentes
```

---

## 📊 Estrutura

```text
├── modules/                 # Módulos backend (5)
│   ├── api.js              # Events API
│   ├── scraper_cookie.js   # Equipment scraper
│   ├── inventory_scraper.js # Inventory scraper
│   ├── estoque_manager.js  # QR system
│   └── external_apis.js    # Clima, rotas
│
├── agent/                   # Mark AI (3)
│   ├── index.js            # Agent principal
│   ├── config.js           # Configurações
│   └── system_prompt.txt   # Personalidade
│
├── scripts/                 # Scripts (20+)
│   ├── sync_*.js           # Sincronização
│   ├── *_qr.js             # QR code
│   ├── mark_*.js           # Mark AI
│   └── monitor_*.js        # Monitoramento
│
├── public/                  # Interface web
│   └── voice_chat.html     # Mark com voz
│
├── logs/                    # Dados JSON
│   ├── inventory_complete.json
│   ├── eventos_completos.json
│   ├── alocacoes.json
│   └── cache_equipamentos/
│
├── server.js               # API server
├── scheduler.js            # Cron jobs
└── package.json
```

---

## 🤖 Mark - Agente IA

### Capacidades

- 📦 Consultar inventário (451 itens)
- 📅 Gerenciar eventos (5 ativos)
- 🌦️ Previsão do tempo
- 🗺️ Calcular rotas
- 🚗 Verificar rodízio
- 👥 Informações da equipe

### Exemplos de Perguntas

```text
"Quanto temos de cabo XLR?"
"Equipamentos do evento 576?"
"Vai chover no evento de sábado?"
"Qual veículo usar para Pinheiros?"
"Posso usar a Saveiro segunda-feira?"
```

---

## ⏰ Automação (Scheduler)

### Tarefas Agendadas

- **A cada hora:** Sync eventos + equipamentos
- **00:00 diário:** Sync inventário completo
- **A cada 30 min:** Monitoramento sistema
- **08:00 diário:** Alertas Mark

### Alertas Inteligentes

Mark monitora e notifica:

- ⚠️ Evento amanhã sem equipamentos
- 📦 Separação pendente
- ❌ Estoque zerado
- 🚗 Rodízio de veículos

---

## 📱 Equipe BRT

**Diretoria:** Rodrigo (dono), Marcos (sócio)  
**Admin:** Ana Lucia (financeiro)  
**Operacional:** Cícero, Alexandre, Vinicius, Thiago

---

## 🚗 Frota

1. **Transit** - 4x2x2,30m (sem rodízio)
2. **Doblo 1** - Rodízio Segunda ⚠️
3. **Doblo 2** - Rodízio Segunda ⚠️
4. **Doblo 3** - Disponível
5. **Saveiro** - Rodízio Quinta ⚠️

---

## 📚 Documentação

- `GOOGLE_TTS_SETUP.md` - Configurar voz Google
- `AUTOMACAO.md` - Sistema de automação
- `agent/README.md` - Documentação Mark

---

## 🔐 Segurança

Arquivos sensíveis (já no `.gitignore`):

- `.env`
- `google-cloud-key.json`
- `logs/*.json`

---

## 💰 Custos

**FREE:**

- wttr.in (Clima) - Grátis
- OpenStreetMap (Rotas) - Grátis
- Gemini AI - 60 req/min grátis
- Google Cloud TTS - 1M chars/mês grátis

**Total:** R$ 0/mês (dentro do free tier)

---

## 🎯 Próximos Passos

### Frontend (Quando quiser)

- [ ] Dashboard web administrativo
- [ ] App mobile para QR scanning
- [ ] Relatórios visuais/gráficos

### Integrações

- [ ] Pistola QR USB
- [ ] Webhook Telegram/Discord
- [ ] Email notifications

---

## 📞 Suporte

Qualquer dúvida sobre o sistema, consulte a documentação ou os scripts de exemplo.

**Sistema 100% funcional e pronto para produção!** 🚀

---

**BRT Audiovisual** - Powered by Mark AI
