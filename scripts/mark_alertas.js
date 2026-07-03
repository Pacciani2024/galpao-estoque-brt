/**
 * Mark Alertas Inteligentes
 * Mark analisa dados e envia alertas proativos
 */

const fs = require('fs');
const notifier = require('node-notifier');
const path = require('path');

console.log('\n🤖 MARK - ALERTAS INTELIGENTES');
console.log('═'.repeat(80));
console.log('');

const alertas = [];

// ====== 1. VERIFICAR EVENTOS PRÓXIMOS ======

try {
    const eventosData = JSON.parse(
        fs.readFileSync('logs/eventos_completos.json', 'utf-8')
    );

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    eventosData.eventos.forEach(evento => {
        const dataEvento = new Date(evento.dataevento + 'T00:00:00');
        const diffDias = Math.ceil((dataEvento - hoje) / (1000 * 60 * 60 * 24));

        // Eventos em 1 dia
        if (diffDias === 1) {
            if (evento.totalEquipamentos === 0) {
                alertas.push({
                    tipo: 'URGENTE',
                    icone: '⚠️',
                    titulo: 'Evento sem equipamentos!',
                    mensagem: `${evento.nomeevento} é AMANHÃ e não tem equipamentos cadastrados!`,
                    prioridade: 'high'
                });
            } else {
                // Verificar se foi separado
                const alocacoes = JSON.parse(
                    fs.readFileSync('logs/alocacoes.json', 'utf-8')
                );

                const alocacao = alocacoes.alocacoes.find(a =>
                    a.eventoId === evento.id
                );

                if (!alocacao) {
                    alertas.push({
                        tipo: 'IMPORTANTE',
                        icone: '📦',
                        titulo: 'Separação pendente',
                        mensagem: `${evento.nomeevento} é amanhã. Equipamentos ainda não foram separados.`,
                        prioridade: 'high'
                    });
                } else if (alocacao.status === 'pendente_separacao') {
                    alertas.push({
                        tipo: 'IMPORTANTE',
                        icone: '⏳',
                        titulo: 'Separação incompleta',
                        mensagem: `${evento.nomeevento}: Separação iniciada mas não finalizada.`,
                        prioridade: 'high'
                    });
                }
            }
        }

        // Eventos em 2 dias
        if (diffDias === 2) {
            alertas.push({
                tipo: 'LEMBRETE',
                icone: '📅',
                titulo: 'Evento se aproximando',
                mensagem: `${evento.nomeevento} é depois de amanhã. ${evento.totalEquipamentos} itens necessários.`,
                prioridade: 'normal'
            });
        }
    });

} catch (error) {
    console.error('Erro ao verificar eventos:', error.message);
}

// ====== 2. VERIFICAR ESTOQUE BAIXO ======

try {
    const inventory = JSON.parse(
        fs.readFileSync('logs/inventory_complete.json', 'utf-8')
    );

    const estoqueCritico = inventory.items.filter(item =>
        item.estoque === 0
    );

    const estoqueBaixo = inventory.items.filter(item =>
        item.estoque > 0 && item.estoque < 3
    );

    if (estoqueCritico.length > 0) {
        alertas.push({
            tipo: 'URGENTE',
            icone: '❌',
            titulo: 'Estoque zerado!',
            mensagem: `${estoqueCritico.length} itens sem estoque. Reposição urgente necessária.`,
            prioridade: 'high'
        });
    }

    if (estoqueBaixo.length > 5) {
        alertas.push({
            tipo: 'AVISO',
            icone: '⚠️',
            titulo: 'Estoque baixo',
            mensagem: `${estoqueBaixo.length} itens com estoque abaixo de 3 unidades.`,
            prioridade: 'normal'
        });
    }

} catch (error) {
    console.error('Erro ao verificar estoque:', error.message);
}

// ====== 3. VERIFICAR RODÍZIO ======

const hoje = new Date();
const diaSemana = hoje.getDay(); // 0 = domingo, 1 = segunda, etc

if (diaSemana === 0) { // Domingo - lembrar da segunda
    alertas.push({
        tipo: 'LEMBRETE',
        icone: '🚗',
        titulo: 'Rodízio amanhã!',
        mensagem: 'Segunda-feira: 2 Doblos no rodízio. Planejar com Transit ou Doblo 3.',
        prioridade: 'normal'
    });
}

if (diaSemana === 3) { // Quarta - lembrar da quinta
    alertas.push({
        tipo: 'LEMBRETE',
        icone: '🚗',
        titulo: 'Rodízio amanhã!',
        mensagem: 'Quinta-feira: Saveiro no rodízio. Usar outros veículos.',
        prioridade: 'normal'
    });
}

// ====== EXIBIR E ENVIAR ALERTAS ======

console.log(`📊 Total de alertas: ${alertas.length}\n`);

if (alertas.length === 0) {
    console.log('✅ Nenhum alerta no momento\n');
} else {
    alertas.forEach((alerta, i) => {
        console.log(`${i + 1}. ${alerta.icone} [${alerta.tipo}] ${alerta.titulo}`);
        console.log(`   ${alerta.mensagem}\n`);

        // Enviar notificação Windows
        if (alerta.prioridade === 'high') {
            notifier.notify({
                title: `Mark: ${alerta.titulo}`,
                message: alerta.mensagem,
                icon: path.join(__dirname, '../public/mark-icon.png'),
                sound: true,
                wait: false
            });
        }
    });
}

// Salvar relatório de alertas
const relatorio = {
    timestamp: new Date().toISOString(),
    totalAlertas: alertas.length,
    alertas
};

fs.writeFileSync(
    'logs/alertas_report.json',
    JSON.stringify(relatorio, null, 2)
);

console.log('═'.repeat(80));
console.log('💾 Relatório salvo em: logs/alertas_report.json\n');
