/**
 * Script: Criar Lista de Separação
 * Gera lista pendente de confirmação QR para um evento
 */

const EstoqueManager = require('../modules/estoque_manager');

async function criarLista() {
    const eventoId = process.argv[2];

    if (!eventoId) {
        console.log('\n❌ Uso: node criar_lista_separacao.js [eventoId]');
        console.log('   Exemplo: node criar_lista_separacao.js 576\n');
        process.exit(1);
    }

    console.log('\n📋 CRIANDO LISTA DE SEPARAÇÃO');
    console.log('═'.repeat(80));
    console.log('');

    const manager = new EstoqueManager();

    try {
        const lista = manager.criarListaSeparacao(eventoId);

        console.log(`✅ Lista criada para evento: ${lista.nomeEvento}`);
        console.log(`📅 Data do evento: ${lista.dataEvento}`);
        console.log(`📝 Total de itens: ${lista.equipamentos.length}\n`);

        console.log('📦 Equipamentos a separar:\n');
        lista.equipamentos.forEach((eq, i) => {
            console.log(`   ${i + 1}. ${eq.nome}`);
            console.log(`      Categoria: ${eq.categoria}`);
            console.log(`      Quantidade: ${eq.quantidadeRequerida}`);
            console.log(`      Status: ⏳ Pendente confirmação QR\n`);
        });

        console.log('═'.repeat(80));
        console.log('\n✅ Lista salva em: logs/alocacoes.json');
        console.log('\n💡 Próximo passo: Funcionário escaneia QR codes');
        console.log('   Use: node confirmar_qr.js [eventoId] [nomeItem] [qrCode]\n');

    } catch (error) {
        console.error('\n❌ Erro:', error.message, '\n');
        process.exit(1);
    }
}

criarLista();
