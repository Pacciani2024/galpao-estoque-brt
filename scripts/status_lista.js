/**
 * Script: Status da Lista de Separação
 * Mostra progresso de confirmação QR
 */

const EstoqueManager = require('../modules/estoque_manager');

async function statusLista() {
    const eventoId = process.argv[2];

    if (!eventoId) {
        console.log('\n❌ Uso: node status_lista.js [eventoId]');
        console.log('   Exemplo: node status_lista.js 576\n');
        process.exit(1);
    }

    const manager = new EstoqueManager();

    try {
        const lista = manager.getListaSeparacao(eventoId);

        if (!lista) {
            console.log(`\n⚠️  Nenhuma lista encontrada para evento ${eventoId}\n`);
            process.exit(1);
        }

        console.log('\n📋 STATUS DA LISTA DE SEPARAÇÃO');
        console.log('═'.repeat(80));
        console.log('');
        console.log(`   Evento: ${lista.nomeEvento}`);
        console.log(`   Data Evento: ${lista.dataEvento}`);
        console.log(`   Status: ${getStatusEmoji(lista.status)} ${lista.status.toUpperCase()}`);
        console.log('');

        const totalItens = lista.equipamentos.length;
        const itensCompletos = lista.equipamentos.filter(
            e => e.quantidadeConfirmada === e.quantidadeRequerida
        ).length;

        console.log(`📊 Progresso: ${itensCompletos}/${totalItens} itens completos\n`);

        lista.equipamentos.forEach((eq, i) => {
            const progresso = eq.quantidadeConfirmada / eq.quantidadeRequerida;
            const status = progresso === 1 ? '✅' : progresso > 0 ? '⏳' : '⚠️ ';

            console.log(`${status} ${eq.nome}`);
            console.log(`   ${eq.quantidadeConfirmada}/${eq.quantidadeRequerida} confirmados`);
            console.log(`   Categoria: ${eq.categoria}`);

            if (eq.itensConfirmados.length > 0) {
                console.log(`   QR Codes: ${eq.itensConfirmados.map(i => i.qrCode).join(', ')}`);
            }
            console.log('');
        });

        console.log('═'.repeat(80));

        if (lista.status === 'pendente_separacao' && itensCompletos === totalItens) {
            console.log('\n✅ Todos itens confirmados! Execute:');
            console.log(`   node finalizar_separacao.js ${eventoId}\n`);
        }

    } catch (error) {
        console.error('\n❌ Erro:', error.message, '\n');
        process.exit(1);
    }
}

function getStatusEmoji(status) {
    const emojis = {
        'pendente_separacao': '⏳',
        'separado': '📤',
        'devolvido': '📥'
    };
    return emojis[status] || '❓';
}

statusLista();
