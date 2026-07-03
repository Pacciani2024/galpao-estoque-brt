/**
 * Mark - Agente IA da BRT Audiovisual
 * Gerenciamento de Estoque e Logística
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const config = require('./config');
const ExternalAPIs = require('../modules/external_apis');
const ChartGenerator = require('./chart_generator');
const ImageGenerator = require('./image_generator');

class MarkAgent {
    constructor() {
        if (!config.geminiApiKey || config.geminiApiKey === 'COLE_SUA_CHAVE_AQUI') {
            throw new Error('GEMINI_API_KEY não configurada no .env');
        }

        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.geminiModel });
        this.externalAPIs = new ExternalAPIs();
        this.chartGenerator = new ChartGenerator();
        this.imageGenerator = new ImageGenerator(); // Chart.js não precisa de API key

        this.systemPrompt = this.loadSystemPrompt();
        this.conversationHistory = [];

        console.log(`✅ ${config.agentName} inicializado com sucesso!`);
        console.log(`🌐 APIs externas: Clima ✅ | Rotas ✅ | Frota ✅\n`);
    }

    loadSystemPrompt() {
        try {
            return fs.readFileSync(config.paths.systemPrompt, 'utf-8');
        } catch (error) {
            console.warn('⚠️ System prompt não encontrado, usando padrão');
            return `Você é ${config.agentName}, agente de IA da ${config.agentCompany}.`;
        }
    }

    loadInventory() {
        try {
            const data = JSON.parse(fs.readFileSync(config.paths.inventory, 'utf-8'));
            return data.items || [];
        } catch (error) {
            console.warn('⚠️ Inventário não encontrado');
            return [];
        }
    }

    async loadEvents() {
        try {
            // Buscar eventos da API ao vivo (não do cache)
            const fetch = require('node-fetch');
            const response = await fetch('http://localhost:3000/api/eventos');
            const data = await response.json();
            return data.eventos || []; // API retorna { eventos: [...] }
        } catch (error) {
            console.warn('⚠️ Erro ao buscar eventos da API, tentando cache...');
            try {
                const data = JSON.parse(fs.readFileSync(config.paths.events, 'utf-8'));
                return data.eventos || [];
            } catch (e) {
                return [];
            }
        }
    }

    loadEventEquipment(eventId) {
        try {
            const path = `${config.paths.eventEquipment}evento_${eventId}.json`;
            return JSON.parse(fs.readFileSync(path, 'utf-8'));
        } catch (error) {
            return null;
        }
    }

    loadSeparations() {
        try {
            const path = require('path');
            const separationsDir = path.join(__dirname, '../logs/tick_progress');
            if (!fs.existsSync(separationsDir)) return [];

            const files = fs.readdirSync(separationsDir);
            const separations = [];

            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(separationsDir, file), 'utf-8'));
                        separations.push(data);
                    } catch (e) { }
                }
            });

            return separations;
        } catch (error) {
            console.warn('⚠️ Separações não encontradas');
            return [];
        }
    }

    loadAllocations() {
        try {
            const data = JSON.parse(fs.readFileSync('./logs/alocacoes.json', 'utf-8'));
            return data.alocacoes || [];
        } catch (error) {
            return [];
        }
    }

    loadQRUnits() {
        try {
            const data = JSON.parse(fs.readFileSync('./logs/qr_units.json', 'utf-8'));
            return data.units || {};
        } catch (error) {
            return {};
        }
    }

    loadEventSeparations() {
        try {
            const data = JSON.parse(fs.readFileSync('./logs/event_separations.json', 'utf-8'));
            return data.separations || [];
        } catch (error) {
            return [];
        }
    }


    async buildContext() {
        const inventory = this.loadInventory();
        const events = await this.loadEvents(); // Agora é async
        const separations = this.loadSeparations();
        const allocations = this.loadAllocations();
        const qrUnits = this.loadQRUnits();
        const eventSeparations = this.loadEventSeparations();

        let context = `${this.systemPrompt}\n\n`;
        context += `## DADOS ATUALIZADOS DO SISTEMA\n\n`;

        // === INVENTÁRIO DETALHADO ===
        context += `### INVENTÁRIO COMPLETO\n`;
        context += `Total de itens cadastrados: ${inventory.length}\n\n`;

        // Agrupar por categoria
        const categories = [...new Set(inventory.map(i => i.categoria))];
        categories.forEach(cat => {
            const items = inventory.filter(i => i.categoria === cat);
            context += `**${cat}** (${items.length} tipos):\n`;
            items.forEach(item => {
                const estoque = item.estoque || 0;
                const manutencao = item.manutencao || 0;
                const alocado = item.alocado || 0;
                const disponivel = estoque - manutencao - alocado;

                context += `  - ${item.nome}: ${disponivel} disponível`;
                if (manutencao > 0) context += ` | ${manutencao} em manutenção`;
                if (alocado > 0) context += ` | ${alocado} alocado`;
                context += ` (Total: ${estoque})\n`;
            });
            context += `\n`;
        });

        // === ITENS EM MANUTENÇÃO ===
        const itemsInMaintenance = inventory.filter(i => (i.manutencao || 0) > 0);
        if (itemsInMaintenance.length > 0) {
            context += `### ITENS EM MANUTENÇÃO\n`;
            itemsInMaintenance.forEach(item => {
                context += `- ${item.nome}: ${item.manutencao} unidade(s)\n`;
            });
            context += `\n`;
        }

        // === EVENTOS PRÓXIMOS ===
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const futureEvents = events.filter(e => {
            const eventDate = new Date(e.dataevento);
            return eventDate >= today;
        }).sort((a, b) => new Date(a.dataevento) - new Date(b.dataevento));

        context += `### EVENTOS PRÓXIMOS (${futureEvents.length})\n`;
        if (futureEvents.length > 0) {
            futureEvents.forEach(e => {
                const date = new Date(e.dataevento).toLocaleDateString('pt-BR');
                const equipCount = e.equipamentos?.length || 0;
                context += `- **${e.nomeevento}** (ID: ${e.id})\n`;
                context += `  Data: ${date}\n`;
                context += `  Local: ${e.localevento || 'Não definido'}\n`;
                context += `  Equipamentos: ${equipCount} itens\n`;
                if (equipCount > 0 && e.equipamentos) {
                    context += `  Lista: ${e.equipamentos.slice(0, 5).map(eq => eq.nome).join(', ')}${equipCount > 5 ? '...' : ''}\n`;
                }
                context += `\n`;
            });
        } else {
            context += `Nenhum evento programado no momento.\n\n`;
        }

        // === EVENTOS DA SEMANA ===
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const weekEvents = futureEvents.filter(e => {
            const eventDate = new Date(e.dataevento);
            return eventDate >= today && eventDate <= nextWeek;
        });

        if (weekEvents.length > 0) {
            context += `### EVENTOS DESTA SEMANA (${weekEvents.length})\n`;
            weekEvents.forEach(e => {
                const date = new Date(e.dataevento).toLocaleDateString('pt-BR');
                context += `- ${e.nomeevento} em ${date}\n`;
            });
            context += `\n`;
        }

        // === ITENS NA RUA (SEPARADOS MAS NÃO DEVOLVIDOS) ===
        const itemsOut = [];
        separations.forEach(sep => {
            if (sep.separatedItems && sep.separatedItems.length > 0) {
                sep.separatedItems.forEach(item => {
                    const qtySeparada = item.qtySeparada || 0;
                    const qtyReturned = item.qtyReturned || 0;
                    const qtyNaRua = qtySeparada - qtyReturned;

                    if (qtyNaRua > 0) {
                        itemsOut.push({
                            nome: item.nome,
                            qty: qtyNaRua,
                            evento: sep.eventName,
                            eventId: sep.eventId
                        });
                    }
                });
            }
        });

        if (itemsOut.length > 0) {
            context += `### ITENS NA RUA (Separados e não devolvidos)\n`;
            context += `Total: ${itemsOut.length} tipos de equipamentos fora do galpão\n\n`;

            // Agrupar por evento
            const byEvent = {};
            itemsOut.forEach(item => {
                if (!byEvent[item.evento]) byEvent[item.evento] = [];
                byEvent[item.evento].push(item);
            });

            Object.keys(byEvent).forEach(eventName => {
                context += `**${eventName}:**\n`;
                byEvent[eventName].forEach(item => {
                    context += `  - ${item.nome}: ${item.qty} unidade(s)\n`;
                });
                context += `\n`;
            });
            context += `\n`;
        }

        // === DETALHAMENTO DE SEPARAÇÕES POR EVENTO ===
        if (separations.length > 0) {
            context += `### ITENS SEPARADOS POR EVENTO (Detalhado)\n`;
            separations.forEach(sep => {
                if (sep.separatedItems && sep.separatedItems.length > 0) {
                    context += `\n**${sep.eventName} (ID: ${sep.eventId}):**\n`;
                    sep.separatedItems.forEach(item => {
                        const qtySeparada = item.qtySeparada || 0;
                        const qtyReturned = item.qtyReturned || 0;
                        const qtyNaRua = qtySeparada - qtyReturned;
                        const status = qtyNaRua > 0 ? '🚚 Na rua' : '✅ Devolvido';
                        context += `  - ${item.nome}: ${qtySeparada} separados | ${qtyReturned} devolvidos | ${qtyNaRua} na rua ${status}\n`;
                    });
                }
            });
            context += `\n`;
        }

        context += `---\n\n`;
        context += `INSTRUÇÕES:\n`;
        context += `- Use APENAS os dados acima para responder\n`;
        context += `- Seja preciso e objetivo\n`;
        context += `- Se não souber, diga que não tem a informação\n`;
        context += `- Não invente dados\n`;
        context += `- Quando sugerir transferências, use o NOME EXATO do item conforme aparece nos dados\n\n`;

        return context;
    }

    async chat(userMessage) {
        try {
            // Adicionar contexto completo na primeira mensagem ou quando necessário
            const context = await this.buildContext();

            const fullPrompt = `${context}\nUsuário: ${userMessage}\n\nMark (responda de forma profissional e objetiva):`;

            const result = await this.model.generateContent(fullPrompt);
            const response = result.response.text();

            // Salvar histórico
            this.conversationHistory.push({
                user: userMessage,
                agent: response,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error) {
            console.error('Erro ao processar mensagem:', error.message);
            return `Desculpe, ocorreu um erro ao processar sua solicitação: ${error.message}`;
        }
    }

    /**
     * Gera gráfico dinâmico com dados atuais
     */
    async generateChart(type) {
        try {
            const inventory = this.loadInventory();
            const events = await this.loadEvents();

            let data, imagePath, filename;

            filename = this.chartGenerator.generateFilename(type);

            switch (type) {
                case 'top_items':
                    data = this.chartGenerator.getTopAllocatedItems(inventory, 10);
                    imagePath = await this.imageGenerator.generateTopItemsChart(data, filename);
                    break;

                case 'events_timeline':
                    data = this.chartGenerator.getEventsByMonth(events, 6);
                    imagePath = await this.imageGenerator.generateEventsTimelineChart(data, filename);
                    break;

                case 'inventory_status':
                    data = this.chartGenerator.getInventoryStatus(inventory);
                    imagePath = await this.imageGenerator.generateInventoryStatusChart(data, filename);
                    break;

                case 'top_categories':
                    data = this.chartGenerator.getTopCategories(inventory, 5);
                    imagePath = await this.imageGenerator.generateTopCategoriesChart(data, filename);
                    break;

                case 'available_vs_ticked':
                    data = this.chartGenerator.getAvailableVsTicked(inventory);
                    imagePath = await this.imageGenerator.generateAvailableVsTickedChart(data, filename);
                    break;

                case 'category_breakdown':
                    data = this.chartGenerator.getCategoryBreakdown(inventory);
                    imagePath = await this.imageGenerator.generateCategoryBreakdownChart(data, filename);
                    break;

                case 'utilization_rate':
                    data = this.chartGenerator.getUtilizationRate(inventory);
                    imagePath = await this.imageGenerator.generateUtilizationRateChart(data, filename);
                    break;

                case 'maintenance_items':
                    data = this.chartGenerator.getMaintenanceItems(inventory, 10);
                    imagePath = await this.imageGenerator.generateMaintenanceItemsChart(data, filename);
                    break;

                default:
                    return null;
            }

            if (!imagePath) {
                return null;
            }

            return {
                path: imagePath,
                filename: filename,
                type: type,
                data: data
            };

        } catch (error) {
            console.error('Erro ao gerar gráfico:', error);
            return null;
        }
    }

    async addItemsToSeparation(eventId, itemName, qty) {
        try {
            const progressFile = `logs/tick_progress/evento_${eventId}.json`;
            if (!fs.existsSync(progressFile)) {
                return `❌ Evento ID ${eventId} não foi encontrado na separação (arquivo não existe).`;
            }

            const data = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
            const qtyNum = parseInt(qty) || 1;

            // Procurar item existente
            let item = data.separatedItems.find(i => i.nome && i.nome.toLowerCase().includes(itemName.toLowerCase()));

            if (item) {
                // Atualizar existente
                item.qtySeparada = (item.qtySeparada || 0) + qtyNum;
                // Resetar status de devolvido se estiver adicionando mais
                if (item.returned) {
                    item.returned = false;
                    item.qtyReturned = 0; // Ou manter o que já voltou? Melhor resetar para obrigar a conferir tudo de novo? 
                    // Melhor: Manter qtyReturned, mas status 'returned' = false
                }
            } else {
                // Criar novo
                item = {
                    index: data.separatedItems.length,
                    nome: itemName,
                    categoria: 'Adicionado via Mark',
                    qty: qtyNum,
                    qtySeparada: qtyNum,
                    qtyReturned: 0,
                    returned: false,
                    qrCodes: ['Manual'] // Assumir manual por padrão
                };
                data.separatedItems.push(item);
            }

            // Atualizar timestamp e status
            data.lastUpdated = new Date().toISOString();
            // Se estava 'dispatched' (finalizado), volta para 'ready_for_checkout' ou mantém?
            // Se adicionou itens, provavelmente precisa separar.
            // Mas o usuário pediu "Mark no evento do itau adicione 10 xlr". 
            // Se já foi despachado, isso significa que "esqueceu"? Ou que vai levar mais?
            // Vou manter o status atual, apenas atualizando a lista.

            fs.writeFileSync(progressFile, JSON.stringify(data, null, 2));
            console.log(`🤖 Mark Action: Adicionados ${qtyNum}x ${itemName} ao evento ${eventId}`);

            return `✅ Adicionei ${qtyNum}x "${itemName}" ao evento "${data.eventName}". A lista foi atualizada!`;

        } catch (error) {
            console.error('Erro no addItemsToSeparation:', error);
            return `❌ Erro ao adicionar item: ${error.message}`;
        }
    }

    async chatWithData(userMessage, sessionContext = {}) {
        // Versão avançada que pode consultar dados específicos
        const inventory = this.loadInventory();
        const events = await this.loadEvents(); // Verifique se loadEvents() é async no seu código, ajustei na leitura anterior

        let dataContext = '';

        // === CONTEXTO DE SESSÃO (CORREÇÃO DE MEMÓRIA) ===
        if (sessionContext.currentEventId) {
            const activeEvent = events.find(e => String(e.id) === String(sessionContext.currentEventId));
            if (activeEvent) {
                dataContext += `\n════════════════════════════════════════\n`;
                dataContext += `📌 EVENTO ATUAL (FOCADO): ${activeEvent.nomeevento} (ID: ${activeEvent.id})\n`;
                dataContext += `Data: ${new Date(activeEvent.dataevento).toLocaleDateString('pt-BR')}\n`;
                dataContext += `O usuário está falando SOBRE ESTE EVENTO agora implicitly.\n`;
                dataContext += `════════════════════════════════════════\n`;
            }
        }

        // === NOVO: Carregar histórico de conversas para contexto ===
        try {
            if (fs.existsSync('logs/conversations.json')) {
                const convData = JSON.parse(fs.readFileSync('logs/conversations.json', 'utf-8'));
                const recentConversations = convData.conversations.slice(0, 5);

                if (recentConversations.length > 0) {
                    dataContext += `\n### HISTÓRICO DE CONVERSAS RECENTES:\n`;
                    recentConversations.forEach(conv => {
                        dataContext += `- Usuário: "${conv.userMessage}" | Mark: "${conv.markResponse.substring(0, 100)}..."\n`;
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao carregar histórico de conversas:', error.message);
        }

        // === NOVO: Carregar histórico de separações ===
        try {
            if (fs.existsSync('logs/event_separations.json')) {
                const sepData = JSON.parse(fs.readFileSync('logs/event_separations.json', 'utf-8'));
                const recentSeparations = sepData.separations.slice(0, 10);

                if (recentSeparations.length > 0) {
                    dataContext += `\n### HISTÓRICO DE SEPARAÇÕES RECENTES:\n`;
                    recentSeparations.forEach(sep => {
                        const date = new Date(sep.completedAt).toLocaleDateString('pt-BR');
                        dataContext += `- ${date}: ${sep.eventName} (${sep.completedItems}/${sep.totalItems} itens separados - ${sep.completionPercentage}%)\n`;
                    });

                    // Estatísticas de equipamentos mais usados
                    const allSeparatedItems = recentSeparations.flatMap(s => s.separatedItems);
                    const itemCounts = {};
                    allSeparatedItems.forEach(item => {
                        if (item.name) {
                            itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
                        }
                    });

                    const topItems = Object.entries(itemCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5);

                    if (topItems.length > 0) {
                        dataContext += `\n**Equipamentos mais separados recentemente:**\n`;
                        topItems.forEach(([name, count]) => {
                            dataContext += `  - ${name}: ${count}x\n`;
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao carregar histórico de separações:', error.message);
        }

        // Carregar unidades QR cadastradas
        let qrUnits = {};
        try {
            if (fs.existsSync('logs/qr_units.json')) {
                const qrData = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
                qrUnits = qrData.units || {};

                // Adicionar informações de QR units ao contexto
                if (inventory.length > 0) {
                    dataContext += `\n### UNIDADES QR CADASTRADAS (Relatório de Progresso):\n`;

                    inventory.forEach((item, index) => {
                        // Tentar buscar por ID primeiro (mais seguro), depois por índice
                        const itemId = String(item.id || '');
                        let units = [];

                        if (itemId && qrUnits[itemId]) {
                            units = qrUnits[itemId];
                        } else if (qrUnits[String(index)]) {
                            // Fallback legado para index
                            units = qrUnits[String(index)];
                        }

                        const estoque = parseInt(item.estoque) || 0;

                        // Só mostrar se tiver estoque definido (ignorar serviços/virtuais se houver)
                        if (estoque > 0) {
                            const cadastrados = units.length;

                            // Adicionar contagem de Lote (EAN)
                            let bulkQty = 0;
                            if (item.barcodeQuantities) {
                                Object.values(item.barcodeQuantities).forEach(q => bulkQty += (parseInt(q) || 0));
                            }
                            const totalCadastrado = cadastrados + bulkQty;

                            const faltam = estoque - totalCadastrado;
                            const progresso = Math.round((totalCadastrado / estoque) * 100);

                            const disponiveis = units.filter(u => u.status === 'disponivel').length + bulkQty; // Assumindo bulk sempre disponível? Não, mas simplificando.
                            const manutencao = units.filter(u => u.status === 'manutencao').length;

                            // Mostrar status se tiver algo notável (falta cadastrar, ou manutenção)
                            if (faltam > 0 || manutencao > 0) {
                                dataContext += `- ${item.nome} (${item.categoria}): ${totalCadastrado}/${estoque} cadastrados (${progresso}%) | ⚠️ Faltam ${faltam} | 🔧 ${manutencao} manut.\n`;
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao carregar QR units:', error.message);
        }

        // Se usuário mencionar número isolado (candidato a QR Code)
        const numberMatch = userMessage.match(/\b\d+\b/);
        if (numberMatch && qrUnits) {
            const qrQuery = numberMatch[0];
            let foundQR = null;
            let foundItemName = null;

            // Função helper para remover zeros à esquerda (ex: "0059" -> "59")
            const normalize = (str) => String(parseInt(str, 10));

            // Procurar em todas as unidades
            Object.keys(qrUnits).forEach(idx => {
                const units = qrUnits[idx];
                // Comparar normalizado
                const unit = units.find(u => normalize(u.qrCode) === normalize(qrQuery));

                if (unit) {
                    foundQR = unit;
                    const item = inventory[parseInt(idx)];
                    foundItemName = item ? item.nome : 'Item Desconhecido';
                }
            });

            if (foundQR) {
                dataContext += `\n### 🔍 RESULTADO DA BUSCA POR QR CODE "${qrQuery}":\n`;
                dataContext += `Este número pertençe a uma unidade física de: **${foundItemName}**.\n`;
                dataContext += `Status atual: ${foundQR.status.toUpperCase()}\n`;
                dataContext += `Última atualização: ${foundQR.timestamp}\n`;
                dataContext += `ATENÇÃO: Se o usuário perguntou "o que é X", provavelmente se refere a este item fisico, e não ao ID do sistema.\n`;
            }
        }

        // Se usuário mencionar "evento" ou "ID", incluir dados do evento
        if (userMessage.match(/evento|id\s*\d+/i)) {
            const eventMatch = userMessage.match(/\d+/);
            if (eventMatch) {
                const eventId = eventMatch[0];
                const eventEquip = this.loadEventEquipment(eventId);
                if (eventEquip) {
                    dataContext += `\n### Equipamentos do Evento ${eventId}:\n`;
                    dataContext += JSON.stringify(eventEquip.equipamentos, null, 2);
                }
            }
        }

        // Se usuário mencionar categoria específica
        const categoryMatch = userMessage.match(/categoria|iluminação|som|cabo|estrutura/i);
        if (categoryMatch) {
            const relevantItems = inventory.filter(i =>
                i.categoria.toLowerCase().includes(categoryMatch[0].toLowerCase()) ||
                i.nome.toLowerCase().includes(categoryMatch[0].toLowerCase())
            );
            if (relevantItems.length > 0) {
                dataContext += `\n### Itens Relevantes:\n`;
                dataContext += JSON.stringify(relevantItems.slice(0, 20), null, 2);
            }
        }

        const actionInstructions = `
\n### COMANDOS ESPECIAIS (USE APENAS SE NECESSÁRIO)
1. Para ADICIONAR itens a um evento em separação:
   Response final deve conter: [[ACTION:ADD_ITEM|ID_EVENTO|NOME_ITEM|QUANTIDADE]]

2. Quando o usuário MUDAR O FOCO para um evento específico (ex: "fale do evento X", "selecione o evento Y"):
   Response final deve conter: [[ACTION:SELECT_EVENT|ID_EVENTO]]

3. Quando o usuário pedir para marcar DEVOLUÇÃO (retorno) de itens:
   Response final deve conter: [[ACTION:MARK_RETURN|ID_EVENTO|ALL]] (para todos) ou [[ACTION:MARK_RETURN|ID_EVENTO|ITEM_NAME]]

Exemplo: Usuário diz "Adicione 10 cabos XLR no evento 162"
Resposta: Certo, adicionando... [[ACTION:ADD_ITEM|162|Cabo XLR|10]]
`;


        const context = await this.buildContext() + dataContext + actionInstructions;
        const fullPrompt = `${context}\nUsuário: ${userMessage}\n\nMark:`;

        try {
            const result = await this.model.generateContent(fullPrompt);
            let responseText = result.response.text();

            // PARSE ACITONS
            const actionRegex = /\[\[ACTION:ADD_ITEM\|(.*?)\|(.*?)\|(.*?)\]\]/;
            const match = responseText.match(actionRegex);

            if (match) {
                const eventId = match[1];
                const itemName = match[2];
                const qty = match[3];

                const actionResult = await this.addItemsToSeparation(eventId, itemName, qty);

                // Remover o código da resposta visível e adicionar o resultado real
                responseText = responseText.replace(match[0], '') + '\n\n' + actionResult;
            }

            return responseText;
        } catch (error) {
            return `Erro: ${error.message}`;
        }
    }

    getHistory() {
        return this.conversationHistory;
    }

    clearHistory() {
        this.conversationHistory = [];
        console.log('✅ Histórico limpo');
    }
}

module.exports = MarkAgent;
