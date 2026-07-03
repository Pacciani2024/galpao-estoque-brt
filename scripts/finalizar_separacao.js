/**
 * Script: Finalizar Separação
 * Marca lista como separada (estoque reduzido virtualmente)
 */

const EstoqueManager = require('../modules/estoque_manager');

async function finalizar() {
    const eventoId = process.argv[2];

    if (!eventoId) {
        console.log('\n❌ Uso: node finalizar_separacao.js [eventoId]');
        console.log('   Exemplo: node finalizar_separacao.js 576\n');
        process.exit(1);
    }

    const manager = new EstoqueManager();

    try {
        const lista = manager.finalizarSeparacao(eventoId);

        console.log('\n✅ SEPARAÇÃO FINALIZADA!');
        console.log('═'.repeat(80));
        console.log('');
        console.log(`   Evento: ${lista.nomeEvento}`);
        console.log(`   Data Separação: ${lista.dataSeparacao}`);
        console.log(`   Total Itens: ${lista.equipamentos.length}`);
        console.log('');
        console.log(`📤 Equipamentos SAÍRAM do estoque disponível`);
        console.log('');
        console.log('💡 Para devolver, funcionário deve escanear QR novamente:');
        console.log(`   node confirmar_qr.js ${eventoId} "[item]" [qrCode] entrada\n`);

    } catch (error) {
        console.error('\n❌ Erro:', error.message, '\n');
        process.exit(1);
    }
}

finalizar();
