/**
 * Chat Interativo com Mark
 * Agente IA da BRT Audiovisual
 */

const readline = require('readline');
const MarkAgent = require('../agent/index');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.clear();
    console.log('═'.repeat(80));
    console.log('  🤖 MARK - Agente IA da BRT Audiovisual');
    console.log('═'.repeat(80));
    console.log('');

    let agent;

    try {
        agent = new MarkAgent();
    } catch (error) {
        console.error('❌ Erro ao inicializar Mark:', error.message);
        console.log('\n💡 DICA: Configure GEMINI_API_KEY no arquivo .env\n');
        process.exit(1);
    }

    console.log('Digite suas perguntas ou comandos:');
    console.log('  /ajuda   - Ver comandos disponíveis');
    console.log('  /limpar  - Limpar histórico');
    console.log('  /sair    - Encerrar chat');
    console.log('');

    const askQuestion = () => {
        rl.question('Você: ', async (input) => {
            const message = input.trim();

            if (!message) {
                askQuestion();
                return;
            }

            // Comandos especiais
            if (message === '/sair') {
                console.log('\n👋 Até logo!\n');
                rl.close();
                process.exit(0);
            }

            if (message === '/limpar') {
                console.clear();
                agent.clearHistory();
                console.log('✅ Histórico limpo!\n');
                askQuestion();
                return;
            }

            if (message === '/ajuda') {
                console.log('\n📚 COMANDOS DISPONÍVEIS:\n');
                console.log('  /ajuda   - Esta mensagem');
                console.log('  /limpar  - Limpar histórico de conversas');
                console.log('  /sair    - Encerrar o chat\n');
                console.log('📝 EXEMPLOS DE PERGUNTAS:\n');
                console.log('  • Quanto temos em estoque de cabo XLR?');
                console.log('  • Quais eventos temos próxima semana?');
                console.log('  • Lista de itens com estoque zerado');
                console.log('  • Equipamentos do evento 566');
                console.log('  • Itens da categoria ILUMINAÇÃO\n');
                askQuestion();
                return;
            }

            // Processar mensagem
            console.log('\nMark: Processando...\n');

            try {
                const response = await agent.chatWithData(message);
                console.log(`Mark: ${response}\n`);
            } catch (error) {
                console.error('❌ Erro:', error.message, '\n');
            }

            askQuestion();
        });
    };

    askQuestion();
}

main();
