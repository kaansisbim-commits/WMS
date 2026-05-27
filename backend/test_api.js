const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/wms/serial-cancellation',
  method: 'GET',
  headers: {
    // Need a dummy token or bypass auth? Wait, authMiddleware requires a valid token.
    // Let's just bypass it for the test by directly calling the controller.
  }
};

// Actually, let's just write a script to instantiate the controller function manually.
const req = { query: {} };
const res = {
  json: (data) => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  },
  status: (code) => ({
    json: (data) => {
      console.log('Error', code, data);
      process.exit(1);
    }
  })
};

const wmsController = require('./controllers/wmsController');
wmsController.getAcceptedSerials(req, res);
