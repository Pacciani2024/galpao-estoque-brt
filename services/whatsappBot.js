const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Caminhos dos logs
const LOGS_DIR = path.join(__dirname, '../logs/tick_progress');
const PENDENCIES_DIR = path.join(__dirname, '../logs/pendencias');
const WHITELIST_FILE = path.join(__dirname, '../data/whatsapp_whitelist.json');

// 🔒 WHITELIST DE NÚMEROS AUTORIZADOS
let client;
let authorizedNumbers = [];

// Memória de contexto por usuário (para respostas com números)
const userContexts = new Map();

function saveUserContext(phoneNumber, context) {
    userContexts.set(phoneNumber, {
        ...context,
        timestamp: Date.now()
    });

    // Limpar contextos antigos (mais de 5 minutos)
    setTimeout(() => {
        const now = Date.now();
        for (const [key, value] of userContexts.entries()) {
            if (now - value.timestamp > 5 * 60 * 1000) {
                userContexts.delete(key);
            }
        }
    }, 1000);
}

function getUserContext(phoneNumber) {
    const context = userContexts.get(phoneNumber);
    if (!context) return null;

    // Verificar se não expirou (5 minutos)
    if (Date.now() - context.timestamp > 5 * 60 * 1000) {
        userContexts.delete(phoneNumber);
        return null;
    }

    return context;
}

function loadWhitelist() {
    try {
        if (fs.existsSync(WHITELIST_FILE)) {
            const data = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
            authorizedNumbers = data.numbers || [];
            console.log(`🔒 Whitelist carregada: ${authorizedNumbers.length} números autorizados`);
        } else {
            // Criar arquivo padrão
            authorizedNumbers = [
                "5511999999999@c.us" // Exemplo - SUBSTITUA pelo número real
            ];
            fs.mkdirSync(path.dirname(WHITELIST_FILE), { recursive: true });
            fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ numbers: authorizedNumbers }, null, 2));
            console.log('⚠️  Whitelist criada. Edite data/whatsapp_whitelist.json para adicionar números!');
        }
    } catch (e) {
        console.error('Erro ao carregar whitelist:', e);
        authorizedNumbers = [];
    }
}

// Inicializar cliente
const isLinux = process.platform === 'linux';
let puppeteerArgs = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
};

if (isLinux) {
    const fs = require('fs');
    // Tentar encontrar o Chrome/Chromium no sistema
    const possiblePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    ];

    const executablePath = possiblePaths.find(path => fs.existsSync(path));

    if (executablePath) {
        console.log(`🐧 Linux detectado. Usando navegador do sistema: ${executablePath}`);
        puppeteerArgs.executablePath = executablePath;
    } else {
        console.warn('⚠️ Linux detectado mas nenhum navegador (Chrome/Chromium) foi encontrado nos caminhos padrão.');
        console.warn('⚠️ Se o bot falhar, instale o Chrome: sudo apt install google-chrome-stable');
    }
}

client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerArgs
});

client.on('qr', (qr) => {
    console.log('\n=============================================');
    console.log('📱 QR CODE DO WHATSAPP GERADO:');
    qrcode.generate(qr, { small: true });
    console.log('Escaneie com o app do celular para conectar!');
    console.log('=============================================\n');
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot conectado e pronto para receber comandos!');
    loadWhitelist();
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação do WhatsApp:', msg);
});

// Lógica Principal de Mensagens
client.on('message', async msg => {
    const senderNumber = msg.from;
    const text = msg.body.toLowerCase().trim();

    // 🔒 VERIFICAR SE O NÚMERO ESTÁ AUTORIZADO
    if (!authorizedNumbers.includes(senderNumber)) {
        console.log(`🚫 Mensagem bloqueada de número não autorizado: ${senderNumber}`);
        return; // Não responde para não revelar que o bot existe
    }

    console.log(`📩 Mensagem autorizada de ${senderNumber}: ${msg.body}`);

    // COMANDO 1: TRANSFERÊNCIA (TRANSBORDO) - Só se tiver formato completo
    const isCompleteTransfer = (text.startsWith('transferir de ') || text.startsWith('transbordo de ')) &&
        text.includes(' para ') && text.includes(':');

    if (isCompleteTransfer) {
        await handleTransfer(msg);
    }

    // COMANDO 2: SOBRA (RETORNO PARCIAL)
    else if (text.startsWith('sobra') || text.startsWith('retorno')) {
        await handleLeftovers(msg);
    }

    // COMANDO 3: STATUS
    else if (text.startsWith('status event')) {
        msg.reply('🚧 Comando em desenvolvimento!');
    }

    // COMANDO 4: GRÁFICOS
    else if (text.startsWith('grafico') || text.startsWith('gráfico') || text.startsWith('chart')) {
        await handleChartRequest(msg);
    }

    // COMANDO AJUDA
    else if (text === '!ajuda' || text === 'ajuda') {
        msg.reply('🤖 *Mark - Assistente BRT Audiovisual*\n\n*Comandos de Gestão:*\n1. *Transferir* de [Origem] para [Destino]: [Qtd] [Item]\n   Ex: Transferir de Casamento Joao para Balada Top: 4 extensao\n\n2. *Sobra* [Evento]: [Qtd] [Item]\n   Ex: Sobra Casamento Joao: 2 cabos\n\n3. *Gráfico* [tipo]\n   Ex: Gráfico itens mais usados\n   Ex: Gráfico eventos\n   Ex: Gráfico estoque\n\n4. *!ajuda* - Mostra esta mensagem\n\n*Conversa Livre:*\nPergunta qualquer coisa sobre o estoque, eventos ou equipamentos que eu respondo! 💬');
    }

    // 🤖 MARK AI - CONVERSA LIVRE
    else {
        await handleMarkConversation(msg);
    }
});

// 🤖 NOVA FUNÇÃO: Conversa com Mark AI
async function handleMarkConversation(msg) {
    try {
        const MarkAgent = require('../agent/index');
        const mark = new MarkAgent();

        msg.reply('🤔 Deixa eu pensar...');

        // Detectar se é uma resposta numérica (1, 2, 3, etc ou quantidade)
        const text = msg.body.trim();
        const isNumberResponse = /^\d+$/.test(text);

        if (isNumberResponse) {
            const context = getUserContext(msg.from);
            const number = parseInt(text);

            if (context) {
                // Caso 1: Seleção de opção (1, 2, 3...)
                if (context.options && context.options.length > 0) {
                    const choice = number - 1;
                    if (choice >= 0 && choice < context.options.length) {
                        const selected = context.options[choice];
                        msg.reply(`✅ ${selected}\n\nCopie e cole este comando!`);
                        userContexts.delete(msg.from);
                        return;
                    } else {
                        msg.reply(`❌ Opção inválida. Escolha entre 1 e ${context.options.length}`);
                        return;
                    }
                }

                // Caso 2: Resposta de quantidade (Mark perguntou "quantos?")
                if (context.type === 'quantity_question' && context.commandTemplate) {
                    // Substituir {QTD} pela quantidade informada
                    const command = context.commandTemplate.replace('{QTD}', number);
                    msg.reply(`🚚 Executando transferência de ${number} unidades...\n\n${command}`);

                    // Executar comando
                    const fakeMsg = {
                        body: command,
                        reply: (text) => msg.reply(text),
                        from: msg.from
                    };

                    userContexts.delete(msg.from);
                    await handleTransfer(fakeMsg);
                    return;
                }
            }
            // Se não tem contexto, deixa o Mark processar normalmente
        }

        // Detectar se é uma pergunta sobre transferência (sem comando completo)
        const textLower = text.toLowerCase();

        // FLUXO CONVERSACIONAL: Detectar se usuário quer transferir da lista anterior
        const context = getUserContext(msg.from);
        if (context && context.type === 'event_items_list' && textLower.match(/transferir|passar|mandar/)) {
            // Usuário quer transferir itens da lista que acabou de ver
            const destMatch = textLower.match(/para (?:o |a )?(.+?)$/i);
            if (destMatch) {
                const destEvent = destMatch[1].trim();

                // Salvar contexto de transferência pendente
                saveUserContext(msg.from, {
                    type: 'transfer_selection',
                    sourceEvent: context.eventName,
                    destEvent: destEvent,
                    items: context.items
                });

                let itemsList = '';
                context.items.forEach((item, idx) => {
                    itemsList += `${idx + 1}. ${item.nome}: ${item.quantidade} unidades\n`;
                });

                msg.reply(`📋 Quais itens transferir de *${context.eventName}* para *${destEvent}*?\n\n${itemsList}\nResponda com:\n- Número + quantidade (ex: "1 2un")\n- "todas" para todas\n- "nenhuma" para pular`);
                return;
            }
        }

        // FLUXO CONVERSACIONAL: Processar seleção de itens para transferir
        if (context && context.type === 'transfer_selection') {
            // Usuário está respondendo quais itens transferir
            const lines = text.split('\n');
            const transfers = [];

            lines.forEach(line => {
                const match = line.match(/^(\d+)\s+(.+)/);
                if (match) {
                    const itemIdx = parseInt(match[1]) - 1;
                    const qtyText = match[2].toLowerCase();

                    if (itemIdx >= 0 && itemIdx < context.items.length) {
                        const item = context.items[itemIdx];

                        if (qtyText === 'todas' || qtyText === 'tudo') {
                            transfers.push({ item: item.nome, qty: item.quantidade });
                        } else if (qtyText !== 'nenhuma' && qtyText !== 'nada') {
                            const qty = parseInt(qtyText);
                            if (!isNaN(qty) && qty > 0) {
                                transfers.push({ item: item.nome, qty: Math.min(qty, item.quantidade) });
                            }
                        }
                    }
                }
            });

            if (transfers.length === 0) {
                msg.reply('❌ Nenhum item válido selecionado. Tente novamente.');
                return;
            }

            // Executar transferências
            let summary = `🚚 Transferindo de *${context.sourceEvent}* para *${context.destEvent}*:\n\n`;
            for (const t of transfers) {
                summary += `- ${t.qty}x ${t.item}\n`;

                const command = `Transferir de ${context.sourceEvent} para ${context.destEvent}: ${t.qty} ${t.item}`;
                const fakeMsg = {
                    body: command,
                    reply: () => { }, // Silent
                    from: msg.from
                };
                await handleTransfer(fakeMsg);
            }

            summary += `\n✅ Transferências concluídas!`;
            msg.reply(summary);
            userContexts.delete(msg.from);
            return;
        }

        const isTransferQuestion = textLower.match(/\b(transferir|transbordo|passar|mandar)\b/) &&
            !textLower.startsWith('transferir de ') &&
            !textLower.startsWith('transbordo de ');

        let whatsappPrompt;

        if (isTransferQuestion) {
            // Adicionar instrução específica para sugerir comando de transferência
            whatsappPrompt = `[MODO WHATSAPP ATIVADO - Responda de forma CONCISA e DIRETA]

O usuário quer fazer uma transferência mas não especificou o comando completo.

Pergunta: ${msg.body}

INSTRUÇÕES:
1. Identifique os eventos de origem e destino
2. **IMPORTANTE**: Só sugira itens que estão NA RUA (já saíram do galpão)
3. Verifique nos dados "ITENS SEPARADOS POR EVENTO" quais itens têm "🚚 Na rua"
4. Se houver APENAS 1 tipo de item na rua:
   - Se o usuário NÃO especificou quantidade, pergunte: "Quantas unidades?"
   - Se o usuário especificou quantidade, sugira o comando completo
5. Se houver múltiplas opções, liste todas numeradas

FORMATO DA RESPOSTA (1 opção, sem quantidade):
✅ [Evento Origem] tem na rua:
- [Nome Exato Item]: X unidades

Quantas unidades você quer transferir?

FORMATO DA RESPOSTA (1 opção, com quantidade):
Transferir de [Evento Origem] para [Evento Destino]: [Qtd] [Nome Exato do Item]

FORMATO DA RESPOSTA (múltiplas opções):
✅ [Evento Origem] tem na rua:
1. [Nome Item 1]: X unidades
2. [Nome Item 2]: Y unidades

Qual opção?`;
        } else {
            // Pergunta normal
            whatsappPrompt = `[MODO WHATSAPP ATIVADO - Responda de forma CONCISA e DIRETA]\n\n${msg.body}`;
        }

        // --- CONTEXTO DE SESSÃO ---
        let sessionContext = getUserContext(msg.from) || {};
        // Passar ID do evento atual para manter o foco

        const response = await mark.chatWithData(whatsappPrompt, {
            currentEventId: sessionContext.currentEventId
        });

        // --- PROCESSAR AÇÕES DO MARK ---
        let finalResponse = response;

        // 1. SELECT_EVENT Action
        const selectActionRegex = /\[\[ACTION:SELECT_EVENT\|(\d+)\]\]/;
        const selectMatch = response.match(selectActionRegex);

        if (selectMatch) {
            const newEventId = selectMatch[1];

            // Atualizar contexto persistente
            sessionContext = {
                ...sessionContext,
                currentEventId: newEventId,
                timestamp: Date.now()
            };
            saveUserContext(msg.from, sessionContext);
            console.log(`📌 Contexto de ${msg.from} atualizado para Evento ID: ${newEventId}`);

            // Remover action da resposta visual
            finalResponse = finalResponse.replace(selectMatch[0], '');
        }

        // 2. Limpar outras actions visuais
        finalResponse = finalResponse.replace(/\[\[ACTION:.*?\]\]/g, '');

        // WhatsApp tem limite de ~4000 caracteres por mensagem
        if (finalResponse.length > 4000) {
            const chunks = finalResponse.match(/.{1,4000}/g);
            for (const chunk of chunks) {
                await msg.reply(chunk);
                await new Promise(r => setTimeout(r, 500));
            }
        } else {
            msg.reply(finalResponse.trim());
        }

        // Extrair e salvar opções se a resposta contém comandos numerados
        const commandMatches = response.match(/Transferir de .+ para .+: \d+ .+/g);
        if (commandMatches && commandMatches.length > 0) {
            // Se há apenas 1 opção, executar automaticamente
            if (commandMatches.length === 1) {
                const command = commandMatches[0];
                msg.reply(`🚚 Executando transferência automaticamente...\n\n${command}`);

                // Criar mensagem fake para executar o comando
                const fakeMsg = {
                    body: command,
                    reply: (text) => msg.reply(text),
                    from: msg.from
                };

                await handleTransfer(fakeMsg);
                return; // Não salvar contexto nem enviar resposta duplicada
            } else {
                // Múltiplas opções - salvar contexto
                saveUserContext(msg.from, {
                    type: 'transfer_options',
                    options: commandMatches
                });
            }
        }

        // Detectar se Mark está perguntando quantidade
        if (response.match(/quantas unidades|qual a quantidade|quantos você quer/i)) {
            // Extrair informações da resposta para montar template
            const itemMatch = response.match(/- (.+?):/);
            const originMatch = msg.body.match(/do (.+?) para/i) || msg.body.match(/de (.+?) para/i);
            const destMatch = msg.body.match(/para (.+?)$/i) || msg.body.match(/para o (.+?)$/i);

            if (itemMatch && originMatch && destMatch) {
                const itemName = itemMatch[1].trim();
                const origin = originMatch[1].trim();
                const dest = destMatch[1].trim();

                const template = `Transferir de ${origin} para ${dest}: {QTD} ${itemName}`;

                saveUserContext(msg.from, {
                    type: 'quantity_question',
                    commandTemplate: template
                });
            }
        }

        // Detectar se Mark listou itens de um evento (para fluxo conversacional)
        const eventListMatch = response.match(/📦 (.+?) tem:|📅 (.+?) \(ID/);
        if (eventListMatch) {
            const eventName = eventListMatch[1] || eventListMatch[2];
            const items = [];

            // Extrair itens da resposta
            const itemMatches = response.matchAll(/(?:^|\n)(?:\d+\.\s*)?(.+?):\s*(\d+)\s*unidade/gm);
            for (const match of itemMatches) {
                items.push({
                    nome: match[1].trim(),
                    quantidade: parseInt(match[2])
                });
            }

            if (items.length > 0) {
                saveUserContext(msg.from, {
                    type: 'event_items_list',
                    eventName: eventName.trim(),
                    items: items
                });
            }
        }

    } catch (e) {
        console.error('Erro no Mark AI:', e);
        msg.reply('❌ Desculpa, tive um problema ao processar sua pergunta. Tenta de novo?');
    }
}

// 📊 NOVA FUNÇÃO: Gerar Gráficos
async function handleChartRequest(msg) {
    try {
        const MessageMedia = require('whatsapp-web.js').MessageMedia;
        const MarkAgent = require('../agent/index');
        const mark = new MarkAgent();
        const fs = require('fs');

        const text = msg.body.toLowerCase().replace(/[áàâã]/g, 'a').replace(/[éê]/g, 'e').replace(/[íî]/g, 'i').replace(/[óôõ]/g, 'o').replace(/[úû]/g, 'u').replace(/ç/g, 'c');
        let chartType;

        // Identificar tipo de gráfico solicitado (tolerante a erros)
        if (text.match(/\b(qr|tickad|disponiv)/)) {
            chartType = 'available_vs_ticked';
        } else if (text.match(/\b(luz|som|video|audio|sonorizacao|iluminacao)/)) {
            chartType = 'category_breakdown';
        } else if (text.match(/\b(utiliz|taxa|uso|ocupacao)/)) {
            chartType = 'utilization_rate';
        } else if (text.match(/\b(manut|reparo|consert)/)) {
            chartType = 'maintenance_items';
        } else if (text.match(/\b(iten|item|mais|usad|top|alocad)/)) {
            chartType = 'top_items';
        } else if (text.match(/\b(event|timeline)/)) {
            chartType = 'events_timeline';
        } else if (text.match(/\b(estoqu|inventar|status)/)) {
            chartType = 'inventory_status';
        } else if (text.match(/\b(categor)/)) {
            chartType = 'top_categories';
        } else {
            msg.reply('📊 *Gráficos Disponíveis:*\n\n*Básicos:*\n1. Gráfico itens mais usados\n2. Gráfico eventos\n3. Gráfico estoque\n4. Gráfico categorias\n\n*Avançados:*\n5. Gráfico QR codes\n6. Gráfico luz som video\n7. Gráfico taxa de utilização\n8. Gráfico manutenção\n\nQual você quer?');
            return;
        }

        msg.reply('📊 Gerando gráfico com dados atuais...');

        // Gerar gráfico
        const result = await mark.generateChart(chartType);

        if (!result) {
            msg.reply('❌ Erro ao gerar gráfico. Tente novamente.');
            return;
        }

        // Enviar imagem
        const media = MessageMedia.fromFilePath(result.path);
        await msg.reply(media);

        // Enviar resumo dos dados
        let summary = '';
        switch (chartType) {
            case 'top_items':
                summary = `📦 *Top ${result.data.length} Itens Mais Alocados*\n`;
                result.data.slice(0, 5).forEach((item, i) => {
                    summary += `${i + 1}. ${item.nome}: ${item.quantidade} un.\n`;
                });
                break;
            case 'events_timeline':
                const total = result.data.reduce((sum, d) => sum + d.quantidade, 0);
                summary = `📅 *Eventos (últimos 6 meses)*\nTotal: ${total} eventos`;
                break;
            case 'inventory_status':
                summary = `📊 *Status do Inventário*\n✅ Disponível: ${result.data.disponivel}\n📦 Alocado: ${result.data.alocado}\n🔧 Manutenção: ${result.data.manutencao}`;
                break;
            case 'top_categories':
                summary = `📂 *Top ${result.data.length} Categorias*\n`;
                result.data.forEach((cat, i) => {
                    summary += `${i + 1}. ${cat.categoria}: ${cat.alocado} alocados\n`;
                });
                break;
        }

        if (summary) {
            await msg.reply(summary);
        }

    } catch (e) {
        console.error('Erro ao gerar gráfico:', e);
        msg.reply('❌ Erro ao gerar gráfico. Verifique os logs do servidor.');
    }
}

// --- FUNÇÃO DE TRANSFERÊNCIA ---
async function handleTransfer(msg) {
    try {
        // Formato esperado: "Transferir de X para Y: itens..."
        const content = msg.body.split(':');
        if (content.length < 2) return msg.reply('❌ Formato inválido.\nUse: "Transferir de [Origem] para [Destino]: [Itens]"');

        const header = content[0].toLowerCase();
        const itemsStr = content[1];

        // Extrair nomes dos eventos
        // "transferir de evento A para evento B"
        const parts = header.split(' para ');
        if (parts.length < 2) return msg.reply('❌ Defina origem e destino com "para". Ex: "Transferir de A para B"');

        let sourceName = parts[0].replace('transferir', '').replace('transbordo', '').replace(' de ', '').trim();
        let targetName = parts[1].trim();

        const sourceEvent = findEventFile(sourceName);
        const targetEvent = findEventFile(targetName);

        if (!sourceEvent) return msg.reply(`❌ Evento de origem não encontrado: "${sourceName}"`);
        if (!targetEvent) return msg.reply(`❌ Evento de destino não encontrado: "${targetName}"`);

        // Processar itens
        const itemsToTransfer = parseItems(itemsStr);
        let report = `🚚 *Transferência Processada*\nDe: ${sourceEvent.eventName}\nPara: ${targetEvent.eventName}\n\n`;
        let pendencies = [];
        let itemsTransferedCount = 0;

        // Inicializar arrays se não existirem
        if (!sourceEvent.separatedItems) sourceEvent.separatedItems = [];
        if (!targetEvent.separatedItems) targetEvent.separatedItems = [];

        itemsToTransfer.forEach(reqItem => {
            // Procurar item na origem
            // A busca aqui tenta ser flexível (contains)
            const sourceItemIndex = sourceEvent.separatedItems.findIndex(i => i.nome.toLowerCase().includes(reqItem.name));
            const sourceItem = sourceItemIndex !== -1 ? sourceEvent.separatedItems[sourceItemIndex] : null;

            if (sourceItem) {
                const qtdOrigem = sourceItem.qtySeparada || 0; // O que foi separado/está no evento

                // Verificar disponibilidade
                if (qtdOrigem >= reqItem.qty) {
                    report += `✅ ${reqItem.qty}x ${sourceItem.nome}\n`;
                } else {
                    const diff = reqItem.qty - qtdOrigem;
                    pendencies.push(`${diff}x ${sourceItem.nome} (Solicitado ${reqItem.qty}, tinha ${qtdOrigem})`);
                    if (qtdOrigem > 0) report += `⚠️ Apenas ${qtdOrigem}x ${sourceItem.nome} transferidos (Faltaram ${diff})\n`;
                    else report += `❌ ${sourceItem.nome} não disponível para transferência (Qtd: 0)\n`;
                }

                // Efetivar a transferência (Lógica: Remove da origem, Adiciona no destino)
                // Na origem, marcamos como Returned/Transferido ou decrementamos?
                // O usuário sugeriu: "sourceItem.qtyReturned += qty". Isso faz sentido para rastreabilidade.

                const qtyToMove = Math.min(reqItem.qty, qtdOrigem);

                if (qtyToMove > 0) {
                    sourceItem.qtyReturned = (sourceItem.qtyReturned || 0) + qtyToMove;
                    if (sourceItem.qtyReturned >= (sourceItem.quantidade || sourceItem.qtySeparada)) {
                        sourceItem.returned = true; // Marca como devolvido na origem
                    }

                    // Adicionar no destino
                    let targetItem = targetEvent.separatedItems.find(i => i.nome === sourceItem.nome);
                    if (targetItem) {
                        targetItem.qtySeparada = (targetItem.qtySeparada || 0) + qtyToMove;
                    } else {
                        // Se não existe no destino, cria.
                        // Importante: qtySeparada aqui significa "já está com o evento destino"
                        targetEvent.separatedItems.push({
                            ...sourceItem,
                            qtySeparada: qtyToMove,
                            qtyReturned: 0,
                            returned: false,
                            transferredFrom: sourceEvent.eventName // Metadata útil
                        });
                    }
                    itemsTransferedCount++;
                }

            } else {
                report += `❌ Item "${reqItem.name}" não encontrado na origem.\n`;
            }
        });

        if (itemsTransferedCount > 0) {
            saveEventFile(sourceEvent);
            saveEventFile(targetEvent);

            if (pendencies.length > 0) {
                report += `\n⚠️ *PENDÊNCIAS (Faltou na Origem):*\n${pendencies.join('\n')}`;
                savePendency(sourceEvent.eventName, targetEvent.eventName, pendencies);
            }

            msg.reply(report);
        } else {
            msg.reply('❌ Nenhum item foi transferido. Verifique os nomes e quantidades.');
        }

    } catch (e) {
        console.error('Erro no handleTransfer:', e);
        msg.reply('❌ Erro interno ao processar transferência.');
    }
}

// --- FUNÇÃO DE SOBRAS ---
async function handleLeftovers(msg) {
    try {
        // Formato: "Sobra [Evento]: [Itens]"
        const content = msg.body.split(':');
        if (content.length < 2) return msg.reply('❌ Formato inválido.\nUse: "Sobra [Evento]: [Itens]"');

        const header = content[0].toLowerCase();
        const itemsStr = content[1];

        const eventName = header.replace('sobra', '').replace('retorno', '').replace(' de ', '').trim();
        const eventData = findEventFile(eventName);

        if (!eventData) return msg.reply(`❌ Evento não encontrado: "${eventName}"`);

        const itemsToReturn = parseItems(itemsStr);
        let report = `📦 *Retorno de Sobra Processado*\nEvento: ${eventData.eventName}\n\n`;
        let count = 0;

        if (!eventData.separatedItems) eventData.separatedItems = [];

        itemsToReturn.forEach(reqItem => {
            const item = eventData.separatedItems.find(i => i.nome.toLowerCase().includes(reqItem.name));
            if (item) {
                const currentReturned = item.qtyReturned || 0;
                const maxReturnable = (item.qtySeparada || 0) - currentReturned;

                let qtyToReturn = reqItem.qty;
                if (qtyToReturn > maxReturnable) {
                    report += `⚠️ ${item.nome}: Tentou retornar ${qtyToReturn}, mas só tinha ${maxReturnable} pendentes. Retornado tudo.\n`;
                    qtyToReturn = maxReturnable;
                } else {
                    report += `✅ ${qtyToReturn}x ${item.nome} devolvidos.\n`;
                }

                if (qtyToReturn > 0) {
                    item.qtyReturned = (item.qtyReturned || 0) + qtyToReturn;
                    if (item.qtyReturned >= (item.quantidade || item.qtySeparada)) {
                        item.returned = true;
                    }
                    count++;
                }
            } else {
                report += `❌ Item "${reqItem.name}" não encontrado no evento.\n`;
            }
        });

        if (count > 0) {
            saveEventFile(eventData);
            msg.reply(report);
        } else {
            msg.reply('❌ Nenhuma sobra registrada (itens não encontrados ou quantidades zeradas).');
        }

    } catch (e) {
        console.error('Erro no handleLeftovers:', e);
        msg.reply('❌ Erro interno ao processar sobra.');
    }
}

// --- UTILITÁRIOS ---

function findEventFile(partialName) {
    try {
        if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

        const files = fs.readdirSync(LOGS_DIR);
        // Prioridade 1: Match exato de ID no nome do arquivo (ex: "evento_123.json")
        for (const file of files) {
            if (file === `evento_${partialName}.json`) {
                return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8'));
            }
        }

        // Prioridade 2: Match parcial no nome do evento dentro do JSON
        for (const file of files) {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8'));
                if (content.eventName && content.eventName.toLowerCase().includes(partialName.toLowerCase())) {
                    return content;
                }
            } catch (err) {
                console.error(`Erro ao ler arquivo ${file}:`, err);
            }
        }
    } catch (e) {
        console.error('Erro ao procurar evento:', e);
    }
    return null;
}

function saveEventFile(eventData) {
    if (!eventData.eventId) return;
    const filePath = path.join(LOGS_DIR, `evento_${eventData.eventId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(eventData, null, 2));
}

function savePendency(source, target, items) {
    if (!fs.existsSync(PENDENCIES_DIR)) fs.mkdirSync(PENDENCIES_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `pendencia_${source}_para_${target}_${timestamp}.txt`;

    const content = `PENDÊNCIA DE TRANSFERÊNCIA\nData: ${new Date().toLocaleString()}\nDe: ${source}\nPara: ${target}\n\nITENS FALTANTES:\n${items.join('\n')}`;

    fs.writeFileSync(path.join(PENDENCIES_DIR, filename), content);
}

function parseItems(str) {
    // Ex: "4 extensao, 2 caixas" -> [{qty: 4, name: 'extensao'}, {qty: 2, name: 'caixas'}]
    if (!str) return [];
    return str.split(',').map(s => {
        s = s.trim();
        const parts = s.split(' ');
        // Tenta pegar o primeiro número
        let qty = parseInt(parts[0]);
        let name = '';

        if (isNaN(qty)) {
            // Se não começou com número, assume 1 (ex: "extensao, caixa")
            qty = 1;
            name = s.toLowerCase();
        } else {
            // Pega o resto como nome
            name = parts.slice(1).join(' ').toLowerCase();
        }
        return { qty, name };
    });
}

module.exports = { client };
