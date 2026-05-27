const http = require('http');

const options = {
    hostname: 'localhost',
    port: 8080,
    path: '/api/wms/integration/orders/T00000000000004,T00000000000005/lines',
    method: 'GET',
    headers: {
        'Authorization': 'Bearer Admin123Token'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
        try {
            const parsed = JSON.parse(data);
            console.log(`Success: ${parsed.success}`);
            console.log(`Lines Count: ${parsed.lines ? parsed.lines.length : 0}`);
            if (parsed.lines && parsed.lines.length > 0) {
                console.log('Sample Line:', parsed.lines[0]);
            }
        } catch (e) {
            console.log('Raw Data:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
