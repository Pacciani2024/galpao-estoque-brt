/**
 * Teste Automatizado do Mark
 * Faz perguntas pré-definidas para validar o agente
 */

const MarkAgent = require('../agent/index');

async function testMark() {
    console.log('\n🧪 TESTE: Mark AI Agent');
    console.log('═'.repeat(80));
    console.log('');

    let agent;

    try {
        agent = new MarkAgent();
    } catch (error) {
        console.error('❌ Erro ao inicializar Mark:', error.message);
        console.log('\n💡 SOLUÇÃO: Configure GEMINI_API_KEY no arquivo .env\n');
        process.exit(1);
    }

    const perguntas = [
        "Olá Mark, quantos itens temos no inventário total?",
        "Quais eventos temos programados?",
        "Quanto temos em estoque de cabos XLR?",
        "Liste 5 itens da categoria ILUMINAÇÃO"
    ];

    console.log('📝 Testando Mark com', perguntas.length, 'perguntas...\n');

    for (let i = 0; i < perguntas.length; i++) {
        const pergunta = perguntas[i];
        console.log(`─`.repeat(80));
        console.log(`\n🗣️  Pergunta ${i + 1}/${perguntas.length}:`);
        console.log(`   "${pergunta}"\n`);

        try {
            const resposta = await agent.chatWithData(pergunta);
            console.log('🤖 Mark:');
            console.log(`   ${resposta}\n`);
        } catch (error) {
            console.error(`❌ Erro na pergunta ${i + 1}:`, error.message, '\n');
        }

        // Pequena pausa entre perguntas
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('═'.repeat(80));
    console.log('\n✅ TESTE CONCLUÍDO!\n');
    console.log(`📊 Total de perguntas: ${perguntas.length}`);
    console.log(`📜 Histórico salvo: ${agent.getHistory().length} interações\n`);
}

testMark().catch(error => {
    console.error('\n❌ ERRO FATAL:', error.message);
    process.exit(1);
});
