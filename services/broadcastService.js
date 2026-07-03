const dgram = require('dgram');
const os = require('os');

const PORT = 41234;

class BroadcastService {
    constructor() {
        this.socket = dgram.createSocket('udp4');
        this.socket.bind(() => {
            this.socket.setBroadcast(true);
        });
    }

    /**
     * Calcula o endereço de broadcast da sub-rede (ex: 192.168.15.255)
     * Isso ajuda quando o 255.255.255.255 é bloqueado pelo Windows
     */
    getBroadcastAddresses() {
        const interfaces = os.networkInterfaces();
        const addresses = [];

        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    // Cálculo bitwise do Broadcast: IP | (~Netmask)
                    // Mas como JS trabalha com Signed 32-bit, é mais seguro fazer por partes
                    const ipParts = net.address.split('.').map(Number);
                    const maskParts = net.netmask.split('.').map(Number);

                    const broadcastParts = ipParts.map((part, i) => {
                        return part | (~maskParts[i] & 255);
                    });

                    addresses.push(broadcastParts.join('.'));
                }
            }
        }
        return [...new Set([...addresses, '255.255.255.255'])]; // Adiciona o global também
    }

    /**
     * Envia um pacote UDP para toda a rede local (Smart Broadcast)
     * @param {string} eventType - Tipo do evento (ex: event.dispatched)
     * @param {string} eventId - ID do evento
     * @param {string} eventName - Nome do evento
     */
    send(eventType, eventId, eventName) {
        const message = JSON.stringify({
            event: eventType,
            id: eventId,
            name: eventName,
            timestamp: new Date().toISOString()
        });

        const buffer = Buffer.from(message);
        const targets = this.getBroadcastAddresses();

        console.log(`📡 Enviando Broadcast para: ${targets.join(', ')}`);

        targets.forEach(addr => {
            this.socket.send(buffer, 0, buffer.length, PORT, addr, (err) => {
                if (err) {
                    console.error(`❌ Falha no Broadcast UDP para ${addr}:`, err.message);
                } else {
                    // console.log(`📡 Broadcast UDP enviado para ${addr}`);
                }
            });
        });
    }
}

module.exports = new BroadcastService();
