/**
 * Script: Finalizar Devolução
 * Marca lista como devolvida (estoque restaurado)
 */

const EstoqueManager = require('../modules/estoque_manager');

async function finalizarDevolucao() {
    const eventoId = process.argv[2];

    if (!eventoId) {
        console.log('\n❌ Uso: node finalizar_devolucao.js [eventoId]');
        console.log('   Exemplo: node finalizar_devolucao.js 576\n');
        process.exit(1);
    }

    const manager = new EstoqueManager();

    try {
        const lista = manager.finalizarDevolucao(eventoId);

        console.log('\n✅ DEVOLUÇÃO FINALIZADA!');
        console.log('═'.repeat(80));
        console.log('');
        console.log(`   Evento: ${lista.nomeEvento}`);
        console.log(`   Data Devolução: ${lista.dataDevolucao}`);
        console.log(`   Total Itens: ${lista.equipamentos.length}`);
        console.log('');
        console.log(`📥 Equipamentos RETORNARAM ao estoque disponível`);
        console.log('');
        console.log('✅ Ciclo completo: Separação → Uso → Devolução\n');

    } catch (error) {
        console.error('\n❌ Erro:', error.message, '\n');
        process.exit(1);
    }
}

finalizarDevolucao();
