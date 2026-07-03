const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../logs/inventory_complete.json');

try {
    if (!fs.existsSync(filePath)) {
        console.error('Arquivo não encontrado:', filePath);
        process.exit(1);
    }

    const inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fixedCount = 0;
    let totalRemoved = 0;

    console.log(`Analisando ${inventory.items.length} itens...`);

    inventory.items.forEach(item => {
        if (item.barcodes && Array.isArray(item.barcodes) && item.barcodes.length > 0) {
            const originalLength = item.barcodes.length;
            const quantities = item.barcodeQuantities || {};

            // Filtrar apenas barcodes que possuem registro de quantidade (mesmo que seja 0, mas se for 0 deveria ter sido deletado do obj, então só verificamos se a chave existe)
            // Se a chave não existe em barcodeQuantities, é um fantasma.

            const validBarcodes = item.barcodes.filter(code => {
                const hasQty = Object.prototype.hasOwnProperty.call(quantities, code);
                if (!hasQty) {
                    // console.log(`   👻 Fantasma detectado em "${item.nome}": ${code}`);
                }
                return hasQty;
            });

            if (validBarcodes.length !== originalLength) {
                const removed = originalLength - validBarcodes.length;
                console.log(`🔧 Corrigindo "${item.nome}": ${originalLength} -> ${validBarcodes.length} (Rmv: ${removed})`);
                item.barcodes = validBarcodes;
                fixedCount++;
                totalRemoved += removed;
            }
        }
    });

    if (fixedCount > 0) {
        // Backup antes de salvar
        const backupPath = filePath.replace('.json', `.cleanup_${Date.now()}.json`);
        fs.copyFileSync(filePath, backupPath);
        console.log(`📦 Backup criado em: ${backupPath}`);

        // Salvar
        fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));
        console.log(`✅ Concluído! ${fixedCount} itens corrigidos. ${totalRemoved} barcodes fantasmas removidos.`);
    } else {
        console.log("✅ Nenhum barcode fantasma encontrado. O banco de dados está consistente.");
    }

} catch (e) {
    console.error('Erro:', e.message);
}
