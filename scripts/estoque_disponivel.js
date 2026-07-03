/**
 * Script: Estoque Disponível
 * Mostra estoque real vs disponível (após alocações)
 */

const EstoqueManager = require('../modules/estoque_manager');

async function consultarEstoque() {
    const manager = new EstoqueManager();

    console.log('\n📊 ESTOQUE DISPONÍVEL');
    console.log('═'.repeat(80));
    console.log('');

    const estoque = manager.getEstoqueDisponivel();

    // Filtrar apenas itens com alocação ou estoque baixo
    const itensRelevantes = estoque.filter(i =>
        i.alocado > 0 || i.disponivel < 5
    );

    if (itensRelevantes.length === 0) {
        console.log('✅ Nenhum item alocado e estoque OK\n');
        return;
    }

    console.log('Itens com alocação ou estoque baixo:\n');

    itensRelevantes.forEach(item => {
        const status = item.disponivel === 0 ? '❌' : item.disponivel < 3 ? '⚠️ ' : '✅';

        console.log(`${status} ${item.nome}`);
        console.log(`   Total: ${item.estoqueTotal} un`);
        console.log(`   Alocado: ${item.alocado} un`);
        console.log(`   Disponível: ${item.disponivel} un`);
        console.log('');
    });

    const totalAlocado = itensRelevantes.reduce((sum, i) => sum + i.alocado, 0);
    console.log('═'.repeat(80));
    console.log(`\n📦 Total de itens alocados: ${totalAlocado}\n`);
}

consultarEstoque();
