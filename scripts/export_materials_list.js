/**
 * Script: Exportar Lista de Materiais para Filtragem
 * Função: Buscar todos equipamentos da API e salvar em um arquivo de texto simples
 */

const MeEventosAPI = require('../modules/api');
const fs = require('fs');
const path = require('path');

async function exportMaterials() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   📦 EXPORTANDO MATERIAIS PARA FILTRAGEM');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        const api = new MeEventosAPI();

        // Buscar equipamentos da API
        const equipment = await api.getAllEquipment();

        if (!equipment || equipment.length === 0) {
            console.log('⚠️  Nenhum equipamento encontrado na API');
            return;
        }

        // Ler QRs existentes para exclusão
        const qrUnitsPath = path.join(__dirname, '../logs/qr_units.json');
        let existingQrIds = [];
        if (fs.existsSync(qrUnitsPath)) {
            try {
                const qrData = JSON.parse(fs.readFileSync(qrUnitsPath, 'utf-8'));
                // Pegar IDs que têm unidades cadastradas
                existingQrIds = Object.keys(qrData.units || {}).filter(id => {
                    const units = qrData.units[id];
                    return units && units.length > 0;
                });
                console.log(`ℹ️  ${existingQrIds.length} itens já possuem QR Codes e serão removidos da lista.`);
            } catch (e) {
                console.error('Erro ao ler qr_units:', e);
            }
        }

        // Ordenar por nome
        equipment.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        // Criar conteúdo do arquivo
        let fileContent = "================================================================\n";
        fileContent += "LISTA DE MATERIAIS FILTRADA (SEM ITENS COM QR ÚNICO)\n";
        fileContent += "Instrução: Deixe apenas os itens que serão GRANEL/LOTE.\n";
        fileContent += "================================================================\n\n";

        let excludedCount = 0;
        let includedCount = 0;

        equipment.forEach(item => {
            // == FILTRO: Se ID estiver na lista de QRs existentes, PULAR ==
            if (existingQrIds.includes(item.id.toString())) {
                excludedCount++;
                return;
            }

            const name = item.nome ? item.nome.trim() : 'SEM NOME';
            const category = getCategoryName(item.categoria);
            const id = item.id;
            fileContent += `[${id}] ${name} | ${category}\n`;
            includedCount++;
        });

        console.log(`\n📊 Resumo da Exportação:`);
        console.log(`   Total API: ${equipment.length}`);
        console.log(`   Removidos (Já têm QR): ${excludedCount}`);
        console.log(`   Mantidos na Lista: ${includedCount}`);

        // Salvar arquivo na raiz (Desktop do user seria ideal, mas vamos por na pasta do projeto por segurança)
        // O user pediu "crie um arquivo". Vamos salvar em 'materiais_para_filtrar.txt' na raiz do projeto.
        const outputPath = path.join(__dirname, '../materiais_para_filtrar.txt');
        fs.writeFileSync(outputPath, fileContent);

        console.log(`\n✅ Arquivo criado com sucesso!`);
        console.log(`   Total de itens: ${equipment.length}`);
        console.log(`   Local: ${outputPath}\n`);

    } catch (error) {
        console.error('\n❌ Erro ao exportar:', error.message);
    }
}

// Função auxiliar (copiada do sync)
function getCategoryName(categoryId) {
    const categories = {
        '1': 'SONORIZAÇÃO', '2': 'ILUMINAÇÃO', '3': 'VIDEO', '4': 'CABEAMENTO',
        '5': 'ESTRUTURA', '6': 'EQUIPAMENTOS E ACESSORIOS', '7': 'GERADORES E ENERGIA',
        '8': 'INSUMOS', '9': 'LOGISTICA',
        '109': 'SONORIZAÇÃO', '186': 'INSUMOS', '212': 'ILUMINAÇÃO',
        '215': 'VIDEO', '248': 'CABEAMENTO', '251': 'EQUIPAMENTOS E ACESSORIOS',
        '252': 'ESTRUTURA', '260': 'LOGISTICA'
    };
    return categories[categoryId] || `Cat-${categoryId}`;
}

exportMaterials();
