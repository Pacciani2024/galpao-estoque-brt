const fs = require('fs');

const data = JSON.parse(fs.readFileSync('logs/inventory_complete.json', 'utf-8'));

// Extrair todas as categorias únicas e seus IDs originais da API
const categoriesMap = {};
const rawCategories = new Set();

data.items.forEach(item => {
    const cat = item.categoria;
    rawCategories.add(cat);

    if (cat && cat.startsWith('Categoria ')) {
        const id = cat.replace('Categoria ', '');
        if (!categoriesMap[id]) {
            categoriesMap[id] = {
                count: 0,
                examples: []
            };
        }
        categoriesMap[id].count++;
        if (categoriesMap[id].examples.length < 5) {
            categoriesMap[id].examples.push(item.nome);
        }
    }
});

let output = '\n📊 CATEGORIAS ENCONTRADAS:\n\n';

// Mostrar categorias já mapeadas
output += '✅ Categorias com nome legível:\n';
rawCategories.forEach(cat => {
    if (!cat.startsWith('Categoria ')) {
        const count = data.items.filter(i => i.categoria === cat).length;
        output += `   ${cat}: ${count} itens\n`;
    }
});

// Mostrar categorias que precisam de mapeamento
output += '\n❌ Categorias sem mapeamento (mostrando como número):\n';
Object.keys(categoriesMap).sort((a, b) => parseInt(a) - parseInt(b)).forEach(id => {
    output += `\n   ID ${id}: ${categoriesMap[id].count} itens\n`;
    output += `   Exemplos: ${categoriesMap[id].examples.join(', ')}\n`;
});

console.log(output);
fs.writeFileSync('logs/category_analysis.txt', output);
console.log('\n💾 Análise salva em: logs/category_analysis.txt');
