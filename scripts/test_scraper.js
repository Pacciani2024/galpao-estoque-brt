/**
 * Script de Teste: Scraper de Equipamentos
 * Testa extração de equipamentos para os 5 eventos
 */

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// IDs dos 5 eventos de teste
const TEST_EVENT_IDS = ['576', '566', '578', '577', '580'];

async function testScraper() {
    console.log('\n🧪 TESTE: Scraper de Equipamentos');
    console.log('═'.repeat(80));
    console.log(`📋 Eventos a testar: ${TEST_EVENT_IDS.join(', ')}\n`);

    const results = [];

    for (const eventId of TEST_EVENT_IDS) {
        console.log(`\n🎯 Testando Evento ${eventId}...`);
        console.log('─'.repeat(80));

        try {
            await runScraper(eventId);

            // Verificar se arquivo foi criado
            const outputPath = path.join(__dirname, '../logs/cache_equipamentos', `evento_${eventId}.json`);

            if (fs.existsSync(outputPath)) {
                const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
                const equipCount = data.equipamentos ? data.equipamentos.length : 0;

                console.log(`✅ Sucesso: ${equipCount} equipamentos encontrados`);
                results.push({
                    eventId,
                    status: 'success',
                    equipmentCount: equipCount,
                    outputPath
                });
            } else {
                console.log(`⚠️  Arquivo not criado (evento sem equipamentos ou falha)`);
                results.push({
                    eventId,
                    status: 'no_data',
                    equipmentCount: 0
                });
            }

        } catch (error) {
            console.log(`❌ Erro: ${error.message}`);
            results.push({
                eventId,
                status: 'error',
                error: error.message
            });
        }
    }

    // Resumo final
    console.log('\n' + '═'.repeat(80));
    console.log('📊 RESUMO DOS TESTES\n');

    results.forEach(r => {
        const status = r.status === 'success' ? '✅' : r.status === 'no_data' ? '⚠️' : '❌';
        const detail = r.status === 'success' ? `${r.equipmentCount} equipamentos` : r.status;
        console.log(`${status} Evento ${r.eventId}: ${detail}`);
    });

    // Salvar resultado
    const summaryPath = './logs/test_scraper_result.json';
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Resultado salvo em: ${summaryPath}\n`);
}

function runScraper(eventId) {
    return new Promise((resolve, reject) => {
        const scraperPath = path.join(__dirname, '../agente/scraper_versao_final.js');
        const proc = spawn('node', [scraperPath, eventId], {
            cwd: path.join(__dirname, '..')
        });

        let output = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            output += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Scraper falhou com código ${code}`));
            }
        });

        // Timeout de 60 segundos
        setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout: scraper levou mais de 60s'));
        }, 60000);
    });
}

// Executar
testScraper().catch(err => {
    console.error('\n❌ ERRO FATAL:', err.message);
    process.exit(1);
});
