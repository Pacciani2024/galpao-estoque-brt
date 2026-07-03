const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/public/stock',
    method: 'GET',
    headers: {
        'x-api-key': 'brt-secret-key-123'
    }
};

const req = http.request(options, res => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.end();
