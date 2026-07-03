/**
 * Script: Registrar QRs em Cascata para Itens a Granel (COM LIMPEZA)
 * Função: 
 * 1. Ler lista filtrada (materiais_para_filtrar.txt)
 * 2. REMOVER QRs de granel (3000+) de itens que NÃO estão na lista.
 * 3. Atribuir códigos sequenciais (ex: 3000+) para os itens da lista.
 * 4. Salvar no campo 'barcodes' do inventory_complete.json
 * 5. Gerar arquivo print_queue.csv
 */

const fs = require('fs');
const path = require('path');

async function registerBulkQRs() {
    console.log('\n📦 REGISTRO DE QRS GRANEL (CASCATA) v2\n');

    const inventoryPath = path.join(__dirname, '../logs/inventory_complete.json');
    const filterPath = path.join(__dirname, '../materiais_para_filtrar.txt');

    if (!fs.existsSync(inventoryPath) || !fs.existsSync(filterPath)) {
        console.error('❌ Arquivos necessários não encontrados.');
        return;
    }

    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
    const filterContent = fs.readFileSync(filterPath, 'utf-8');

    // 1. Identificar IDs da lista filtrada
    const lines = filterContent.split('\n');
    const targetIds = [];

    lines.forEach(line => {
        // Formato: [ID] Nome ...
        const match = line.match(/^\[(\d+)\]/);
        if (match) {
            targetIds.push(match[1]); // String ID
        }
    });

    console.log(`📋 Lista ALVO: ${targetIds.length} itens.`);

    // 2. LIMPEZA: Remover QRs de granel (3000-899999) de quem NÃO está na lista
    let removedCount = 0;
    inventory.items.forEach(item => {
        // Se o item NÃO está na lista alvo, mas tem barcodes
        if (!targetIds.includes(item.id.toString()) && item.barcodes && item.barcodes.length > 0) {
            const initialLen = item.barcodes.length;

            // Manter apenas códigos que NÃO sejam do range de granel (ex: manter manuais ou EANs de fábrica)
            // Range Granel definido por nós: 3000 a 899999
            item.barcodes = item.barcodes.filter(code => {
                const num = parseInt(code);
                // Se for NaN, mantém (texto). Se for número fora do range 3000-899999, mantém.
                if (isNaN(num)) return true;
                if (num < 3000 || num >= 900000) return true;
                return false; // É do range granel, remove.
            });

            if (item.barcodes.length < initialLen) {
                removedCount++;
            }
        }
    });
    console.log(`🧹 Limpeza: QRs de granel removidos de ${removedCount} itens (não estavam na lista).`);

    // 3. Definir Início da Sequência Global
    let maxId = 2999;

    // Varrer inventário inteiro para achar maior ID em uso no range
    inventory.items.forEach(item => {
        if (item.barcodes && Array.isArray(item.barcodes)) {
            item.barcodes.forEach(code => {
                const num = parseInt(code);
                if (!isNaN(num) && num > maxId && num < 900000) {
                    maxId = num;
                }
            });
        }
    });

    console.log(`🔢 Sequência atual vai até: ${maxId}`);

    // Estratégia de ID: 
    // Para reciclar IDs (tapar buracos) é complexo e perigoso. 
    // Vamos apenas atribuir novos IDs incrementais para quem ainda não tem.
    // Se o item JÁ tem um ID no range, mantemos o mesmo.

    let currentId = maxId + 1;
    let addedCount = 0;
    const printList = [];

    targetIds.forEach(id => {
        const item = inventory.items.find(i => i.id == id);
        if (item) {
            let finalCode = null;

            // Verificar se JÁ OBTENHO um código válido no range
            if (item.barcodes && item.barcodes.length > 0) {
                finalCode = item.barcodes.find(c => {
                    const n = parseInt(c);
                    return !isNaN(n) && n >= 3000 && n < 900000;
                });
            }

            // Se não tem, gera novo
            if (!finalCode) {
                // Encontrar um ID livre (caso maxId tenha tapado buracos, mas aqui vamos no incremental seguro)
                // O loop abaixo garante que não vamos usar um ID que já existe (paranoid check)
                while (true) {
                    const candidate = currentId.toString();
                    const exists = inventory.items.some(i => i.barcodes && i.barcodes.includes(candidate));
                    if (!exists) {
                        finalCode = candidate;
                        currentId++; // Avança pro próximo
                        break;
                    }
                    currentId++; // Já existe, tenta próximo
                }

                if (!item.barcodes) item.barcodes = [];
                item.barcodes.push(finalCode);
                addedCount++;
            }

            printList.push({
                name: item.nome,
                code: finalCode,
                category: item.categoria
            });
        }
    });

    // 4. Salvar Inventário
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
    console.log(`✅ Inventário salvo! ${addedCount} novos QRs gerados.`);
    console.log(`📋 Total na lista de impressão: ${printList.length}`);

    // 5. Gerar CSV de conferência
    let csvContent = "Nome,Codigo,Categoria\n";
    printList.forEach(p => {
        csvContent += `"${p.name}",${p.code},"${p.category}"\n`;
    });

    const csvPath = path.join(__dirname, '../etiquetas_granel_geradas.csv');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`📄 Lista salva em: ${csvPath}`);
}

registerBulkQRs();
