const path = require('path');
const http = require('http');

const appDir = __dirname;
process.chdir(appDir);
process.env.NODE_ENV = 'production';

require('dotenv').config({ path: path.join(appDir, '.env') });

const next = require('next');
const app = next({ dev: false, dir: appDir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  if (typeof(PhusionPassenger) !== 'undefined') {
    server.listen('passenger');
  } else {
    const port = process.env.PORT || 3001;
    server.listen(port, '0.0.0.0', () => {
      console.log('Next.js running on port ' + port);
    });
  }
});
