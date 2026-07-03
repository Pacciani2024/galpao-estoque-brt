const http = require('http');
const dgram = require('dgram');

// --- CONFIG ---
const HTTP_PORT = 4000;
const UDP_PORT = 41234;

// --- 1. Servidor HTTP (Webhooks Estáticos) ---
const server = http.createServer((req, res) => {
    // Permissões CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            console.log('\n📩 WEBHOOK HTTP RECEBIDO!');
            try {
                const json = JSON.parse(body);
                console.log(JSON.stringify(json, null, 2));
            } catch (e) {
                console.log(body);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true }));
        });
    } else {
        res.writeHead(200); res.end('Receptor Rodando...');
    }
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`📡 HTTP Webhook Receiver rodando na porta ${HTTP_PORT}`);
});

// --- 2. Servidor UDP (Broadcast Dinâmico) ---
const socket = dgram.createSocket('udp4');

socket.on('error', (err) => {
    console.log(`❌ Erro no Socket UDP:\n${err.stack}`);
    socket.close();
});

socket.on('message', (msg, rinfo) => {
    console.log(`\n🛰️ BROADCAST UDP RECEBIDO de ${rinfo.address}:${rinfo.port}`);
    console.log(`   Mensagem: ${msg}`);

    try {
        const data = JSON.parse(msg);
        console.log(`   Evento: ${data.event} | ID: ${data.id}`);
        console.log(`   👉 Use este link para pegar os dados completos:`);
        // Adicionando a chave direto no link para facilitar
        console.log(`   http://${rinfo.address}:3000/api/v1/public/events/${data.id}?key=brt-secret-key-123`);
    } catch (e) {
        console.log('   (Formato desconhecido)');
    }
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`📡 UDP Broadcast Receiver ouvindo em ${address.address}:${address.port}`);
});

socket.bind(UDP_PORT);
