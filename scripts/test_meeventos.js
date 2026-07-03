const meEventos = require('../modules/meeventos_api');
const fs = require('fs');

async function runTest() {
    console.log('🔄 Iniciando teste da API MeEventos (Equipamentos)...');

    // 3. Tentar buscar TODOS os equipamentos
    try {
        console.log(`\n🔍 Buscando TODOS os Equipamentos...`);
        const items = await meEventos.getAllEquipment();

        fs.writeFileSync('logs/api_equipment_list.json', JSON.stringify(items, null, 2));
        console.log('✅ Lista salva em logs/api_equipment_list.json');

        if (items.length > 0) {
            console.log('Exemplo de Equipamento:', JSON.stringify(items[0], null, 2));
            // Verificar se tem preço
            const p = items[0];
            console.log(`\n💰 Preços encontrados?`);
            console.log(`Custo: ${p.valor_de_custo}`);
            console.log(`Venda: ${p.valor_da_venda}`);
            console.log(`Reposição: ${p.valor_da_reposicao}`);
        }
    } catch (e) {
        console.error('❌ Falha ao buscar equipamentos:', e.message);
        if (e.response) {
            console.log('Status:', e.response.status);
            console.log('Data:', JSON.stringify(e.response.data));
        }
    }
}

runTest();
