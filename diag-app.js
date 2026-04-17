const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'passenger-debug.log');
function log(msg) {
  fs.appendFileSync(logFile, new Date().toISOString() + ': ' + msg + '\n');
}

log('=== APP.JS STARTING ===');
log('CWD: ' + process.cwd());
log('__dirname: ' + __dirname);
log('PORT env: ' + process.env.PORT);
log('NODE_ENV: ' + process.env.NODE_ENV);
log('PASSENGER_BASE_URI: ' + process.env.PASSENGER_BASE_URI);

var serverPath = path.join(__dirname, '.next', 'standalone', 'server.js');
log('standalone server.js exists: ' + fs.existsSync(serverPath));
log('.env exists in CWD: ' + fs.existsSync(path.join(process.cwd(), '.env')));
log('.env exists in __dirname: ' + fs.existsSync(path.join(__dirname, '.env')));
log('.env exists in standalone: ' + fs.existsSync(path.join(__dirname, '.next', 'standalone', '.env')));

try {
  process.env.PORT = process.env.PORT || '3000';
  process.env.HOSTNAME = '0.0.0.0';
  log('About to require standalone server...');
  require('./.next/standalone/server.js');
  log('Server loaded successfully');
} catch(e) {
  log('ERROR: ' + e.message);
  log('STACK: ' + e.stack);
}
