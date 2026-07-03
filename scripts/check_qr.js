const fs = require('fs');
const qr = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));

const total = Object.values(qr.units).reduce((sum, arr) => sum + arr.length, 0);
const items = Object.keys(qr.units).length;

console.log(`\n✅ QR Codes preservados: ${total} unidades em ${items} itens diferentes\n`);
