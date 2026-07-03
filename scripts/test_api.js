/**
 * Script de Teste: API MeEventos
 * Valida se a API retorna metadados corretos para eventos >= hoje
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BASE_URL = process.env.MEEVENTOS_BASE_URL || 'https://api.meeventos.com.br';
const API_KEY = process.env.MEEVENTOS_API_KEY;

// IDs dos 5 eventos de teste (CORRIGIDOS após busca na API)
const TEST_EVENT_IDS = ['576', '566', '577', '326', '364'];

async function testAPI() {
    console.log('\n🧪 TESTE: API MeEventos');
    console.log('═'.repeat(80));
    console.log(`📍 Endpoint: ${BASE_URL}/events`);
    console.log(`🔑 API Key: ${API_KEY ? '✅ Configurada' : '❌ Faltando'}\n`);

    if (!API_KEY) {
        console.error('❌ ERRO: MEEVENTOS_API_KEY não encontrada no .env');
        process.exit(1);
    }

    try {
        // Data range: hoje até 2 anos no futuro
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDate = new Date(today);
        futureDate.setFullYear(today.getFullYear() + 2);

        const startDate = formatDate(today);
        const endDate = formatDate(futureDate);

        console.log(`📅 Filtro de data: ${startDate} até ${endDate}\n`);

        // Buscar TODAS as páginas
        let allEvents = [];
        let page = 1;
        let hasMorePages = true;

        console.log('🌍 Fazendo requisições (todas as páginas)...\n');

        while (hasMorePages) {
            const url = `${BASE_URL}/events?page=${page}&start=${startDate}&end=${endDate}&field_sort=dataevento&sort=asc`;

            console.log(`   📄 Página ${page}...`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': API_KEY,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 449) {
                // Sem mais dados
                console.log(`   ⚠️  Fim dos dados (status 449)\n`);
                break;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const pageEvents = result.data || [];

            console.log(`   ✅ ${pageEvents.length} eventos`);

            if (pageEvents.length === 0) {
                hasMorePages = false;
            } else {
                allEvents = allEvents.concat(pageEvents);

                // Verificar se há mais páginas
                const totalPages = result.total_page || 1;
                if (page >= totalPages) {
                    hasMorePages = false;
                } else {
                    page++;
                }
            }
        }

        console.log(`\n✅ Total: ${allEvents.length} eventos de todas as páginas\n`);
        console.log('─'.repeat(80));
        console.log('📋 EVENTOS RETORNADOS:\n');

        // Filtrar apenas os 5 eventos de teste
        const testEvents = allEvents.filter(e => TEST_EVENT_IDS.includes(e.id.toString()));

        if (testEvents.length === 0) {
            console.log('⚠️  Nenhum dos 5 eventos de teste encontrado na API');
            console.log('\nEventos disponíveis:');
            allEvents.forEach(e => {
                console.log(`   - ID ${e.id}: ${e.nomeevento} (${e.dataevento})`);
            });
        } else {
            testEvents.forEach(event => {
                console.log(`\n📌 ID: ${event.id}`);
                console.log(`   Nome: ${event.nomeevento || 'N/A'}`);
                console.log(`   Cliente: ${event.nomeCliente || 'N/A'}`);
                console.log(`   Local: ${event.localevento || event.local || 'N/A'}`);
                console.log(`   Data: ${event.dataevento || 'N/A'}`);
                console.log(`   Hora: ${event.horaevento || 'N/A'}`);
                console.log(`   Status: ${event.STATUS || 'N/A'}`);
            });

            console.log('\n' + '─'.repeat(80));
            console.log(`\n✅ Encontrados ${testEvents.length}/${TEST_EVENT_IDS.length} eventos de teste`);
        }

        // Salvar resultado completo
        const outputPath = './logs/test_api_result.json';
        require('fs').mkdirSync('./logs', { recursive: true });
        require('fs').writeFileSync(outputPath, JSON.stringify(testEvents, null, 2));
        console.log(`\n💾 Resultado salvo em: ${outputPath}\n`);

    } catch (error) {
        console.error('\n❌ ERRO:', error.message);
        process.exit(1);
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Executar
testAPI();
