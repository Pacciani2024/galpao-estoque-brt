const fs = require('fs');

const qrUnits = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
const inventory = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

console.log('--- Debug matching for ID 2 ---');
const itemId = "2";
const units = qrUnits.units[itemId];
console.log('Units for ID 2:', units ? units.length : 'None');

const item = inventory.items.find(i => i.id === itemId);
console.log('Item found for ID 2:', item ? item.nome : 'Not found');

if (item) {
    console.log('Item ID type:', typeof item.id);
    console.log('Item ID value:', item.id);
} else {
    console.log('Searching by number 2...');
    const itemNum = inventory.items.find(i => i.id == 2);
    console.log('Item found for ID 2 (loose match):', itemNum ? itemNum.nome : 'Not found');

    if (inventory.items.length > 0) {
        console.log('First item ID:', inventory.items[0].id);
        console.log('First item ID type:', typeof inventory.items[0].id);
    }
}
