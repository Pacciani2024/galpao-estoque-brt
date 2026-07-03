/**
 * Script: Sincronização de Inventário via API
 * Função: Buscar equipamentos do me.eventos via API e atualizar inventory_complete.json
 */

const MeEventosAPI = require('../modules/api');
const fs = require('fs');
const path = require('path');

async function syncInventory() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   📦 SINCRONIZAÇÃO DE INVENTÁRIO VIA API');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        const api = new MeEventosAPI();

        // 1. Carregar inventário LOCAL ATUAL (antes de buscar da API para não perder)
        const localPath = path.join(__dirname, '../logs/inventory_complete.json');
        let localData = { items: [] };
        if (fs.existsSync(localPath)) {
            try {
                localData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
                console.log(`📂 Inventário local carregado: ${localData.items.length} itens`);
            } catch (e) {
                console.warn('⚠️ Erro ao ler inventário local:', e.message);
            }
        }

        // Criar MAPA de preservação (ID -> {barcodes, barcodeQuantities})
        const preservationMap = {};
        localData.items.forEach(item => {
            if (item.id) {
                preservationMap[String(item.id)] = {
                    barcodes: item.barcodes || [],
                    barcodeQuantities: item.barcodeQuantities || {}
                };
            }
        });
        console.log(`🛡️ Dados preservados em memória para ${Object.keys(preservationMap).length} itens.`);


        // 2. Buscar equipamentos da API
        const equipment = await api.getAllEquipment();

        if (!equipment || equipment.length === 0) {
            console.log('⚠️  Nenhum equipamento encontrado na API');
            return;
        }

        // 3. Transformar e MESCLAR dados
        const inventoryItems = equipment.map(item => {
            const newItem = {
                id: String(item.id),
                nome: item.nome || '',
                categoria: getCategoryName(item.categoria),
                marca: item.marca || '',
                modelo: item.modelo || '',
                estoque: parseFloat(item.total_em_estoque) || 0,
                valorCusto: formatCurrency(item.valor_de_custo),
                valorVenda: formatCurrency(item.valor_da_venda),
                codigo: item.codigo || '',
                ncm: item.ncm || '',
                descricao: item.descricao || '',
                medidaEstoque: item.medida_em_estoque || '1',
                modeloEstoque: item.modelo_estoque || '',
                lembreteEstoqueMinimo: item.lembrete_estoque_minimo || ''
            };

            // RESTAURAR DADOS LOCAIS (Merge)
            if (preservationMap[newItem.id]) {
                const saved = preservationMap[newItem.id];
                if (saved.barcodes && saved.barcodes.length > 0) {
                    newItem.barcodes = saved.barcodes;
                }
                if (saved.barcodeQuantities && Object.keys(saved.barcodeQuantities).length > 0) {
                    newItem.barcodeQuantities = saved.barcodeQuantities;
                }
            }

            return newItem;
        });

        // 4. Criar objeto final
        const inventoryData = {
            timestamp: new Date().toISOString(),
            totalPaginas: Math.ceil(equipment.length / 200),
            total: equipment.length,
            items: inventoryItems
        };

        // 5. Fazer BACKUP do arquivo atual antes de sobrescrever
        if (fs.existsSync(localPath)) {
            const backupPath = path.join(__dirname, '../logs/backups/inventory_pre_sync_' + Date.now() + '.json');
            // Garantir que pasta existe
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

            fs.copyFileSync(localPath, backupPath);
            console.log(`📦 Backup criado em: ${backupPath}`);
        }

        // 6. Salvar NOVO inventário mesclado
        fs.writeFileSync(localPath, JSON.stringify(inventoryData, null, 2));

        console.log(`\n✅ Inventário atualizado e mesclado com sucesso!`);
        console.log(`   Total de itens: ${equipment.length}`);
        console.log(`   Arquivo: ${localPath}\n`);

        // === PRESERVAR QR CODES (Atualizar IDs no qr_units.json se necessário) ===
        console.log('🔄 Verificando integridade dos QR codes...');
        await updateQRCodeIds(inventoryItems);


        console.log('═══════════════════════════════════════════════════════════');
        console.log('   ✅ SINCRONIZAÇÃO CONCLUÍDA!');
        console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Erro ao sincronizar inventário:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Função para atualizar IDs dos QR codes
async function updateQRCodeIds(newInventory) {
    const qrUnitsPath = path.join(__dirname, '../logs/qr_units.json');

    if (!fs.existsSync(qrUnitsPath)) {
        console.log('   ℹ️  Nenhum QR code cadastrado ainda');
        return;
    }

    try {
        const qrUnits = JSON.parse(fs.readFileSync(qrUnitsPath, 'utf-8'));
        const updatedUnits = {};
        let mappedCount = 0;

        // Para cada item com QR codes
        Object.keys(qrUnits.units).forEach(oldId => {
            const units = qrUnits.units[oldId];

            // Tentar encontrar o item no novo inventário pelo ID exato
            let newItem = newInventory.find(item => item.id === oldId);

            // Se não encontrou, manter o ID antigo (pode ser que o item ainda exista)
            if (newItem) {
                updatedUnits[newItem.id] = units;
                mappedCount++;
            } else {
                // Manter QR codes com ID antigo (não deletar dados)
                updatedUnits[oldId] = units;
            }
        });

        // Atualizar arquivo
        qrUnits.units = updatedUnits;
        fs.writeFileSync(qrUnitsPath, JSON.stringify(qrUnits, null, 2));

        console.log(`   ✅ QR codes preservados: ${Object.keys(updatedUnits).length} itens`);
        console.log(`   📊 IDs mapeados: ${mappedCount}`);

    } catch (error) {
        console.error('   ⚠️  Erro ao atualizar QR codes:', error.message);
    }
}



// Função auxiliar para formatar moeda
function formatCurrency(value) {
    if (!value) return '0,00';
    const num = parseFloat(value);
    return num.toFixed(2).replace('.', ',');
}

// Função auxiliar para mapear ID de categoria para nome
function getCategoryName(categoryId) {
    const categories = {
        // IDs antigos (1-9)
        '1': 'SONORIZAÇÃO',
        '2': 'ILUMINAÇÃO',
        '3': 'VIDEO',
        '4': 'CABEAMENTO',
        '5': 'ESTRUTURA',
        '6': 'EQUIPAMENTOS E ACESSORIOS',
        '7': 'GERADORES E ENERGIA',
        '8': 'INSUMOS',
        '9': 'LOGISTICA',

        // IDs novos da API (baseado em análise dos itens)
        '109': 'SONORIZAÇÃO',
        '186': 'INSUMOS',
        '212': 'ILUMINAÇÃO',
        '215': 'VIDEO',
        '248': 'CABEAMENTO',
        '251': 'EQUIPAMENTOS E ACESSORIOS',
        '252': 'ESTRUTURA',
        '260': 'LOGISTICA'
    };
    return categories[categoryId] || `Categoria ${categoryId}`;
}

// Executar
syncInventory();
