/**
 * Script de Teste: Inventory Scraper
 */

const InventoryScraper = require('../modules/inventory_scraper');

async function testInventoryScraper() {
    console.log('\n🧪 TESTE: Inventory Scraper');
    console.log('═'.repeat(80));

    try {
        const scraper = new InventoryScraper();
        const resultado = await scraper.getInventory();

        console.log('\n✅ Scraping concluído!\n');
        console.log('─'.repeat(80));
        console.log(`📦 Total de itens: ${resultado.total}\n`);

        // Salvar resultado
        scraper.saveToFile(resultado);
        console.log('💾 Salvo em: logs/inventory_result.json\n');

        console.log('═'.repeat(80));
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!\n');

    } catch (error) {
        console.error('\n❌ ERRO:', error.message);
        console.log('\n📸 Screenshot de erro pode ter sido salvo em logs/screenshots/\n');
        process.exit(1);
    }
}

testInventoryScraper();
