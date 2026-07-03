# 🤖 Mark - Agente IA da BRT Audiovisual

Mark é um agente de IA especializado em gerenciamento de estoque e logística para a BRT Audiovisual.

## 📋 Configuração Inicial

### 1. Adicionar API Key do Gemini

Edite o arquivo `.env` e cole sua chave da API Gemini:

```env
GEMINI_API_KEY=sua_chave_aqui
```

### 2. Iniciar Chat com Mark

```bash
node scripts/chat_agent.js
```

---

## 💬 Como Usar

### Comandos Especiais

- `/ajuda` - Lista de comandos
- `/limpar` - Limpar histórico
- `/sair` - Encerrar chat

### Exemplos de Perguntas

```
Você: Quanto temos em estoque de cabo XLR?
Você: Quais eventos temos na próxima semana?
Você: Lista de itens com estoque zerado
Você: Equipamentos do evento 566
Você: Itens da categoria ILUMINAÇÃO
Você: Quanto vale nosso inventário total?
```

---

## 🎯 Capacidades do Mark

### Dados que ele tem acesso

- ✅ **451 itens** do inventário completo
- ✅ **5 eventos** futuros com todos detalhes
- ✅ **20 equipamentos** por evento (quando disponível)

### O que Mark pode fazer

1. **Consultar Estoque**
   - Quantidade disponível
   - Valor de itens
   - Itens por categoria
   - Alertas de estoque baixo

2. **Gerenciar Eventos**
   - Listar eventos próximos
   - Equipamentos por evento
   - Verificar disponibilidade

3. **Análises e Relatórios**
   - Estatísticas de estoque
   - Valor total de inventário
   - Previsões de demanda

---

## 📂 Estrutura

```
agent/
├── config.js           # Configurações (API, modelo, caminhos)
├── system_prompt.txt   # Personalidade do Mark (EDITÁVEL)
└── index.js           # Código principal do agente

scripts/
└── chat_agent.js      # Interface de chat CLI
```

---

## ⚙️ Personalização

### Editar Personalidade

Abra `agent/system_prompt.txt` e customize:

- Tom de voz
- Responsabilidades
- Formato de respostas
- Regras específicas

### Ajustar Modelo

Em `agent/config.js`:

```javascript
geminiModel: 'gemini-2.0-flash-exp',  // Modelo
temperature: 0.7,                      // Criatividade
maxTokens: 2048                        // Tamanho resposta
```

---

## 🔧 Troubleshooting

### Erro: "GEMINI_API_KEY não configurada"

**Solução:** Adicione sua chave no `.env`

### Mark não responde

**Solução:** Verifique conexão de internet e validade da API key

### Respostas imprecisas

**Solução:** Edite `system_prompt.txt` com instruções mais específicas

---

## 📚 Dados Utilizados

Mark consulta automaticamente:

1. `logs/inventory_complete.json` (451 itens)
2. `logs/test_api_result.json` (5 eventos)
3. `logs/cache_equipamentos/evento_*.json` (equipamentos por evento)

---

## 🎉 Exemplo de Conversa

```
═══════════════════════════════════════
  🤖 MARK - Agente IA da BRT Audiovisual
═══════════════════════════════════════

✅ Mark inicializado com sucesso!

Você: Quanto temos de cabos XLR?

Mark: Encontrei os seguintes cabos XLR no estoque:

• CABO XLR SOM 3M - 6 unidades
• CABO XLR SOM 10M - 2 unidades  
• Cabo XLR SOM 5m - 4 unidades
• CABO MULTIVIAS XLR (vários) - 8 unidades

Total: 20 cabos XLR em estoque ✅
```

---

## 🚀 Próximos Passos

Após configurar a API key:

1. Execute `node scripts/chat_agent.js`
2. Digite suas perguntas
3. Customize `system_prompt.txt` conforme necessário

**Mark está pronto para usar!** 🎯
