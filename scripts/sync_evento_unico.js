/**
 * Módulo de Sincronização Única
 * Pode ser chamado via require() ou linha de comando
 */
const scraperManager = require('../modules/scraper_manager');
const fs = require('fs');

async function syncEventoUnico(eventoId) {
    if (!eventoId) {
        throw new Error('ID do evento não fornecido.');
    }

    console.log(`\n🔄 [SYNC] Iniciando sincronização do evento ${eventoId}...`);

    try {
        // Obter scraper persistente (mesma instância do server se chamado via require)
        const scraper = await scraperManager.getScraper();

        const equipamentos = await scraper.getEquipamentos(eventoId);

        console.log(`   ✅ ${equipamentos.total} itens extraídos.`);

        // Salvar cache
        const cacheFile = `./logs/cache_equipamentos/evento_${eventoId}.json`;

        if (!fs.existsSync('./logs/cache_equipamentos')) {
            fs.mkdirSync('./logs/cache_equipamentos', { recursive: true });
        }

        const resultadoScrape = {
            ...equipamentos,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(cacheFile, JSON.stringify(resultadoScrape, null, 2));
        console.log(`   💾 Cache atualizado: ${cacheFile}`);

        return { success: true, total: equipamentos.total };

    } catch (error) {
        console.error(`❌ Erro no sync do evento ${eventoId}:`, error.message);
        throw error;
    }
}

// Se for executado diretamente via CLI
if (require.main === module) {
    const id = process.argv[2];
    if (!id) {
        console.error('ID não fornecido');
        process.exit(1);
    }
    syncEventoUnico(id).then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = syncEventoUnico;
