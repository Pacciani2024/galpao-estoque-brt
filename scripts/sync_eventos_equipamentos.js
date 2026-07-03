/**
 * Script de Sincronização: Eventos + Equipamentos
 * 
 * Busca eventos da API e executa scraper de equipamentos
 * OTIMIZADO: Usa ScraperManager para manter sessão persistente
 */

const MeEventosAPI = require('../modules/api');
const scraperManager = require('../modules/scraper_manager');
const fs = require('fs');

async function syncEventosEquipamentos() {
    console.log('\n🔄 SINCRONIZAÇÃO: Eventos + Equipamentos');
    console.log('═'.repeat(80));
    console.log('');

    // 1. BUSCAR EVENTOS DA API
    console.log('📅 Passo 1: Buscando eventos da API...\n');

    const api = new MeEventosAPI();
    let eventos;

    try {
        eventos = await api.getUpcomingEvents();
        console.log(`✅ ${eventos.length} eventos encontrados:\n`);

        eventos.forEach((e, i) => {
            console.log(`   ${i + 1}. ID ${e.id} - ${e.nomeevento} (${e.dataevento})`);
        });
        console.log('');
    } catch (error) {
        console.error('❌ Erro ao buscar eventos:', error.message);
        process.exit(1);
    }

    // 2. SCRAPER DE EQUIPAMENTOS PARA CADA EVENTO
    console.log('📦 Passo 2: Executando scraper de equipamentos...\n');

    const resultados = [];

    try {
        // Obter scraper persistente (reutiliza sessão se já existe)
        const scraper = await scraperManager.getScraper();

        // SEPARAR NOVOS VS EXISTENTES
        const novosEventos = [];
        const eventosExistentes = [];

        eventos.forEach(e => {
            const cacheFile = `./logs/cache_equipamentos/evento_${e.id}.json`;
            if (fs.existsSync(cacheFile)) {
                // Verificar idade do cache
                const stats = fs.statSync(cacheFile);
                const idadeMs = Date.now() - stats.mtimeMs;
                const CACHE_VALIDADE_MS = 60 * 60 * 1000; // 1 hora

                if (idadeMs < CACHE_VALIDADE_MS) {
                    // Cache recente, pular (mas adicionar à lista para estatísticas se quiser)
                    // Ou processar com prioridade baixa.
                    // Vamos pular para focar em novos.
                    // console.log(`   ⏭️ Evento ${e.id} com cache recente (${Math.round(idadeMs/60000)}min). Pulando.`);
                } else {
                    eventosExistentes.push(e);
                }
            } else {
                novosEventos.push(e);
            }
        });

        console.log(`\n📋 FILA DE PROCESSAMENTO:`);
        console.log(`   🆕 Novos (PRIORIDADE): ${novosEventos.length}`);
        console.log(`   🔄 Atualizações (Antigos): ${eventosExistentes.length}`);
        console.log(`   ⏭️ Recentes (Pulados): ${eventos.length - novosEventos.length - eventosExistentes.length}\n`);

        // UNIR FILAS: Novos primeiro
        const filaScraping = [...novosEventos, ...eventosExistentes];

        for (let i = 0; i < filaScraping.length; i++) {
            const evento = filaScraping[i];
            const isNovo = novosEventos.includes(evento);
            const tag = isNovo ? '🆕 NOVO' : '🔄 ATUALIZAÇÃO';

            console.log(`─`.repeat(80));
            console.log(`\n🎯 [${tag}] Evento ${i + 1}/${filaScraping.length}: ${evento.nomeevento} (ID: ${evento.id})`);

            try {
                // Verificar se já existe cache (apenas log)
                const cacheFile = `./logs/cache_equipamentos/evento_${evento.id}.json`;
                if (fs.existsSync(cacheFile)) {
                    console.log('   ℹ️  Cache existente encontrado. Atualizando...');
                }

                // Executar scraper (REUTILIZA sessão ativa)
                const equipamentos = await scraper.getEquipamentos(evento.id);

                console.log(`   ✅ ${equipamentos.total} equipamentos extraídos`);

                // Salvar resultado
                const resultadoScrape = {
                    ...equipamentos,
                    lastUpdated: new Date().toISOString()
                };

                // Garantir diretório
                if (!fs.existsSync('./logs/cache_equipamentos')) {
                    fs.mkdirSync('./logs/cache_equipamentos', { recursive: true });
                }

                fs.writeFileSync(cacheFile, JSON.stringify(resultadoScrape, null, 2));
                // Também salvar versao backup no scraper.saveToFile se ele fizer algo extra,
                // mas vamos escrever direto aqui para garantir timestamp

                console.log(`   💾 Salvo em: ${cacheFile}\n`);

                resultados.push({
                    eventoId: evento.id,
                    nomeEvento: evento.nomeevento,
                    totalEquipamentos: equipamentos.total,
                    status: 'sucesso'
                });

                // Pausa entre scrapers
                if (i < filaScraping.length - 1) {
                    console.log('   ⏳ Aguardando 2 segundos antes do próximo...');
                    await new Promise(r => setTimeout(r, 2000));
                }

            } catch (error) {
                console.error(`   ❌ Erro no evento ${evento.id}:`, error.message, '\n');

                resultados.push({
                    eventoId: evento.id,
                    nomeEvento: evento.nomeevento,
                    totalEquipamentos: 0,
                    status: 'erro',
                    erro: error.message
                });
            }
        }

    } catch (error) {
        console.error('Erro durante sincronização:', error);
    }
    // NÃO fecha o browser - mantém sessão ativa para próximos scrapers!

    // 3. RESUMO FINAL
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 RESUMO DA SINCRONIZAÇÃO\n');

    const sucessos = resultados.filter(r => r.status === 'sucesso');
    const erros = resultados.filter(r => r.status === 'erro');

    console.log(`✅ Sucessos: ${sucessos.length}/${resultados.length}`);
    console.log(`❌ Erros: ${erros.length}/${resultados.length}\n`);

    if (sucessos.length > 0) {
        console.log('Eventos sincronizados:');
        sucessos.forEach(r => {
            console.log(`   • ${r.nomeEvento} - ${r.totalEquipamentos} equipamentos`);
        });
    }

    if (erros.length > 0) {
        console.log('\n⚠️  Eventos com erro:');
        erros.forEach(r => {
            console.log(`   • ${r.nomeEvento} - ${r.erro}`);
        });
    }

    // Salvar relatório de sincronização
    const relatorio = {
        timestamp: new Date().toISOString(),
        totalEventos: eventos.length,
        sucessos: sucessos.length,
        erros: erros.length,
        resultados: resultados
    };

    fs.mkdirSync('./logs', { recursive: true });
    fs.writeFileSync(
        './logs/sync_report.json',
        JSON.stringify(relatorio, null, 2)
    );

    console.log('\n💾 Relatório salvo em: logs/sync_report.json');
    console.log('💡 Sessão do browser permanece ativa para próximos scrapers!');
    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ SINCRONIZAÇÃO CONCLUÍDA!\n');
}

syncEventosEquipamentos().catch(error => {
    console.error('\n❌ ERRO FATAL:', error);
    process.exit(1);
});
