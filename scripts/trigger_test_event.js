const webhookService = require('../services/webhookService');
const broadcastService = require('../services/broadcastService');

console.log('📡 Disparando evento de TESTE...');

const fakeEvent = {
    eventId: 'TESTE-123',
    eventName: 'Evento de Teste Manual',
    status: 'dispatched',
    separatedItems: [
        { id: 1, name: 'Item de Teste A', qtySeparada: 10 },
        { id: 2, name: 'Item de Teste B', qtySeparada: 5 }
    ],
    lastUpdated: new Date().toISOString()
};

// 1. Disparar Webhook (HTTP)
webhookService.trigger('event.dispatched', fakeEvent);

// 2. Disparar Broadcast (UDP)
// Se passar um IP como argumento, envia direto (Unicast) em vez de Broadcast
const targetIP = process.argv[2] || '255.255.255.255';

if (targetIP !== '255.255.255.255') {
    console.log(`🎯 Enviando direto para IP: ${targetIP}`);
    // Hack temporário para enviar unicast usando o socket do service (não exposto idealmente, mas funcional para teste)
    const dgram = require('dgram');
    const client = dgram.createSocket('udp4');
    const message = Buffer.from(JSON.stringify({
        event: 'event.dispatched',
        id: fakeEvent.eventId,
        name: fakeEvent.eventName,
        timestamp: new Date().toISOString()
    }));
    client.send(message, 41234, targetIP, (err) => {
        if (err) console.error(err);
        client.close();
    });
} else {
    broadcastService.send('event.dispatched', fakeEvent.eventId, fakeEvent.eventName);
}

console.log(`✅ Eventos enviados! (Alvo UDP: ${targetIP})`);

// Manter processo vivo por 2s para dar tempo do envio UDP
setTimeout(() => { }, 2000);
