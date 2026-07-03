/**
 * Script: Mesclar Eventos + Equipamentos
 * 
 * Integra dados de equipamentos aos eventos da API
 */

const MeEventosAPI = require('../modules/api');
const fs = require('fs');
const path = require('path');

async function mergeEventosEquipamentos() {
    console.log('\n🔗 MESCLANDO: Eventos + Equipamentos');
    console.log('═'.repeat(80));
    console.log('');

    // 1. BUSCAR EVENTOS DA API
    const api = new MeEventosAPI();
    const eventos = await api.getUpcomingEvents();

    console.log(`📅 ${eventos.length} eventos encontrados\n`);

    // 2. CARREGAR EQUIPAMENTOS DE CADA EVENTO
    const eventosCompletos = [];

    for (const evento of eventos) {
        const cacheFile = `./logs/cache_equipamentos/evento_${evento.id}.json`;

        let equipamentos = [];
        let totalEquipamentos = 0;

        if (fs.existsSync(cacheFile)) {
            const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            equipamentos = data.equipamentos || [];
            totalEquipamentos = data.total || 0;
        }

        // Montar evento completo
        const eventoCompleto = {
            ...evento,
            equipamentos: equipamentos,
            totalEquipamentos: totalEquipamentos,
            temEquipamentos: totalEquipamentos > 0
        };

        eventosCompletos.push(eventoCompleto);

        const status = totalEquipamentos > 0 ? '✅' : '⚠️ ';
        console.log(`${status} Evento ${evento.id}: ${evento.nomeevento} - ${totalEquipamentos} equipamentos`);
    }

    console.log('');

    // 3. SALVAR RESULTADO
    const resultado = {
        timestamp: new Date().toISOString(),
        total: eventosCompletos.length,
        comEquipamentos: eventosCompletos.filter(e => e.temEquipamentos).length,
        semEquipamentos: eventosCompletos.filter(e => !e.temEquipamentos).length,
        eventos: eventosCompletos
    };

    fs.mkdirSync('./logs', { recursive: true });
    fs.writeFileSync(
        './logs/eventos_completos.json',
        JSON.stringify(resultado, null, 2)
    );

    console.log('═'.repeat(80));
    console.log('\n📊 RESUMO:\n');
    console.log(`   Total de eventos: ${resultado.total}`);
    console.log(`   ✅ Com equipamentos: ${resultado.comEquipamentos}`);
    console.log(`   ⚠️  Sem equipamentos: ${resultado.semEquipamentos}`);
    console.log('\n💾 Salvo em: logs/eventos_completos.json\n');

    return resultado;
}

mergeEventosEquipamentos().catch(error => {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
});
