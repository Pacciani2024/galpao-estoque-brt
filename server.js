// Ajuste de caminhos para quando rodar via executável (pkg)
if (typeof process.pkg !== 'undefined') {
    const path = require('path');
    process.chdir(path.dirname(process.execPath));
    console.log(`🚀 Ambiente compilado detectado. CWD alterado para: ${process.cwd()}`);
}

require('dotenv').config();

// Servidor Backend Principal
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const MarkAgent = require('./agent/index');

const app = express();
// Railway/Vercel/produção injetam a porta via variável de ambiente.
// Localmente cai no 3000 (comportamento original).
const PORT = process.env.PORT || 3000;

// Bootstrap: garante que as pastas de dados/logs existam.
// Containers (Railway) começam SEM essas pastas (logs/ é gitignored), e vários
// pontos do código gravam nelas no boot — sem isto o processo quebra com ENOENT.
['logs', 'logs/backups', 'logs/cache_equipamentos', 'logs/tick_progress', 'logs/screenshots', 'data', 'public/charts'].forEach(dir => {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* já existe */ }
});

// Seed: se o Volume estiver vazio (primeiro boot), copia os dados iniciais do seed/.
// Isso garante que inventory_complete.json e qr_units.json existam mesmo num container novo.
const SEED_FILES = ['inventory_complete.json', 'qr_units.json'];
SEED_FILES.forEach(file => {
    const dest = path.join('logs', file);
    const src  = path.join('seed', file);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
        try {
            fs.copyFileSync(src, dest);
            console.log(`🌱 Seed: copiado ${file} → logs/`);
        } catch (e) {
            console.warn(`⚠️  Seed: falha ao copiar ${file}:`, e.message);
        }
    }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Log de requisições DEPURACAO
app.use((req, res, next) => {
    console.log(`📡 [${req.method}] ${req.url}`);
    next();
});

// Endpoint de teste de conectividade
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong', serverTime: new Date().toISOString() });
});

// Inicializar Mark
let mark;
try {
    mark = new MarkAgent();
    console.log('✅ Mark inicializado com sucesso!\n');
} catch (error) {
    console.error('❌ Erro ao inicializar Mark:', error.message);
    console.log('💡 Configure GEMINI_API_KEY no .env\n');
}



// Inicializar WhatsApp Bot
// Em ambientes cloud (Railway) o WhatsApp Web precisa de Chrome + sessão persistente
// e trava o boot. Desligue com ENABLE_WHATSAPP=false. Local continua ligado por padrão.
if (process.env.ENABLE_WHATSAPP !== 'false') {
    try {
        const { client: whatsappClient } = require('./services/whatsappBot');
        whatsappClient.initialize();
    } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp Bot:', error.message);
    }
} else {
    console.log('ℹ️ WhatsApp Bot desativado (ENABLE_WHATSAPP=false).');
}

// Endpoint de chat
// Variável global para armazenar a última resposta de voz (para o frontend buscar)
let lastVoiceResponse = null;

app.post('/api/chat', async (req, res) => {
    const { message, source } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    if (!mark) {
        return res.status(500).json({
            error: 'Mark não está inicializado. Configure GEMINI_API_KEY no .env'
        });
    }

    try {
        console.log(`📝 Pergunta: ${message} [Fonte: ${source || 'Web'}]`);
        const response = await mark.chatWithData(message);
        console.log(`🤖 Resposta: ${response.substring(0, 100)}...\n`);

        // Se a origem for o módulo de voz, salvar para o frontend falar
        if (source === 'voice_module') {
            lastVoiceResponse = {
                text: response,
                timestamp: Date.now()
            };
        }

        res.json({ response });
    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para o Frontend buscar respostas de voz pendentes (Polling)
app.get('/api/chat/last-response', (req, res) => {
    res.json(lastVoiceResponse || {});
    // Limpar após enviar para não repetir (ou o frontend gerencia por timestamp)
    lastVoiceResponse = null;
});

// Carregar chaves de acesso
let accessKeys = [];
const loadAccessKeys = () => {
    try {
        if (fs.existsSync('data/access_keys.json')) {
            const data = JSON.parse(fs.readFileSync('data/access_keys.json', 'utf-8'));
            accessKeys = data.keys || [];
        } else {
            // Criar padrão se não existir
            accessKeys = [{ name: "Vinicius", "key": "admin" }, { name: "Equipe", "key": "1234" }];
            fs.writeFileSync('data/access_keys.json', JSON.stringify({ keys: accessKeys }, null, 2));
        }
    } catch (e) {
        console.error('Erro ao carregar chaves de acesso:', e.message);
    }
};
loadAccessKeys();

// Endpoint de Verificação de Credencial
app.post('/api/verify-access', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Chave obrigatória' });

    const user = accessKeys.find(u => u.key === key);
    if (user) {
        res.json({ success: true, name: user.name });
    } else {
        res.json({ success: false, error: 'Chave inválida' });
    }
});

// Endpoint de TTS (Google Cloud)
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Texto é obrigatório' });
    }

    try {
        const textToSpeech = require('@google-cloud/text-to-speech');
        const client = new textToSpeech.TextToSpeechClient({
            keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
        });

        const request = {
            input: { text },
            voice: {
                languageCode: 'pt-BR',
                name: 'pt-BR-Neural2-C', // Voz feminina neural (melhor qualidade)
                ssmlGender: 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: 1.1,
                pitch: 0.0
            }
        };

        const [response] = await client.synthesizeSpeech(request);

        res.set('Content-Type', 'audio/mpeg');
        res.send(response.audioContent);

        console.log('🔊 Áudio gerado com sucesso');
    } catch (error) {
        console.error('Erro TTS:', error.message);
        // Fallback: retornar erro para usar TTS do navegador
        res.status(500).json({
            error: 'TTS indisponível. Configure Google Cloud.',
            fallback: true
        });
    }
});

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Páginas
app.get('/eventos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'eventos.html'));
});

app.get('/inventario', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inventario.html'));
});

app.get('/cadastro-qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cadastro-qr.html'));
});

app.get('/separacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'separacao.html'));
});

app.get('/pendencias', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pendencias.html')); // NOVA ROTA
});

app.get('/etiquetas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'etiquetas.html'));
});

app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

// ====== API ENDPOINTS ======

// Stats
// Stats
app.get('/api/stats', (req, res) => {
    try {
        const inventory = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));
        // Fix: graceful fallback quando merge ainda não gerou o arquivo no boot
        let eventos = { eventos: [] };
        try {
            eventos = JSON.parse(fs.readFileSync('logs/eventos_completos.json', 'utf-8'));
        } catch (_) { /* arquivo ainda não existe — aguardando primeiro merge do scheduler */ }

        // Calcular itens EM USO (Dispatched)
        let totalEmUso = 0;
        const progressDir = 'logs/tick_progress';
        if (fs.existsSync(progressDir)) {
            const files = fs.readdirSync(progressDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
                    // Considerar itens em uso se dispatched OR returned_partial
                    if (data.status === 'dispatched' || data.status === 'returned_partial') {
                        // Para returned_partial, somar apenas o que NÃO foi devolvido ainda?
                        // Simplificação: Se status é returned_partial, assumimos que itens não marcados como returned estão em uso.
                        data.separatedItems.forEach(item => {
                            // Se status for dispatched, tudo conta. Se for partial, só o que não retornou.
                            if (data.status === 'dispatched' || (data.status === 'returned_partial' && !item.returned)) {
                                totalEmUso += (item.qtyReturned || item.qtySeparada || 0);
                            }
                        });
                    }
                }
            }
        }

        // Calcular Itens em MANUTENÇÃO
        let manutencao = 0;
        if (fs.existsSync('logs/qr_units.json')) {
            const qrData = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
            if (qrData.units) {
                Object.values(qrData.units).forEach(unitList => {
                    unitList.forEach(u => {
                        if (u.status === 'manutencao') {
                            manutencao++;
                        }
                    });
                });
            }
        }

        const totalGeral = inventory.items.length;
        // Disponível agora desconta também a manutenção
        // Nota: totalGeral aqui é contagem de TIPOS de itens ou SOMA de estoques?
        // inventory.items.length é Tipos de Itens. totalEmUso é quantidade de unidades. 
        // Essa comparação parece incompatível (Tipos vs Unidades).
        // Vamos corrigir para contar Total de UNIDADES em estoque se possível, ou manter a lógica atual se for "Total de Ativos" abstrato.
        // O Dashboard parece misturar conceitos. Se "Total Itens" for "Tipos", então "Em Uso" deveria ser tipos também? Não.
        // Vamos assumir que Total Geral deveria ser a SOMA dos estoques.

        let totalEstoqueFisico = 0;
        let totalInsumos = 0;

        inventory.items.forEach(i => {
            const stock = (parseInt(i.estoque) || 0);
            totalEstoqueFisico += stock;

            // Calcular Insumos separadamente
            if (i.categoria && i.categoria.toLowerCase().includes('insumo')) {
                totalInsumos += stock;
            }
        });

        // Disponível = Total - EmUso - Manutenção - Insumos
        // Nota: Assumindo que Insumos contam no estoque físico mas não devem aparecer no Disponível de locação.
        const disponivel = totalEstoqueFisico - totalEmUso - manutencao - totalInsumos;

        res.json({
            totalItens: totalEstoqueFisico, // Total geral incluindo insumos
            emUso: totalEmUso,
            disponivel: disponivel > 0 ? disponivel : 0,
            manutencao: manutencao,
            insumos: totalInsumos, // Novo campo
            eventosAtivos: eventos.eventos.length
        });
    } catch (error) {
        console.error('Erro stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Eventos (dinâmico - busca da API + merge com cache)
app.get('/api/eventos', async (req, res) => {
    try {
        const MeEventosAPI = require('./modules/api');
        const api = new MeEventosAPI();

        // Buscar eventos da API (sempre atualizado!)
        const eventos = await api.getUpcomingEvents();

        // Tentar carregar equipamentos do cache
        const eventosCompletos = eventos.map(evento => {
            // Regra: identificar eventos por idorcamento (ID do orçamento), fallback para id
            const eventoKey = evento.idorcamento || evento.id;
            const cacheFile = `./logs/cache_equipamentos/evento_${eventoKey}.json`;
            let equipamentos = [];
            let totalEquipamentos = 0;

            if (fs.existsSync(cacheFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                    equipamentos = data.equipamentos || [];
                    totalEquipamentos = data.total || 0;
                } catch (e) { }
            }

            // Verificar se existe progresso salvo para sobrepor status (ex: dispatched/returned)
            // Busca por idorcamento primeiro, depois fallback para id (retrocompat)
            let progressFile = `./logs/tick_progress/evento_${eventoKey}.json`;
            if (!fs.existsSync(progressFile) && eventoKey !== evento.id) {
                progressFile = `./logs/tick_progress/evento_${evento.id}.json`;
            }
            let localStatus = null;
            if (fs.existsSync(progressFile)) {
                try {
                    const progData = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
                    if (progData.status && progData.status !== 'in_progress') {
                        localStatus = progData.status;
                    }
                } catch (e) { }
            }

            return {
                ...evento,
                equipamentos,
                totalEquipamentos,
                temEquipamentos: totalEquipamentos > 0,
                status: localStatus || evento.status || 'pending' // Prioriza status local de despacho
            };
        });


        res.json({
            timestamp: new Date().toISOString(),
            total: eventosCompletos.length,
            comEquipamentos: eventosCompletos.filter(e => e.temEquipamentos).length,
            semEquipamentos: eventosCompletos.filter(e => !e.temEquipamentos).length,
            eventos: eventosCompletos
        });
    } catch (error) {
        // Fallback para arquivo se API falhar
        try {
            const data = JSON.parse(fs.readFileSync('logs/eventos_completos.json', 'utf-8'));
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Inventário
// Inventário
app.get('/api/inventario', (req, res) => {
    try {
        const inventory = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

        // Carregar QR codes
        let qrUnits = {};
        try {
            const qrData = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
            qrUnits = qrData.units || {};
        } catch (e) { }

        // Calcular Uso por Item (Rua) com Detalhes
        const usageMap = {};
        const usageDetails = {}; // Novo: Detalhar onde está cada item

        const progressDir = 'logs/tick_progress';
        if (fs.existsSync(progressDir)) {
            const files = fs.readdirSync(progressDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
                    if (data.status === 'dispatched' || data.status === 'returned_partial') {
                        data.separatedItems.forEach(item => {
                            // Se item foi devolvido, não conta como em uso
                            if (item.returned) return;

                            if (item.nome) {
                                const name = item.nome.trim();
                                const qtyInUse = (item.qtySeparada || 0) - (item.qtyReturned || 0);

                                if (qtyInUse > 0) {
                                    if (!usageMap[name]) usageMap[name] = 0;
                                    usageMap[name] += qtyInUse;

                                    if (!usageDetails[name]) usageDetails[name] = [];
                                    usageDetails[name].push({
                                        eventId: data.eventId,
                                        eventName: data.eventName,
                                        qty: qtyInUse,
                                        qrCodes: item.qrCodes || [] // Incluir QRs se houver
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }

        // Enriquecer itens com QR codes e Uso
        inventory.items = inventory.items.map((item, index) => {
            // == MUDANÇA CRÍTICA: USAR ID REAL DO ITEM ==
            // Se o item não tiver ID (legado manual), gerar um temporário baseado no nome (hash simples) ou index backup
            // Mas idealmente todos devem ter ID vindo do sync ou criação.

            let realId = item.id;

            // Fallback para itens manuais sem ID (gerar e salvar seria ideal, mas readonly aqui)
            if (!realId) {
                realId = `manual_${index}`; // Temporário para não quebrar
            }

            // Converter para string para garantir match com chaves do JSON
            const itemIdStr = String(realId);

            const qrCodes = qrUnits[itemIdStr] || [];
            const name = item.nome ? item.nome.trim() : '';

            // Calcular Quantidade em Manutenção
            const qtdManutencao = qrCodes.filter(u => u.status === 'manutencao').length;

            // Adicionar detalhes de onde está sendo usado
            const details = usageDetails[name] || [];

            const cleanItem = {
                ...item,
                id: itemIdStr, // Mantém ID REAL (persistente)
                _legacyIndex: index, // Opcional: manter index para debug se precisar
                qrCodes: qrCodes,
                qtdEmUso: usageMap[name] || 0,
                qtdManutencao: qtdManutencao,
                usoDetalhado: details // Novo campo para o frontend consumir
            };

            // REMOVER CAMPOS DE VALOR PARA O FRONTEND (Privacidade)
            delete cleanItem.valorCusto;
            delete cleanItem.valorVenda;

            return cleanItem;
        });

        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// QR Units
app.get('/api/qr-units', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar novo item ao inventário
app.post('/api/inventario/item', (req, res) => {
    try {
        const newItem = req.body;

        if (!newItem.nome || !newItem.categoria) {
            return res.status(400).json({ error: 'Nome e Categoria são obrigatórios' });
        }

        const filePath = 'logs/inventory_complete.json';
        const inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Sanitizar dados
        const itemToSave = {
            id: newItem.id || `local_${Date.now()}`, // Gerar ID persistente se não vier
            nome: newItem.nome.trim(),
            categoria: newItem.categoria,
            marca: newItem.marca || '',
            modelo: newItem.modelo || '',
            estoque: parseInt(newItem.estoque) || 0,
            valorCusto: newItem.valorCusto || '0,00',
            valorVenda: newItem.valorVenda || '0,00',
            barcodes: newItem.barcodes || [] // Array de códigos de barras EAN
        };

        inventory.items.push(itemToSave);
        inventory.total = inventory.items.length;

        fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));
        console.log(`🆕 Item adicionado: ${itemToSave.nome} (${itemToSave.barcodes.length} barcodes)`);

        res.json({ success: true, item: itemToSave });

        res.json({ success: true, item: itemToSave });

    } catch (error) {
        console.error('Erro ao adicionar item:', error);
        res.status(500).json({ error: error.message });
    }
});

// Atualizar barcodes de um item existente
app.post('/api/inventario/item/update-barcodes', (req, res) => {
    try {
        const { itemIndex, itemId, barcodes, quantity } = req.body;

        console.log('🔍 DEBUG update-barcodes:', { itemIndex, itemId, barcodes, quantity });

        if (!barcodes || !Array.isArray(barcodes)) {
            console.error('❌ Validation failed: barcodes is not an array', barcodes);
            return res.status(400).json({ error: 'Dados inválidos - barcodes deve ser um array' });
        }

        const filePath = 'logs/inventory_complete.json';
        const inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // CRITICAL FIX: Use itemId if provided, otherwise fall back to itemIndex
        let item;
        if (itemId !== undefined) {
            item = inventory.items.find(i => String(i.id) === String(itemId));
        } else if (itemIndex !== undefined) {
            item = inventory.items[itemIndex];
        }

        if (!item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }

        // Inicializar se não existir
        if (!item.barcodes) item.barcodes = [];
        if (!item.barcodeQuantities) item.barcodeQuantities = {};

        // Adicionar novos (evitar duplicatas)
        let addedCount = 0;
        barcodes.forEach(code => {
            if (code) {
                // Adicionar ao array se não existir
                if (!item.barcodes.includes(code)) {
                    item.barcodes.push(code);
                    addedCount++;
                }

                // Atualizar quantidade se fornecida (Modo Granel)
                if (quantity !== undefined && quantity !== null) {
                    const qtd = parseInt(quantity);
                    if (!isNaN(qtd)) {
                        if (qtd === 0) {
                            // Se quantidade for 0, remover do registro (Excluir Lote)
                            if (item.barcodeQuantities && item.barcodeQuantities[code]) {
                                delete item.barcodeQuantities[code];
                            }
                            // TAMBÉM remover da lista de barcodes vinculados
                            const idx = item.barcodes.indexOf(code);
                            if (idx > -1) {
                                item.barcodes.splice(idx, 1);
                            }
                            console.log(`🗑️ Lote removido totalmente para ${code}`);
                        } else {
                            item.barcodeQuantities[code] = qtd;
                            console.log(`📦 Quantidade definida para ${code}: ${qtd}`);
                        }
                    }
                }
            }
        });

        fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));
        console.log(`🏷️ Barcodes atualizados para "${item.nome}": +${addedCount} novos. Total: ${item.barcodes.length}`);

        res.json({
            success: true,
            barcodes: item.barcodes,
            barcodeQuantities: item.barcodeQuantities,
            added: addedCount
        });

    } catch (error) {
        console.error('Erro ao atualizar barcodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alertas
app.get('/api/alertas', (req, res) => {
    try {
        if (fs.existsSync('logs/alertas_report.json')) {
            const data = JSON.parse(fs.readFileSync('logs/alertas_report.json', 'utf-8'));
            res.json(data);
        } else {
            res.json({ alertas: [] });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alocações
app.get('/api/alocacoes', (req, res) => {
    try {
        if (fs.existsSync('logs/alocacoes.json')) {
            const data = JSON.parse(fs.readFileSync('logs/alocacoes.json', 'utf-8'));
            res.json(data);
        } else {
            res.json({ alocacoes: [] });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// QR Units - Carregar (novo sistema de unidades)
app.get('/api/qr-units', (req, res) => {
    try {
        if (fs.existsSync('logs/qr_units.json')) {
            const data = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
            res.json(data);
        } else {
            res.json({ units: {} });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// QR Units - Salvar ou Atualizar unidade
app.post('/api/qr-units', async (req, res) => {
    try {
        const { itemIndex, itemName, unit } = req.body;

        // Carregar unidades existentes
        let data = { units: {} };
        if (fs.existsSync('logs/qr_units.json')) {
            data = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
        }

        const newLogEntry = unit.log ? { date: new Date().toISOString(), text: unit.log } : null;

        // 1. Procurar se QR já existe em QUALQUER item (Atualização)
        let foundExisting = false;
        let existingItemIdx = null;
        let existingUnitIdx = null;

        Object.keys(data.units).forEach(idx => {
            const uIdx = data.units[idx].findIndex(u => u.qrCode === unit.qrCode);
            if (uIdx !== -1) {
                foundExisting = true;
                existingItemIdx = idx;
                existingUnitIdx = uIdx;
            }
        });

        if (foundExisting) {
            // == CASO 2: ATUALIZAR ITEM EXISTENTE ==
            const existingUnit = data.units[existingItemIdx][existingUnitIdx];

            // Atualizar status
            existingUnit.status = unit.status;

            // Adicionar log técnico se houver
            if (newLogEntry) {
                if (!existingUnit.maintenanceLogs) existingUnit.maintenanceLogs = [];
                existingUnit.maintenanceLogs.unshift(newLogEntry);
            }

            // Atualizar timestamp
            existingUnit.lastUpdated = new Date().toISOString();

            console.log(`🔄 Item atualizado: ${unit.qrCode} -> Status: ${unit.status} | Log: ${unit.log || 'Sem observação'}`);

        } else {
            // == CASO 1: NOVO ITEM ==
            if (itemIndex === undefined) return res.status(400).json({ error: 'itemIndex obrigatório para novos itens' });

            // Inicializar array se não existir
            if (!data.units[itemIndex]) {
                data.units[itemIndex] = [];
            }

            const newUnit = {
                qrCode: unit.qrCode,
                status: unit.status,
                timestamp: new Date().toISOString(),
                maintenanceLogs: newLogEntry ? [newLogEntry] : []
            };

            data.units[itemIndex].push(newUnit);
        }

        data.lastUpdated = new Date().toISOString();

        // === OTIMIZAÇÃO: Salvar arquivo principal PRIMEIRO (async) ===
        const mainFilePromise = fs.promises.writeFile('logs/qr_units.json', JSON.stringify(data, null, 2));

        // === BACKUP (Debounced - só a cada 10 registros ou 1x por minuto) ===
        const backupDir = 'logs/backups';
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        // Usar timestamp em vez de contador para backup inteligente
        const now = Date.now();
        if (!global.lastBackupTime || (now - global.lastBackupTime) > 60000) { // 1 minuto
            global.lastBackupTime = now;
            const today = new Date().toISOString().split('T')[0];
            fs.promises.writeFile(`${backupDir}/qr_units_backup_${today}.json`, JSON.stringify(data, null, 2))
                .catch(e => console.warn('Backup falhou:', e.message));
        }

        // === AUDIT LOG (Async, non-blocking) ===
        const auditLogMsg = `[${new Date().toISOString()}] ${foundExisting ? 'ATUALIZADO' : 'CADASTRADO'}: ${unit.qrCode} - ${unit.status}\n`;
        fs.promises.appendFile('logs/qr_audit_log.txt', auditLogMsg)
            .catch(e => console.warn('Audit log falhou:', e.message));

        // Aguardar apenas o arquivo principal (crítico)
        await mainFilePromise;

        res.json({ success: true, updated: foundExisting });

    } catch (error) {
        console.error('Erro ao salvar unidade QR:', error);
        res.status(500).json({ error: error.message });
    }
});

// === EXPORTAR CÓDIGOS (BACKUP CSV) ===
app.get('/api/inventario/export-codes', (req, res) => {
    try {
        const inventoryPath = 'logs/inventory_complete.json';
        const qrPath = 'logs/qr_units.json';

        if (!fs.existsSync(inventoryPath)) {
            return res.status(404).send('Inventário não encontrado');
        }

        const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
        const qrData = fs.existsSync(qrPath) ? JSON.parse(fs.readFileSync(qrPath, 'utf-8')) : { units: {} };

        // Cabeçalho do CSV
        let csvContent = "Codigo,Tipo,NomeItem,Categoria,QuantidadePacote\n";

        inventory.items.forEach((item, index) => {
            const safeName = item.nome.replace(/,/g, ' '); // Evitar quebra no CSV
            const safeCat = (item.categoria || '').replace(/,/g, ' ');

            // 1. Exportar EANs (Códigos de Barras)
            if (item.barcodes && Array.isArray(item.barcodes)) {
                item.barcodes.forEach(code => {
                    if (code) {
                        // Verificar se tem quantidade específica (pacote)
                        let qty = 1;
                        if (item.barcodeQuantities && item.barcodeQuantities[code]) {
                            qty = item.barcodeQuantities[code];
                        }
                        csvContent += `${code},BARRAS,${safeName},${safeCat},${qty}\n`;
                    }
                });
            }

            // 2. Exportar QR Codes Únicos
            const units = qrData.units[index] || [];
            units.forEach(unit => {
                csvContent += `${unit.qrCode},QR_UNICO,${safeName},${safeCat},1\n`;
            });
        });

        // Enviar arquivo para download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=backup_codigos_estoque.csv');
        res.send(csvContent);

    } catch (error) {
        console.error('Erro ao exportar códigos:', error);
        res.status(500).send('Erro ao gerar exportação');
    }
});

// === SINCRONIZAÇÃO API MANUAL ===
app.post('/api/sync-inventory', (req, res) => {
    console.log('🔄 Iniciando sincronização manual via API...');

    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, 'scripts', 'sync_inventory_api.js');

    // Executar script como processo filho
    const syncProcess = spawn('node', [scriptPath]);

    let output = '';
    let errorOutput = '';

    syncProcess.stdout.on('data', (data) => {
        output += data.toString();
        // console.log(`[SYNC]: ${data}`);
    });

    syncProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`[SYNC ERROR]: ${data}`);
    });

    syncProcess.on('close', (code) => {
        console.log(`✅ Sincronização finalizada com código ${code}`);

        if (code === 0) {
            res.json({ success: true, message: 'Inventário sincronizado com sucesso!', logs: output });
        } else {
            res.status(500).json({ success: false, error: 'Erro na sincronização', detailedError: errorOutput, logs: output });
        }
    });
});


// QR Mappings - Manter para compatibilidade (deprecado)
app.get('/api/qr-mappings', (req, res) => {
    try {
        if (fs.existsSync('logs/qr_mappings.json')) {
            const data = JSON.parse(fs.readFileSync('logs/qr_mappings.json', 'utf-8'));
            res.json(data);
        } else {
            res.json({ mappings: {} });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// QR Units - Excluir unidade (NOVO)
const deleteQRHandler = (req, res) => {
    // LOG EXPLÍCITO DE ENTRADA
    console.log('🔥 [DELETE HANDLER REACHED]');
    console.log('Body:', req.body);

    try {
        const { itemIndex, qrCode } = req.body;

        if (!fs.existsSync('logs/qr_units.json')) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        let data = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));

        if (!data.units[itemIndex]) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }

        const realUnitIndex = data.units[itemIndex].findIndex(u => u.qrCode === qrCode);

        if (realUnitIndex === -1) {
            console.log(`❌ QR Code ${qrCode} não encontrado.`);
            return res.status(404).json({ error: 'QR Code não encontrado' });
        }

        data.units[itemIndex].splice(realUnitIndex, 1);
        data.lastUpdated = new Date().toISOString();

        fs.writeFileSync('logs/qr_units.json', JSON.stringify(data, null, 2));

        console.log(`✅ EXCLUÍDO: ${qrCode}`);
        res.json({ success: true, remaining: data.units[itemIndex].length });

    } catch (error) {
        console.error('❌ ERRO:', error);
        res.status(500).json({ error: error.message });
    }
};

// Múltiplos métodos para garantir compatibilidade
app.post('/api/qr-units/delete', deleteQRHandler);
app.delete('/api/qr-units/delete', deleteQRHandler);
app.get('/api/qr-units/delete', (req, res) => {
    res.status(405).send('Use POST ou DELETE');
});


// ====== NOVO: HISTÓRICO DE SEPARAÇÕES DE EVENTOS ======

// Salvar separação de evento
app.post('/api/event-separations', (req, res) => {
    try {
        const { eventId, eventName, items, separatedItems, completedAt } = req.body;

        // Carregar histórico existente
        let data = { separations: [] };
        if (fs.existsSync('logs/event_separations.json')) {
            data = JSON.parse(fs.readFileSync('logs/event_separations.json', 'utf-8'));
        }

        // Criar novo registro
        const separation = {
            id: `SEP-${Date.now()}`,
            eventId,
            eventName,
            completedAt: completedAt || new Date().toISOString(),
            items: items || [],
            separatedItems: separatedItems || [],
            totalItems: (items || []).length,
            completedItems: (separatedItems || []).length,
            completionPercentage: items && items.length > 0
                ? Math.round((separatedItems.length / items.length) * 100)
                : 0
        };

        // Adicionar ao histórico
        data.separations.unshift(separation); // Mais recente primeiro

        // Manter apenas últimas 100 separações
        if (data.separations.length > 100) {
            data.separations = data.separations.slice(0, 100);
        }

        data.lastUpdated = new Date().toISOString();

        // Salvar
        fs.writeFileSync(
            'logs/event_separations.json',
            JSON.stringify(data, null, 2)
        );

        console.log(`✓ Separação salva: Evento ${eventId} - ${eventName} (${separation.completedItems}/${separation.totalItems} itens)`);
        res.json({ success: true, separation });
    } catch (error) {
        console.error('Erro ao salvar separação:', error);
        res.status(500).json({ error: error.message });
    }
});
// ====== NOVO: PROGRESSO EM TEMPO REAL DO TICK LIST ======

// Endpoint para listar apenas eventos finalizados (para a tela de Separação/Checkout)
app.get('/api/separations/completed', (req, res) => {
    try {
        const progressDir = 'logs/tick_progress';
        if (!fs.existsSync(progressDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(progressDir);
        const completedEvents = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
                // Incluir completed, ready_for_checkout E dispatched
                if (['completed', 'ready_for_checkout', 'dispatched'].includes(data.status)) {
                    completedEvents.push(data);
                }
            }
        }

        // Ordenar por data de atualização (mais recentes primeiro)
        completedEvents.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

        res.json(completedEvents);
    } catch (error) {
        console.error('Erro ao listar separações completas:', error);
        res.json([]);
    }
});

// Endpoint para listar PENDÊNCIAS (returned_partial)
app.get('/api/separations/pendencies', (req, res) => {
    try {
        const progressDir = 'logs/tick_progress';
        if (!fs.existsSync(progressDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(progressDir);
        const pendencyEvents = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
                if (data.status === 'returned_partial') {
                    pendencyEvents.push(data);
                }
            }
        }

        pendencyEvents.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        res.json(pendencyEvents);
    } catch (error) {
        console.error('Erro ao listar pendências:', error);
        res.json([]);
    }
});

app.post('/api/tick-progress/:eventId', (req, res) => {
    try {
        const { eventId } = req.params;
        const { eventName, separatedItems, status, idorcamento } = req.body; // status e idorcamento vem do body

        // Criar diretório se não existir
        const progressDir = 'logs/tick_progress';
        if (!fs.existsSync(progressDir)) {
            fs.mkdirSync(progressDir, { recursive: true });
        }

        // Salvar progresso para este evento
        const progressFile = `${progressDir}/evento_${eventId}.json`;
        const progressData = {
            eventId,
            idorcamento: idorcamento || null, // ID do orçamento (regra principal de identificação)
            eventName,
            lastUpdated: new Date().toISOString(),
            status: status || 'in_progress', // Default para in_progress
            separatedItems: separatedItems || []
        };

        fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));

        const totalScanned = separatedItems.reduce((sum, item) => sum + (item.qtySeparada || 0), 0);
        console.log(`💾 Tick Progress salvo: Evento ${eventId} (${progressData.status}) - ${totalScanned} itens`);

        // === DISPARAR WEBHOOKS ===
        // Importante: Disparar apenas se houver mudança de status relevante ou periodicamente?
        // Vamos disparar sempre que salvar se houver status final ou delta.
        try {
            const webhookService = require('./services/webhookService');
            // Mapear status para evento
            let eventType = null;

            // Recalcular status real baseado nos itens (Frontend pode mandar 'returned' mas faltar coisa)
            const totalItems = separatedItems.length;
            const returnedItemsCount = separatedItems.filter(i => i.returned).length;
            const isFullyReturned = totalItems > 0 && totalItems === returnedItemsCount;

            // Se o status veio 'returned' mas contagem não bate, forçar 'returned_partial'
            let finalStatus = status;
            if (status === 'returned' && !isFullyReturned) {
                finalStatus = 'returned_partial';
                console.log(`⚠️ Status corrigido para 'returned_partial' (Devolvido: ${returnedItemsCount}/${totalItems}) - Webhook ajustado`);
            }

            if (finalStatus === 'dispatched') eventType = 'event.dispatched';
            else if (finalStatus === 'returned') eventType = 'event.returned';
            else if (finalStatus === 'returned_partial') eventType = 'event.pending';

            // Só dispara se for um evento mapeado
            if (eventType) {
                // Calcular delta (itens faltantes) se necessário
                let delta = null;
                if (finalStatus === 'returned_partial' || finalStatus === 'returned') {
                    const itemsMissing = separatedItems.filter(i => !i.returned).map(i => ({
                        id: i.id || i.nome, // Fallback se não tiver ID
                        nome: i.nome,
                        qtySeparada: i.qtySeparada,
                        qtyReturned: i.qtyReturned || 0
                    }));

                    delta = {
                        expected: totalItems,
                        returned: returnedItemsCount,
                        missing: totalItems - returnedItemsCount,
                        items_missing: itemsMissing,
                        status: finalStatus
                    };
                }

                console.log(`📡 Disparando Webhook: ${eventType}`);
                webhookService.trigger(eventType, progressData, delta);
            }
        } catch (hookErr) {
            console.error('Erro ao disparar webhook:', hookErr.message);
        }

        // === DISPARAR BROADCAST UDP (Smart Discovery) ===
        try {
            const broadcastService = require('./services/broadcastService');
            let broadcastType = null;
            if (status === 'dispatched') broadcastType = 'event.dispatched';
            if (status === 'returned') broadcastType = 'event.returned';

            if (broadcastType) {
                console.log(`📡 Enviando Broadcast UDP: ${broadcastType}`);
                broadcastService.send(broadcastType, eventId, eventName);
            }
        } catch (uciErr) {
            console.error('Erro ao disparar Broadcast UDP:', uciErr.message);
        }

        // === Atualização de Status Global e Histórico ===
        // Função auxiliar para atualizar status dos QRs
        const updateQRStockStatus = (items, eventStatus, eventId, eventName, authorizedBy = null) => {
            try {
                const qrPath = 'logs/qr_units.json';
                const historyPath = 'logs/usage_history.json';

                if (!fs.existsSync(qrPath)) return;

                const qrData = JSON.parse(fs.readFileSync(qrPath, 'utf-8'));
                let history = [];
                if (fs.existsSync(historyPath)) {
                    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch (e) { }
                }

                let historyUpdated = false;

                items.forEach(item => {
                    // AJUSTE VALIDADO: O frontend manda 'qrCodes' (lista original)
                    // Para Devolução, precisaremos de 'returnedQRs' (lista dos que voltaram)

                    // 1. DISPATCH (Saída) ou ADD_EXTRA (Adição Controlada)
                    if (item.qrCodes && Array.isArray(item.qrCodes)) {
                        item.qrCodes.forEach(qr => {
                            // Achar a unidade no banco global
                            const unitsArr = qrData.units[item.id];
                            if (unitsArr) {
                                const unitObj = unitsArr.find(u => u.qrCode === qr);
                                if (unitObj) {
                                    // Se for 'dispatched' ou se for um item EXTRA adicionado num evento já dispatched
                                    if (eventStatus === 'dispatched') {
                                        // Só atualiza se ainda não estiver em uso ou se for auditoria
                                        if (unitObj.status !== 'em_uso' || authorizedBy) {
                                            unitObj.status = 'em_uso';
                                            unitObj.lastEventId = eventId;
                                            unitObj.lastEventName = eventName;

                                            history.push({
                                                timestamp: new Date().toISOString(),
                                                eventId,
                                                eventName,
                                                qrCode: qr,
                                                itemId: item.id,
                                                itemName: item.nome,
                                                action: authorizedBy ? 'add_extra_authorized' : 'dispatch',
                                                authorizedBy: authorizedBy || 'system'
                                            });
                                            historyUpdated = true;
                                        }
                                    } else if (eventStatus === 'returned') {
                                        // Devolução total
                                        unitObj.status = 'disponivel';
                                        unitObj.lastEventId = null;

                                        history.push({
                                            timestamp: new Date().toISOString(),
                                            eventId,
                                            eventName,
                                            qrCode: qr,
                                            itemId: item.id,
                                            itemName: item.nome,
                                            action: 'return',
                                            authorizedBy: authorizedBy || 'system'
                                        });
                                        historyUpdated = true;
                                        // quais units voltaram.
                                        // O frontend envia 'returnedUnits': ["000123"]
                                        if (item.returnedUnits && item.returnedUnits.includes(qr)) {
                                            unitObj.status = 'disponivel';
                                        } else {
                                            // Se não está na lista de retornados, continua em uso
                                            unitObj.status = 'em_uso';
                                        }
                                    }
                                }
                            }
                        });
                    }
                });

                fs.writeFileSync(qrPath, JSON.stringify(qrData, null, 2));
                if (historyUpdated) {
                    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
                }
                console.log('🔄 Status dos QRs atualizado no Banco Global.');

            } catch (err) {
                console.error('Erro ao atualizar status global QRs:', err);
            }
        };

        // ... lógica anterior ...

        // Chamada da função DEPOIS de salvar o arquivo local
        if (status === 'dispatched' || status === 'returned' || status === 'returned_partial') {
            // authorizedBy vem do body (req.body.authorizedBy)
            updateQRStockStatus(separatedItems, status, eventId, eventName, req.body.authorizedBy);
        }

        // ... triggers de webhook ...
        res.json({ success: true, progress: progressData });
    } catch (error) {
        console.error('Erro ao salvar tick progress:', error);
        res.status(500).json({ error: error.message });
    }
});

// Carregar progresso de separação
app.get('/api/tick-progress/:eventId', (req, res) => {
    try {
        const { eventId } = req.params;
        const progressFile = `logs/tick_progress/evento_${eventId}.json`;

        if (fs.existsSync(progressFile)) {
            const progressData = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
            res.json(progressData);
        } else {
            // Nenhum progresso salvo ainda
            res.json({ separatedItems: [] });
        }
    } catch (error) {
        console.error('Erro ao carregar tick progress:', error);
        res.status(500).json({ error: error.message });
    }
});

// ====== NOVO: HISTÓRICO DE CONVERSAS COM MARK AI ======

// Salvar conversa
app.post('/api/conversations', (req, res) => {
    try {
        const { userMessage, markResponse, context, timestamp } = req.body;

        // Carregar histórico existente
        let data = { conversations: [] };
        if (fs.existsSync('logs/conversations.json')) {
            data = JSON.parse(fs.readFileSync('logs/conversations.json', 'utf-8'));
        }

        // Criar novo registro
        const conversation = {
            id: `CONV-${Date.now()}`,
            timestamp: timestamp || new Date().toISOString(),
            userMessage,
            markResponse,
            context: context || 'unknown',
            messageLength: userMessage.length,
            responseLength: markResponse.length
        };

        // Adicionar ao histórico
        data.conversations.unshift(conversation); // Mais recente primeiro

        // Manter apenas últimas 500 conversas
        if (data.conversations.length > 500) {
            data.conversations = data.conversations.slice(0, 500);
        }

        data.lastUpdated = new Date().toISOString();
        data.totalConversations = data.conversations.length;

        // Salvar
        fs.writeFileSync(
            'logs/conversations.json',
            JSON.stringify(data, null, 2)
        );

        console.log(`💬 Conversa salva: "${userMessage.substring(0, 50)}..." [${context}]`);
        res.json({ success: true, conversation });
    } catch (error) {
        console.error('Erro ao salvar conversa:', error);
        res.status(500).json({ error: error.message });
    }
});

// Recuperar histórico de conversas
app.get('/api/conversations', (req, res) => {
    try {
        if (fs.existsSync('logs/conversations.json')) {
            const data = JSON.parse(fs.readFileSync('logs/conversations.json', 'utf-8'));

            // Permitir filtrar por limite e contexto
            const limit = parseInt(req.query.limit) || 50;
            const context = req.query.context;

            let conversations = data.conversations;

            if (context) {
                conversations = conversations.filter(c => c.context === context);
            }

            conversations = conversations.slice(0, limit);

            res.json({ conversations, total: data.conversations.length });
        } else {
            res.json({ conversations: [], total: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ====== NOVO: CONTEXTO AGREGADO PARA MARK AI ======

app.get('/api/mark-context', (req, res) => {
    try {
        const context = {
            timestamp: new Date().toISOString()
        };

        // Últimas separações
        if (fs.existsSync('logs/event_separations.json')) {
            const sepData = JSON.parse(fs.readFileSync('logs/event_separations.json', 'utf-8'));
            context.recentSeparations = sepData.separations.slice(0, 10);
            context.totalSeparations = sepData.separations.length;
        } else {
            context.recentSeparations = [];
            context.totalSeparations = 0;
        }

        // Últimas conversas
        if (fs.existsSync('logs/conversations.json')) {
            const convData = JSON.parse(fs.readFileSync('logs/conversations.json', 'utf-8'));
            context.recentConversations = convData.conversations.slice(0, 10);
            context.totalConversations = convData.conversations.length;
        } else {
            context.recentConversations = [];
            context.totalConversations = 0;
        }

        // QR Units status
        if (fs.existsSync('logs/qr_units.json')) {
            const qrData = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
            const totalUnits = Object.values(qrData.units).reduce((sum, arr) => sum + arr.length, 0);
            context.qrUnitsRegistered = totalUnits;
            context.qrItemsWithUnits = Object.keys(qrData.units).length;
        } else {
            context.qrUnitsRegistered = 0;
            context.qrItemsWithUnits = 0;
        }

        res.json(context);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// === ENDPOINTS DE AÇÕES DA KIRA ===

// Criar novo evento
app.post('/api/kira/create-event', async (req, res) => {
    try {
        const { name, date, location, items } = req.body;

        // Validação básica
        if (!name || !date) {
            return res.status(400).json({ error: 'Nome e data são obrigatórios' });
        }

        // Carregar eventos existentes
        const eventosPath = 'data/eventos.json';
        let eventos = { eventos: [] };

        if (fs.existsSync(eventosPath)) {
            eventos = JSON.parse(fs.readFileSync(eventosPath, 'utf-8'));
        }

        // Criar novo evento
        const newEvent = {
            id: Date.now().toString(),
            nome: name,
            data: date,
            local: location || '',
            equipamentos: items || [],
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        eventos.eventos.push(newEvent);
        fs.writeFileSync(eventosPath, JSON.stringify(eventos, null, 2));

        res.json({ success: true, event: newEvent });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar itens a evento
app.post('/api/kira/add-items-to-event', async (req, res) => {
    try {
        const { eventId, items } = req.body;

        if (!eventId || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'EventId e items são obrigatórios' });
        }

        const eventosPath = 'data/eventos.json';
        if (!fs.existsSync(eventosPath)) {
            return res.status(404).json({ error: 'Arquivo de eventos não encontrado' });
        }

        const eventos = JSON.parse(fs.readFileSync(eventosPath, 'utf-8'));
        // Buscar por idorcamento (regra principal) ou id como fallback
        const event = eventos.eventos.find(e =>
            String(e.idorcamento) === String(eventId) ||
            e.id === eventId ||
            (e.nome || e.nomeevento || '').includes(eventId)
        );

        if (!event) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        // Adicionar itens
        if (!event.equipamentos) event.equipamentos = [];
        event.equipamentos.push(...items);

        fs.writeFileSync(eventosPath, JSON.stringify(eventos, null, 2));

        res.json({ success: true, event });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Marcar devoluções
app.post('/api/jira/mark-returns', async (req, res) => {
    // ... (Manter existente)
});

// ====== NOVO: TRANSFERÊNCIA ENTRE EVENTOS (CROSS-DOCKING) ======
app.post('/api/transfer-item', (req, res) => {
    try {
        const { fromEventId, toEventId, itemName, quantity, manualSelection, userName } = req.body;

        if (!fromEventId || !toEventId || !itemName || !quantity) {
            return res.status(400).json({ error: 'Dados incompletos para transferência.' });
        }

        const progressDir = 'logs/tick_progress';
        const fromFile = `${progressDir}/evento_${fromEventId}.json`;
        const toFile = `${progressDir}/evento_${toEventId}.json`;

        if (!fs.existsSync(fromFile) || !fs.existsSync(toFile)) {
            return res.status(404).json({ error: 'Eventos não encontrados.' });
        }

        const fromData = JSON.parse(fs.readFileSync(fromFile, 'utf-8'));
        const toData = JSON.parse(fs.readFileSync(toFile, 'utf-8'));

        // 1. Processar SAÍDA do Evento de Origem (Return Parcial)
        let qtyRemoved = 0;
        let transferredItems = [];

        // Estratégia: Encontrar itens com esse nome e marcar como devolvidos
        // Se for Manual/Granel: Reduz QtySeparada ou Incrementa QtyReturned
        // Se for QR: Marca returned = true para os QRs específicos (se fornecidos) ou os primeiros encontrados

        fromData.separatedItems.forEach(item => {
            if (qtyRemoved >= quantity) return; // Já pegou o suficiente

            if (item.nome && item.nome.trim().toLowerCase() === itemName.trim().toLowerCase() && !item.returned) {
                const available = (item.qtySeparada || 0) - (item.qtyReturned || 0);
                if (available <= 0) return;

                const take = Math.min(available, quantity - qtyRemoved);

                // Se for item com QRs e temos seleção manual de quais QRs transferir
                if (manualSelection && manualSelection.qrCodes && manualSelection.qrCodes.length > 0 && item.qrCodes) {
                    // Lógica para transferir QRs específicos (complexo, simplificando para Granel primeiro)
                    // TODO: Implementar seleção fina de QRs
                }

                // Atualizar Origem
                item.qtyReturned = (item.qtyReturned || 0) + take;
                if (item.qtyReturned >= item.qtySeparada) item.returned = true;

                qtyRemoved += take;
                transferredItems.push({
                    nome: item.nome,
                    qty: take,
                    // qrCodes: ... (se tiver)
                });
            }
        });

        if (qtyRemoved < quantity) {
            return res.status(400).json({ error: `Saldo insuficiente no evento de origem. Disponível: ${qtyRemoved}` });
        }

        // Se o evento origem ficou "completo" com essa transferência?
        // Check se tudo foi devolvido
        const allReturned = fromData.separatedItems.every(i => i.returned);
        if (allReturned && fromData.status !== 'returned') {
            fromData.status = 'returned'; // Ou mantem dispatched se quiser forçar check físico? 
            // Melhor manter status 'dispatched' ou 'returned_partial' para indicar que o evento original "perdeu" itens mas ok
        } else {
            fromData.status = 'returned_partial';
        }
        fromData.lastUpdated = new Date().toISOString();


        // 2. Processar ENTRADA no Evento de Destino (Dispatch Manual)
        // Adicionar à lista de separatedItems do destino
        // Verificar se já existe item com esse nome para somar, ou criar novo
        let destItem = toData.separatedItems.find(i => i.nome && i.nome.trim().toLowerCase() === itemName.trim().toLowerCase() && !i.qrCodes?.length);

        if (destItem) {
            destItem.qtySeparada = (destItem.qtySeparada || 0) + qtyRemoved;
            destItem.qtyReturned = (destItem.qtyReturned || 0); // Mantém o que já tinha
        } else {
            toData.separatedItems.push({
                nome: itemName,
                qtySeparada: qtyRemoved,
                qtyReturned: 0,
                returned: false,
                transferredFrom: fromEventId, // Rastreabilidade
                timestamp: new Date().toISOString()
            });
        }
        toData.lastUpdated = new Date().toISOString();


        // 3. Salvar Tudo
        fs.writeFileSync(fromFile, JSON.stringify(fromData, null, 2));
        fs.writeFileSync(toFile, JSON.stringify(toData, null, 2));

        // 4. Log/Webhooks?
        console.log(`🚚 Transferência: ${quantity}x "${itemName}" de Evento ${fromEventId} para ${toEventId}`);

        res.json({ success: true, message: 'Transferência realizada com sucesso!', qty: qtyRemoved });

    } catch (error) {
        console.error('Erro na transferência:', error);
        res.status(500).json({ error: error.message });
    }
});

// Marcar devoluções (Restaurado)
app.post('/api/jira/mark-returns', async (req, res) => {
    try {

        const { eventId, itemName } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: 'EventId é obrigatório' });
        }

        // Buscar arquivo de progresso do evento
        const progressPath = `logs/tick_progress_${eventId}.json`;

        if (!fs.existsSync(progressPath)) {
            return res.status(404).json({ error: 'Progresso do evento não encontrado' });
        }

        const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));

        // Marcar todos os itens (ou item específico) como devolvidos
        if (itemName) {
            const item = progress.items.find(i => i.nome.toLowerCase().includes(itemName.toLowerCase()));
            if (item) {
                item.returned = item.scanned; // Marca quantidade escaneada como devolvida
            }
        } else {
            // Marcar todos
            progress.items.forEach(item => {
                item.returned = item.scanned;
            });
        }

        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

        res.json({ success: true, progress });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gerar relatório
app.get('/api/kira/report', async (req, res) => {
    try {
        const { period } = req.query; // 'week', 'month', 'today'

        const eventosPath = 'data/eventos.json';
        if (!fs.existsSync(eventosPath)) {
            return res.json({ events: [], summary: 'Nenhum evento encontrado' });
        }

        const eventos = JSON.parse(fs.readFileSync(eventosPath, 'utf-8'));
        const now = new Date();

        let filteredEvents = eventos.eventos;

        // Filtrar por período
        if (period === 'today') {
            filteredEvents = eventos.eventos.filter(e => {
                const eventDate = new Date(e.dataevento || e.data);
                return eventDate.toDateString() === now.toDateString();
            });
        } else if (period === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            filteredEvents = eventos.eventos.filter(e => {
                const eventDate = new Date(e.dataevento || e.data);
                return eventDate >= weekAgo && eventDate <= weekAhead;
            });
        }

        const summary = {
            total: filteredEvents.length,
            pending: filteredEvents.filter(e => (e.status || 'pending') === 'pending').length,
            completed: filteredEvents.filter(e => e.status === 'completed').length,
            events: filteredEvents.map(e => ({
                nome: e.nomeevento || e.nome,
                data: e.dataevento || e.data,
                local: e.localevento || e.local,
                status: e.status || 'pending'
            }))
        };

        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export QR Codes
app.get('/api/export-qr-codes', (req, res) => {
    try {
        const qrUnitsPath = 'logs/qr_units.json';
        const inventoryPath = 'logs/inventory_complete.json';

        // Check if files exist
        if (!fs.existsSync(qrUnitsPath)) {
            return res.status(404).send('Nenhum QR code cadastrado ainda.');
        }

        const qrUnits = JSON.parse(fs.readFileSync(qrUnitsPath, 'utf-8'));
        const inventory = fs.existsSync(inventoryPath)
            ? JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'))
            : { items: [] };

        // Build CSV
        let csv = 'ID do Item,Nome do Item,Categoria,Código QR,Data de Registro,Status\n';

        // Iterate through all items with QR codes
        Object.keys(qrUnits.units).forEach(itemId => {
            const units = qrUnits.units[itemId];
            const item = inventory.items.find(i => i.id === itemId);

            units.forEach(unit => {
                const itemName = item ? item.nome : 'Item não encontrado';
                const category = item ? item.categoria : 'N/A';
                const date = new Date(unit.timestamp).toLocaleDateString('pt-BR');
                const status = unit.status || 'disponivel';

                // Escape commas and quotes in CSV
                const escapeCsv = (str) => {
                    if (str.includes(',') || str.includes('"')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                csv += `${itemId},${escapeCsv(itemName)},${escapeCsv(category)},${unit.qrCode},${date},${status}\n`;
            });
        });

        // Set headers for download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=qr_codes_export.csv');
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility

    } catch (error) {
        console.error('Erro ao exportar QR codes:', error);
        res.status(500).send('Erro ao gerar exportação');
    }
});

// --- DASHBOARD MESSAGES ---
let dashboardMessages = [];
const messagesFile = 'logs/dashboard_messages.json';

if (fs.existsSync(messagesFile)) {
    try {
        dashboardMessages = JSON.parse(fs.readFileSync(messagesFile, 'utf-8'));
    } catch (e) {
        console.error('Erro ao ler mensagens do dashboard:', e);
        dashboardMessages = [];
    }
} else {
    // Mensagem inicial de exemplo
    dashboardMessages = [{
        id: Date.now().toString(),
        type: 'info',
        text: 'Sistema de Monitoramento Iniciado 🚀',
        timestamp: new Date().toISOString()
    }];
    fs.writeFileSync(messagesFile, JSON.stringify(dashboardMessages, null, 2));
}

function saveMessages() {
    fs.writeFileSync(messagesFile, JSON.stringify(dashboardMessages, null, 2));
}

app.get('/api/dashboard/messages', (req, res) => {
    res.json(dashboardMessages);
});

app.post('/api/dashboard/messages', (req, res) => {
    try {
        const { text, type = 'info', sender = 'User' } = req.body;
        if (!text) return res.status(400).json({ error: 'Texto obrigatório' });

        const newMessage = {
            id: Date.now().toString(),
            text,
            type, // 'info', 'warning', 'urgent', 'success'
            sender,
            timestamp: new Date().toISOString()
        };

        // Manter max 20 mensagens
        dashboardMessages.unshift(newMessage);
        if (dashboardMessages.length > 20) dashboardMessages.pop();

        saveMessages();

        // Notificar via socket se estivesse implementado
        res.json(newMessage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/dashboard/messages/:id', (req, res) => {
    const { id } = req.params;
    dashboardMessages = dashboardMessages.filter(m => m.id !== id);
    saveMessages();
    res.json({ success: true });
});

// --- FIM DASHBOARD MESSAGES ---

// ==========================================
// 🚀 API PÚBLICA DE INTEGRAÇÃO (V1)
// ==========================================

const API_CONFIG = {
    // A chave DEVE vir das variáveis de ambiente (Railway). Sem fallback inseguro.
    key: (process.env.API_KEY || '').trim() || null,
    header: 'x-api-key'
};

if (!API_CONFIG.key) {
    console.warn('⚠️  API_KEY não definida. Os endpoints /api/v1/public/* vão recusar acesso (503) até você configurar API_KEY.');
}

// Middleware de Segurança — SOMENTE header x-api-key (sem query param, que vaza em logs)
const apiKeyAuth = (req, res, next) => {
    // Se a chave não está configurada no servidor, é erro de configuração, não de cliente.
    if (!API_CONFIG.key) {
        return res.status(503).json({ error: 'Servidor sem API_KEY configurada. Defina API_KEY no ambiente.' });
    }
    const key = req.headers[API_CONFIG.header]; // Apenas header — ?key= não é mais aceito
    if (!key || key !== API_CONFIG.key) {
        return res.status(401).json({ error: 'Acesso Negado: API Key inválida ou ausente (use o header x-api-key).' });
    }
    next();
};

// 1. GET Estoda Real Consolidado
app.get('/api/v1/public/stock', apiKeyAuth, async (req, res) => {
    try {
        const inventoryPath = 'logs/inventory_complete.json';
        const qrUnitsPath = 'logs/qr_units.json';

        if (!fs.existsSync(inventoryPath)) return res.json({ items: [] });

        const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
        const qrUnits = fs.existsSync(qrUnitsPath) ? JSON.parse(fs.readFileSync(qrUnitsPath, 'utf-8')).units : {};

        // 1. Resolver Data da Consulta (Se não enviada, usa hoje)
        let queryDate = req.query.date; // Esperado: YYYY-MM-DD
        if (!queryDate) {
            queryDate = new Date().toISOString().split('T')[0];
            console.log(`ℹ️ Data não informada na API Pública. Assumindo hoje: ${queryDate}`);
        }

        const normalizeName = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, ' ') : '';
        let eventCommitments = {};
        const targetDateStr = String(queryDate);

        // 2. Buscar Eventos de Dados Vivos (Mesma lógica do Dashboard)
        try {
            const MeEventosAPI = require('./modules/api');
            const api = new MeEventosAPI();
            const eventsData = await api.getUpcomingEvents();

            console.log(`📡 API Pública: Processando ${eventsData.length} eventos vivos para compromissos...`);

            eventsData.forEach(event => {
                const isMainDate = event.dataevento === targetDateStr;

                // 2.1 Identificar Dia de Montagem (Véspera do evento principal)
                const targetDateObj = new Date(targetDateStr + 'T00:00:00');
                const nextDayObj = new Date(targetDateObj);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDayStr = nextDayObj.toISOString().split('T')[0];
                const isAutoSetupDay = (event.dataevento === nextDayStr);

                // 2.2 Formato brasileiro para busca em texto (ex: 12/02/2026)
                const dateParts = targetDateStr.split('-');
                const brazilianDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                const textToSearch = ((event.observacao || '') + (event.informacoes || '') + (event.nomeevento || '')).toLowerCase();
                const isTextMentioned = textToSearch.includes(targetDateStr) || textToSearch.includes(brazilianDate);

                let isAdditionalDate = false;
                if (event.datasAdicionais && Array.isArray(event.datasAdicionais)) {
                    isAdditionalDate = event.datasAdicionais.some(d => {
                        const start = d.inicio ? d.inicio.split(' ')[0] : '';
                        const end = d.fim ? d.fim.split(' ')[0] : '';
                        // Range check: Se a data consultada está entre o início e o fim (inclusive)
                        return (targetDateStr >= start && targetDateStr <= end);
                    });
                }

                // Se houver qualquer indício de que o item está em uso nesta data
                if (isMainDate || isAdditionalDate || isTextMentioned || isAutoSetupDay) {
                    // Carregar equipamentos do cache para este evento específico
                    const cacheFile = `./logs/cache_equipamentos/evento_${event.id}.json`;
                    let equipamentos = [];
                    if (fs.existsSync(cacheFile)) {
                        try {
                            const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                            equipamentos = cacheData.equipamentos || [];
                        } catch (e) {
                            console.warn(`⚠️ Erro ao ler cache do evento ${event.id}`);
                        }
                    }

                    if (equipamentos.length > 0) {
                        equipamentos.forEach(eq => {
                            const normalizedEqName = normalizeName(eq.nome);
                            const qty = parseInt(eq.quantidade) || 0;
                            if (normalizedEqName) {
                                eventCommitments[normalizedEqName] = (eventCommitments[normalizedEqName] || 0) + qty;
                            }
                        });
                    }
                }
            });
            console.log(`📅 Calculados compromissos reais para ${targetDateStr}: ${Object.keys(eventCommitments).length} itens.`);
        } catch (err) {
            console.error('❌ Erro ao buscar eventos vivos para API Pública:', err.message);
            // Fallback para arquivo consolidado se a API falhar (comportamento anterior)
            const eventsPath = path.join(__dirname, 'logs/eventos_completos.json');
            if (fs.existsSync(eventsPath)) {
                try {
                    const fallbackData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
                    fallbackData.eventos.forEach(event => {
                        const isMainDate = event.dataevento === targetDateStr;
                        if (isMainDate) {
                            (event.equipamentos || []).forEach(eq => {
                                const normalizedEqName = normalizeName(eq.nome);
                                const qty = parseInt(eq.quantidade) || 0;
                                if (normalizedEqName) {
                                    eventCommitments[normalizedEqName] = (eventCommitments[normalizedEqName] || 0) + qty;
                                }
                            });
                        }
                    });
                } catch (e) { }
            }
        }

        const consolidated = inventory.items.map(item => {
            const itemId = String(item.id);
            const normalizedInvName = normalizeName(item.nome);
            const units = qrUnits[itemId] || [];

            // Status dos QRs (disponibilidade física AGORA)
            const availableUnits = units.filter(u => u.status === 'disponivel').length;
            const maintenanceUnits = units.filter(u => u.status === 'manutencao').length;

            // Calculo de Lotes (Granel)
            let bulkTotal = 0;
            if (item.barcodeQuantities) {
                bulkTotal = Object.values(item.barcodeQuantities).reduce((a, b) => a + (parseInt(b) || 0), 0);
            }

            const physicalAvailable = availableUnits + bulkTotal;
            const commitments = eventCommitments[normalizedInvName] || 0;

            // Disponibilidade REAL para a data consultada
            const realAvailability = Math.max(0, physicalAvailable - commitments);

            return {
                id: item.id,
                name: item.nome,
                category: item.categoria,
                total_stock: parseInt(item.estoque) || 0,
                real_stock_available: realAvailability,
                maintenance: maintenanceUnits,
                commitments_on_date: commitments,
                value: item.valorVenda || '0,00',
                units_detail: units.map(u => ({
                    qr_code: u.qrCode,
                    status: u.status,
                    last_event: u.lastEventId || null
                }))
            };
        });

        res.json({
            timestamp: new Date().toISOString(),
            date_queried: queryDate,
            total_items: consolidated.length,
            data: consolidated
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. GET Status de Evento
app.get('/api/v1/public/events/:eventId', apiKeyAuth, (req, res) => {
    try {
        const { eventId } = req.params;
        // Aceita idorcamento OU id do evento — tenta idorcamento primeiro
        let progressFile = `logs/tick_progress/evento_${eventId}.json`;

        if (fs.existsSync(progressFile)) {
            const data = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
            res.json(data);
        } else {
            // Fallback: varrer tick_progress procurando por idorcamento no conteúdo
            const progressDir = 'logs/tick_progress';
            if (fs.existsSync(progressDir)) {
                const files = fs.readdirSync(progressDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    try {
                        const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
                        if (String(data.idorcamento) === String(eventId)) {
                            return res.json(data);
                        }
                    } catch (_) {}
                }
            }
            res.status(404).json({ error: 'Evento não encontrado ou sem movimentação.' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. GET Pendências Gerais
app.get('/api/v1/public/pendencies', apiKeyAuth, (req, res) => {
    try {
        const progressDir = 'logs/tick_progress';
        if (!fs.existsSync(progressDir)) return res.json([]);

        const files = fs.readdirSync(progressDir);
        const pendencies = [];

        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(`${progressDir}/${file}`, 'utf-8'));
            if (data.status === 'returned_partial') {
                // Calcular o que falta
                const missingItems = data.separatedItems.filter(i => {
                    const returned = i.returned ? (i.qtySeparada || 0) : (i.qtyReturned || 0);
                    return returned < (i.qtySeparada || 0);
                }).map(i => ({
                    name: i.nome,
                    missing_qty: (i.qtySeparada || 0) - (i.returned ? (i.qtySeparada || 0) : (i.qtyReturned || 0))
                }));

                pendencies.push({
                    event_id: data.eventId,
                    event_name: data.eventName,
                    missing_items: missingItems,
                    last_update: data.lastUpdated
                });
            }
        }

        res.json(pendencies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar item ao evento (usado pelo Puxar Itens)
app.post('/api/eventos/:id/add-item', (req, res) => {
    try {
        const eventId = req.params.id;
        const { nome, quantidade } = req.body;

        if (!nome || !quantidade) {
            return res.status(400).json({ error: 'Nome e quantidade obrigatórios' });
        }

        const eventsPath = path.join(__dirname, 'data/eventos.json');
        if (!fs.existsSync(eventsPath)) {
            return res.status(404).json({ error: 'Arquivo de eventos não encontrado' });
        }

        const data = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
        const eventoIndex = data.eventos.findIndex(e => String(e.id) === String(eventId));

        if (eventoIndex === -1) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        const evento = data.eventos[eventoIndex];
        if (!evento.equipamentos) evento.equipamentos = [];

        // Verificar se item já existe
        const normalize = s => s.toLowerCase().trim().replace(/\s+/g, ' ');
        const existingItemIndex = evento.equipamentos.findIndex(e =>
            normalize(e.nome) === normalize(nome)
        );

        if (existingItemIndex === -1) {
            // Se não existe, adicionar à lista de NECESSÁRIOS
            evento.equipamentos.push({
                nome: nome,
                quantidade: parseInt(quantidade)
            });

            fs.writeFileSync(eventsPath, JSON.stringify(data, null, 2));
            console.log(`📦 Item "${nome}" adicionado ao evento ${eventId}`);
        } else {
            // Se já existe, não precisamos alterar a necessidade, apenas confirmar
            console.log(`ℹ️ Item "${nome}" já existe no evento ${eventId}, mantendo quantidade original.`);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Erro ao adicionar item ao evento:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sincronizar (Scraper) evento específico manualmente
// Observabilidade do sync: grava o resultado da última execução para diagnóstico.
function writeSyncStatus(status) {
    try {
        fs.writeFileSync('logs/sync_status.json', JSON.stringify({
            ...status,
            at: new Date().toISOString()
        }, null, 2));
    } catch (e) { /* não crítico */ }
}

// Retorna o resultado do último sync (para diagnóstico do scraper sem ler logs do Railway).
app.get('/api/sync-status', (req, res) => {
    try {
        if (fs.existsSync('logs/sync_status.json')) {
            res.json(JSON.parse(fs.readFileSync('logs/sync_status.json', 'utf-8')));
        } else {
            res.json({ status: 'nunca executado' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/eventos/:id/sync', (req, res) => {
    const eventId = req.params.id;
    console.log(`🔄 Sync do evento ${eventId} iniciado em segundo plano`);

    // Responde IMEDIATAMENTE para não congelar a página (o scraper roda depois).
    res.status(202).json({
        success: true,
        started: true,
        message: 'Atualização iniciada em segundo plano. Recarregue o evento em alguns segundos.'
    });

    // Executa o scraper após responder — não bloqueia a UI nem o event loop da resposta.
    (async () => {
        writeSyncStatus({ scope: 'evento', eventId, ok: null, phase: 'iniciado' });
        try {
            const syncEventoUnico = require('./scripts/sync_evento_unico');
            const result = await syncEventoUnico(eventId);
            console.log(`✅ Sync evento ${eventId}: ${result.total} itens extraídos.`);
            writeSyncStatus({ scope: 'evento', eventId, ok: true, total: result.total, message: `${result.total} itens extraídos` });
        } catch (error) {
            console.error(`❌ Sync evento ${eventId} falhou:`, error.message);
            writeSyncStatus({ scope: 'evento', eventId, ok: false, error: String(error && error.message || error), stack: String(error && error.stack || '').slice(0, 800) });
        }
    })();
});

// Sincronizar TODOS eventos manualmente (ASSÍNCRONO — não bloqueia o servidor)
app.post('/api/sync-events', (req, res) => {
    try {
        console.log('🔄 Sync GLOBAL iniciado em segundo plano');

        const { spawn } = require('child_process');

        // spawn ASSÍNCRONO: o processo roda em background e o Node NÃO trava.
        // (spawnSync travava o event loop inteiro por até 2 min — congelava o site todo.)
        const child = spawn('node', ['scripts/sync_eventos_equipamentos.js'], {
            cwd: __dirname,
            detached: true,
            stdio: 'ignore'
        });
        child.on('error', (e) => console.error('❌ Falha ao iniciar sync global:', e.message));
        child.unref();

        // Responde IMEDIATAMENTE — a UI não congela.
        res.status(202).json({
            success: true,
            started: true,
            message: 'Sincronização iniciada em segundo plano. Atualize a lista em 1–2 minutos.'
        });

    } catch (error) {
        console.error('Erro ao iniciar sync global:', error.message);
        res.status(500).json({ error: 'Erro ao iniciar sync: ' + error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT} (0.0.0.0)`);
    console.log(`🎤 Abra no navegador para usar Mark com voz!\n`);
});
