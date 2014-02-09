#!/usr/bin/env node

// Increase the libuv threadpool size to 1.5x the number of logical CPUs.
var threadpool_size = Math.ceil(Math.max(4, require('os').cpus().length * 1.5));
// Node >= v0.10.x
process.env.UV_THREADPOOL_SIZE = threadpool_size
// Node v0.8.x and older
require('eio').setMinParallel(threadpool_size);
console.warn('Using threadpool size of ', threadpool_size);

var mapnik = require('mapnik');
var http = require('http');
var url = require('url');
var fs = require('fs');

var stylesheet = process.argv[2];
var port = +process.argv[3] || 8000;
var concurrency = parseInt(process.argv[4] || 32, 10);
var palette = process.argv[5] ? new mapnik.Palette(fs.readFileSync(process.argv[5]), 'act') : false;

if (!stylesheet) {
   console.warn('usage: ./server.js <stylesheet> <port> <concurrency> <palette>');
   process.exit(1);
}

mapnik.register_fonts('/usr/local/lib/mapnik/fonts/');

var renderer = require('./renderer')({
    stylesheet: stylesheet,
    concurrency: concurrency,
    palette: palette
});

function isPNG(data) {
    return data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E &&
        data[3] === 0x47 && data[4] === 0x0D && data[5] === 0x0A &&
        data[6] === 0x1A && data[7] === 0x0A;
}

var server = http.createServer(function(req, res) {
    var uri = url.parse(req.url.toLowerCase(), true);

    renderer(uri.query, function(err, tile) {
        if (err || !tile || !isPNG(tile)) {
            res.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end(err ? err.stack : "Rendering didn't produce a proper tile");
        } else {
            res.writeHead(200, {
                'Content-Length': tile.length,
                'Content-Type': 'image/png'
            });
            res.end(tile);
        }
    });
});

server.listen(port, function() {
    var address = server.address();
    console.warn('Listening at %s:%d', address.address, address.port);
});
