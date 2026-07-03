const fs = require('fs');

const data = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

console.log('Total items:', data.items.length);
console.log('\nPrimeiro item:');
console.log(JSON.stringify(data.items[0], null, 2));

console.log('\nCampos disponíveis:');
console.log(Object.keys(data.items[0]));
