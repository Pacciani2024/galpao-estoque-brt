const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('logs/inventory_complete.backup.json', 'utf8'));
    console.log(`Total itens: ${data.items.length}`);

    // Buscar item específico
    const item = data.items.find(i => i.nome.includes('CABO XLR SOM 3M'));

    if (item) {
        console.log('✅ ITEM ENCONTRADO:', item.nome);
        console.log('ID:', item.id);
        console.log('Barcodes:', item.barcodes);
        console.log('Quantities:', item.barcodeQuantities);
    } else {
        console.log('❌ ITEM NÃO ENCONTRADO: CABO XLR SOM 3M');

        // Buscar itens com quantidades salvas para ver se existe ALGUM
        const withQty = data.items.filter(i => i.barcodeQuantities && Object.keys(i.barcodeQuantities).length > 0);
        console.log(`Itens com quantidades salvas: ${withQty.length}`);
        if (withQty.length > 0) {
            console.log('Exemplos:', withQty.slice(0, 3).map(i => i.nome));
        }
    }
} catch (e) {
    console.error('Erro:', e.message);
}
