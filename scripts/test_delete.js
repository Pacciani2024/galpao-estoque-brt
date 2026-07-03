const http = require('http');

const data = JSON.stringify({
    itemIndex: "352",
    qrCode: "000022000022"
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/qr-units/delete',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Testing connection to /api/qr-units/delete...');

const req = http.request(options, res => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
