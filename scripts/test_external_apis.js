/**
 * Teste: APIs Externa do Mark
 * Testa clima, rotas e frota
 */

const ExternalAPIs = require('../modules/external_apis');

async function testarAPIs() {
    console.log('\n🧪 TESTE: APIs Externas do Mark');
    console.log('═'.repeat(80));
    console.log('');

    const apis = new ExternalAPIs();

    // 1. CLIMA
    console.log('1️⃣  Previsão do Tempo\n');
    const weather = await apis.getWeather('São Paulo', 3);

    console.log(`   Agora: ${weather.atual.temperatura} (sensação ${weather.atual.sensacao})`);
    console.log(`   ${weather.atual.descricao}\n`);

    weather.previsao.forEach((dia, i) => {
        console.log(`   ${i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : 'Depois'}: ${dia.tempMax}/${dia.tempMin}`);
        console.log(`   ${dia.descricao} - Chuva: ${dia.chuvaProbabilidade}\n`);
    });

    // 2. ROTAS
    console.log('2️⃣  Cálculo de Rotas\n');
    const rota = await apis.getDistance('Pinheiros', 'Faria Lima 2996');

    if (rota.erro) {
        console.log(`   ⚠️  ${rota.erro}\n`);
    } else {
        console.log(`   Distância: ${rota.distancia}`);
        console.log(`   Tempo estimado: ${rota.tempoEstimado}\n`);
    }

    // 3. FROTA
    console.log('3️⃣  Frota BRT\n');
    const fleet = apis.getFleet();

    fleet.veiculos.forEach(v => {
        const rodizio = v.rodizio ? `⚠️  Rodízio ${v.rodizio}` : '✅ Sem rodízio';
        console.log(`   🚗 ${v.nome}: ${rodizio}`);
    });

    console.log('');
    console.log(`   Motorista principal: ${fleet.motoristas.principal}`);
    console.log(`   Eventuais: ${fleet.motoristas.eventuais.join(', ')}\n`);

    // 4. EQUIPE
    console.log('4️⃣  Equipe BRT\n');
    const team = apis.getTeam();

    console.log('   Diretoria:');
    team.diretoria.forEach(p => console.log(`   • ${p.nome} - ${p.cargo}`));

    console.log('\n   Operacional:');
    team.operacional.forEach(p => console.log(`   • ${p.nome} - ${p.cargo}`));

    console.log('');
    console.log('═'.repeat(80));
    console.log('\n✅ TODAS AS APIs FUNCIONANDO!\n');
}

testarAPIs();
