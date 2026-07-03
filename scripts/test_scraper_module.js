/**
 * Script de Teste: Módulo Scraper
 * Testa extração de equipamentos usando o módulo
 */

const EventosScraper = require('../modules/scraper');

async function testScraper() {
    const eventId = process.argv[2] || '566';

    console.log('\n🧪 TESTE: Módulo Scraper');
    console.log('═'.repeat(80));
    console.log(`📋 Evento ID: ${eventId}\n`);

    try {
        const scraper = new EventosScraper();

        console.log('🔐 Fazendo login...');
        console.log('📄 Acessando página de equipamentos...');
        console.log('📦 Extraindo dados...\n');

        const resultado = await scraper.getEquipamentos(eventId);

        console.log('✅ Scraping concluído!\n');
        console.log('─'.repeat(80));
        console.log(`📦 Total de itens: ${resultado.total}\n`);

        if (resultado.equipamentos.length > 0) {
            console.log('PRIMEIROS 10 EQUIPAMENTOS:\n');
            resultado.equipamentos.slice(0, 10).forEach((item, index) => {
                console.log(`${index + 1}. ${item.nome}`);
                console.log(`   Qtd: ${item.quantidade} un | Categoria: ${item.categoria}\n`);
            });

            if (resultado.total > 10) {
                console.log(`... e mais ${resultado.total - 10} itens\n`);
            }
        }

        // Salvar
        scraper.saveToFile(eventId, resultado);
        console.log(`💾 Salvo em: logs/cache_equipamentos/evento_${eventId}.json\n`);

        console.log('═'.repeat(80));
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!\n');

    } catch (error) {
        console.error('\n❌ ERRO:', error.message);
        console.log('\n📸 Screenshot de erro pode ter sido salvo em logs/screenshots/\n');
        process.exit(1);
    }
}

testScraper();
