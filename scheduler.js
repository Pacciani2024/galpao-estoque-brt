const cron = require('node-cron');
const { execSync } = require('child_process');
const fs = require('fs');

console.log('\n⏰ SCHEDULER INICIADO - BRT Audiovisual');
console.log('═'.repeat(80));
console.log('');

console.log('🚀 Executando scraping inicial ao iniciar...\n');

setTimeout(() => {
    console.log('\n📅 [STARTUP] Sync Eventos + Equipamentos');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));

    try {
        execSync('node scripts/sync_eventos_equipamentos.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
        console.log('✅ Sync inicial concluído!\n');
    } catch (error) {
        console.error('❌ Erro no sync inicial:', error.message, '\n');
    }
}, 5000);

// Sync GitHub: aguarda 30s para garantir que o inventário esteja atualizado
setTimeout(() => {
    console.log('\n🐙 [STARTUP] Publicando estoque no GitHub...');
    try {
        execSync('node scripts/github_sync_expandido.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
    } catch (error) {
        console.error('❌ Erro no sync GitHub inicial:', error.message, '\n');
    }
}, 30000);

console.log('✅ Scraping inicial agendado para 5s após startup\n');

cron.schedule('0 11 * * *', () => {
    console.log('\n📦 [CRON] Sync Inventário Completo');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));
    console.log('🕐 Horário de abertura - Atualizando estoque...\n');

    try {
        execSync('node scripts/test_inventory_scraper.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
        console.log('✅ Inventário atualizado!\n');
    } catch (error) {
        console.error('❌ Erro no inventário:', error.message, '\n');
    }
});

console.log('✅ Agendado: Sync Inventário (11:00 diariamente)');

cron.schedule('*/10 * * * *', () => {
    console.log('\n🔄 [CRON] Sync Eventos + Equipamentos');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));

    try {
        execSync('node scripts/sync_eventos_equipamentos.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
        console.log('✅ Sync concluído com sucesso!\n');
    } catch (error) {
        console.error('❌ Erro no sync:', error.message, '\n');
    }
});

console.log('✅ Agendado: Sync Eventos (a cada 10 minutos)');

// ─── GitHub Sync: publica estoque.json a cada 15 minutos ────────────────────
cron.schedule('*/15 * * * *', () => {
    console.log('\n🐙 [CRON] Publicando estoque no GitHub...');
    console.log('⏰ Horário:', new Date().toLocaleString('pt-BR'));

    try {
        execSync('node scripts/github_sync_expandido.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
    } catch (error) {
        console.error('❌ Erro no sync GitHub:', error.message, '\n');
    }
});

console.log('✅ Agendado: GitHub Sync Estoque (a cada 15 minutos)');

cron.schedule('2,12,22,32,42,52 * * * *', () => {
    console.log('\n🔗 [CRON] Merge Eventos + Equipamentos');

    try {
        execSync('node scripts/merge_eventos_equipamentos.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
        console.log('✅ Merge concluído!\n');
    } catch (error) {
        console.error('❌ Erro no merge:', error.message, '\n');
    }
});

console.log('✅ Agendado: Merge Dados (2 min após sync)');

cron.schedule('*/30 * * * *', () => {
    console.log('\n📊 [CRON] Monitoramento Sistema');

    try {
        execSync('node scripts/monitor_sistema.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
    } catch (error) {
        console.error('❌ Erro no monitoramento:', error.message, '\n');
    }
});

console.log('✅ Agendado: Monitoramento (a cada 30 min)');

cron.schedule('0 8 * * *', () => {
    console.log('\n🤖 [CRON] Alertas Inteligentes Mark');

    try {
        execSync('node scripts/mark_alertas.js', {
            stdio: 'inherit',
            cwd: __dirname
        });
    } catch (error) {
        console.error('❌ Erro nos alertas:', error.message, '\n');
    }
});

console.log('✅ Agendado: Alertas Mark (08:00 diariamente)');

console.log('');
console.log('═'.repeat(80));
console.log('📅 Agenda Completa:');
console.log('   🚀 Ao iniciar: Sync eventos + equipamentos');
console.log('   ⏰ A cada 10 min: Sync eventos + equipamentos + API');
console.log('   🕐 11:00 AM: Sync inventário completo (abertura)');
console.log('   📊 A cada 30 min: Monitoramento');
console.log('   🤖 08:00 AM: Alertas Mark');
console.log('');
console.log('⌨️  Pressione Ctrl+C para parar');
console.log('═'.repeat(80));
console.log('\n🟢 Scheduler rodando...\n');

process.on('SIGINT', () => {
    console.log('\n\n⛔ Scheduler encerrado pelo usuário');
    process.exit(0);
});
