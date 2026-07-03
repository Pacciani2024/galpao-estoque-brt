/**
 * Script: Confirmar Item via QR Code
 * Simula escaneamento de QR (backend para frontend)
 */

const EstoqueManager = require('../modules/estoque_manager');

async function confirmarQR() {
    const eventoId = process.argv[2];
    const nomeItem = process.argv[3];
    const qrCode = process.argv[4];
    const tipo = process.argv[5] || 'saida'; // 'saida' ou 'entrada'

    if (!eventoId || !nomeItem || !qrCode) {
        console.log('\n❌ Uso: node confirmar_qr.js [eventoId] [nomeItem] [qrCode] [tipo]');
        console.log('   Exemplo (SAÍDA): node confirmar_qr.js 576 "Par LED" QR001 saida');
        console.log('   Exemplo (ENTRADA): node confirmar_qr.js 576 "Par LED" QR001 entrada\n');
        process.exit(1);
    }

    const manager = new EstoqueManager();

    try {
        const resultado = manager.confirmarItemQR(eventoId, nomeItem, qrCode, tipo);

        const emoji = tipo === 'saida' ? '📤' : '📥';
        const acao = tipo === 'saida' ? 'SEPARADO' : 'DEVOLVIDO';

        console.log(`\n${emoji} ITEM ${acao} VIA QR CODE\n`);
        console.log(`   Item: ${resultado.item}`);
        console.log(`   QR Code: ${qrCode}`);
        console.log(`   Confirmados: ${resultado.confirmados}/${resultado.requeridos}`);

        if (resultado.completo) {
            console.log(`   ✅ QUANTIDADE COMPLETA!\n`);
        } else {
            console.log(`   ⏳ Faltam ${resultado.requeridos - resultado.confirmados} unidade(s)\n`);
        }

    } catch (error) {
        console.error('\n❌ Erro:', error.message, '\n');
        process.exit(1);
    }
}

confirmarQR();
