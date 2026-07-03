const fs = require('fs');

const qrUnits = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
const inventory = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

console.log('--- Analyzing Orphaned QR Codes ---');

const inventoryIds = new Set(inventory.items.map(i => String(i.id)));
const orphanIds = [];

Object.keys(qrUnits.units).forEach(id => {
    if (!inventoryIds.has(String(id))) {
        orphanIds.push(id);
    }
});

console.log(`Found ${orphanIds.length} orphaned IDs.`);

orphanIds.forEach(id => {
    const scans = qrUnits.units[id];
    console.log(`\nID: ${id} | Count: ${scans.length}`);
    console.log(`  First Scan: ${scans[0].timestamp}`);
    console.log(`  Last Scan: ${scans[scans.length - 1].timestamp}`);
    console.log(`  Codes: ${scans.map(s => s.qrCode).join(', ')}`);
});

console.log('\n--- Possible Matches in Inventory ---');
// List items matching the descriptions user gave
const searchTerms = ['K12', '912', 'Evolve', 'Electro', 'Haste', 'Alta'];
inventory.items.forEach(item => {
    if (searchTerms.some(term => item.nome.toLowerCase().includes(term.toLowerCase()) ||
        item.modelo.toLowerCase().includes(term.toLowerCase()))) {
        console.log(`ID: ${item.id} | Stock: ${item.estoque} | Name: ${item.nome}`);
    }
});
