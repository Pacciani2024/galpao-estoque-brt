const fs = require('fs');
const data = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

const cats = {};
data.items.forEach(i => {
    cats[i.categoria] = (cats[i.categoria] || 0) + 1;
});

console.log('\n✅ Categorias atualizadas:\n');
Object.keys(cats).sort().forEach(c => {
    console.log(`   ${c}: ${cats[c]} itens`);
});
