// Passenger-compatible wrapper for Next.js standalone server
const isPassenger = typeof(PhusionPassenger) !== "undefined";

// Ensure auth env vars are set before Next.js loads (edge runtime may not read .env)
process.env.AUTH_TRUST_HOST = "true";

if (isPassenger) {
    PhusionPassenger.configure({ autoInstall: false });

    // Intercept http.createServer to redirect listen() to Passenger
    const http = require("http");
    const originalCreateServer = http.createServer;

    http.createServer = function(...args) {
        const server = originalCreateServer.apply(this, args);
        const originalListen = server.listen.bind(server);

        server.listen = function() {
            console.log("Next.js: Listening via Phusion Passenger");
            return originalListen("passenger");
        };

        return server;
    };
}

// Load the standalone Next.js server
require("./server.js");
