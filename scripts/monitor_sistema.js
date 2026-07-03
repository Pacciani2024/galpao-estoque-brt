/**
 * Monitor Sistema
 * Verifica status do sistema e gera relatório
 */

const fs = require('fs');
const path = require('path');

console.log('\n📊 MONITORAMENTO DO SISTEMA');
console.log('═'.repeat(80));
console.log('');

const checks = {
    arquivos: [],
    alertas: [],
    status: 'ok'
};

// ====== VERIFICAR ARQUIVOS ESSENCIAIS ======

const arquivosEssenciais = [
    'logs/inventory_complete.json',
    'logs/eventos_completos.json',
    'logs/alocacoes.json'
];

arquivosEssenciais.forEach(arquivo => {
    const caminho = path.join(__dirname, arquivo);
    const existe = fs.existsSync(caminho);

    if (existe) {
        const stats = fs.statSync(caminho);
        const idade = (Date.now() - stats.mtime) / (1000 * 60 * 60); // horas

        checks.arquivos.push({
            arquivo,
            existe: true,
            tamanho: stats.size,
            ultimaAtualizacao: stats.mtime,
            idadeHoras: idade.toFixed(1)
        });

        // Alerta se arquivo muito antigo
        if (idade > 24 && arquivo.includes('inventory')) {
            checks.alertas.push(`⚠️  Inventário não atualizado há ${idade.toFixed(0)}h`);
            checks.status = 'warning';
        }

        if (idade > 2 && arquivo.includes('eventos')) {
            checks.alertas.push(`⚠️  Eventos não atualizados há ${idade.toFixed(0)}h`);
            checks.status = 'warning';
        }
    } else {
        checks.arquivos.push({
            arquivo,
            existe: false
        });
        checks.alertas.push(`❌ Arquivo não encontrado: ${arquivo}`);
        checks.status = 'error';
    }
});

// ====== VERIFICAR ESTOQUE BAIXO ======

try {
    const inventory = JSON.parse(
        fs.readFileSync('logs/inventory_complete.json', 'utf-8')
    );

    const estoqueBaixo = inventory.items.filter(item =>
        item.estoque < 3 && item.estoque > 0
    );

    if (estoqueBaixo.length > 0) {
        checks.alertas.push(
            `⚠️  ${estoqueBaixo.length} itens com estoque baixo (< 3)`
        );
        checks.status = checks.status === 'ok' ? 'warning' : checks.status;
    }

    checks.estoqueBaixo = estoqueBaixo.length;
} catch (error) {
    checks.alertas.push('❌ Erro ao verificar estoque');
}

// ====== VERIFICAR EVENTOS PRÓXIMOS ======

try {
    const eventos = JSON.parse(
        fs.readFileSync('logs/eventos_completos.json', 'utf-8')
    );

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0];

    const eventoAmanha = eventos.eventos.filter(e =>
        e.dataevento === amanhaStr
    );

    if (eventoAmanha.length > 0) {
        eventoAmanha.forEach(ev => {
            if (ev.totalEquipamentos > 0) {
                checks.alertas.push(
                    `📅 Evento amanhã: ${ev.nomeevento} (${ev.totalEquipamentos} itens)`
                );
            } else {
                checks.alertas.push(
                    `⚠️  Evento amanhã SEM equipamentos: ${ev.nomeevento}`
                );
                checks.status = checks.status === 'ok' ? 'warning' : checks.status;
            }
        });
    }

    checks.eventosAmanha = eventoAmanha.length;
} catch (error) {
    checks.alertas.push('❌ Erro ao verificar eventos');
}

// ====== EXIBIR RESULTADO ======

console.log('📁 Arquivos:');
checks.arquivos.forEach(a => {
    if (a.existe) {
        console.log(`   ✅ ${a.arquivo} (${(a.tamanho / 1024).toFixed(1)}kb, ${a.idadeHoras}h atrás)`);
    } else {
        console.log(`   ❌ ${a.arquivo} - NÃO ENCONTRADO`);
    }
});

console.log('\n⚡ Alertas:');
if (checks.alertas.length === 0) {
    console.log('   ✅ Nenhum alerta');
} else {
    checks.alertas.forEach(alerta => {
        console.log(`   ${alerta}`);
    });
}

const statusEmoji = {
    'ok': '✅',
    'warning': '⚠️ ',
    'error': '❌'
};

console.log(`\n${statusEmoji[checks.status]} Status: ${checks.status.toUpperCase()}`);
console.log('');
console.log('═'.repeat(80));

// Salvar relatório
const relatorio = {
    timestamp: new Date().toISOString(),
    ...checks
};

fs.writeFileSync(
    'logs/monitor_report.json',
    JSON.stringify(relatorio, null, 2)
);

console.log('💾 Relatório salvo em: logs/monitor_report.json\n');

process.exit(checks.status === 'error' ? 1 : 0);
