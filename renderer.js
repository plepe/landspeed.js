var mapnik = require('mapnik');
var fs = require('fs');
var path = require('path');
var util = require('util');
var Pool = require('./pool');
var maps = {};
var global_args;

function get_map(layer, callback) {
    if (!maps[layer])
        maps[layer] = []

    for (var i in maps[layer]) {
        if(maps[layer][i].renderer_idle) {
            maps[layer][i].renderer_idle = false;
            //maps[layer][i].renderer_start = time();

            console.log('Use map object (' + layer + '/' + i +')...');
            callback(maps[layer][i]);
            return;
        }
    }

    // no free map object for layer loaded -> load
    var map = new mapnik.Map(256, 256);
    map.bufferSize = global_args.bufferSize;
    var file = global_args.stylesheet.replace('%', layer);

    fs.exists(file, function(exists) {
        if (!exists) {
            console.log('File ' + file + ' does not exist!');
            callback(null);
            return;
        }

        map.load(file, {
            strict: false,
            base: path.dirname(file)
        }, function(err, map) {
            if (err) throw err;
            map.zoomAll();

            console.log('Created map objects (' + layer + ')...');
            callback(map);
        });
    });

    map.renderer_idle = false;
    //map.renderer_start = time();
    map.renderer_stop = null;
    maps[layer].push(map);
}

module.exports = function(args) {
    if (!args.stylesheet) throw new Error('missing stylesheet directory');
    args.stylesheet = path.resolve(args.stylesheet);
    if (!args.concurrency) args.concurrency = 10;
    if (!args.bufferSize) args.bufferSize = 0;
    global_args = args;

    var created = 0;
    var pool = new Pool(function() {
        pool.release({});
    }, args.concurrency);

    return function(query, callback) {
        query.width = +query.width || 256;
        query.height = +query.height || 256;
        if (query.width < 1 || query.width > 2048 || query.height < 1 || query.height > 2048) {
            return callback(new Error('Invalid size: ' + query.width + '×' + query.height));
        }

        var bbox = query.bbox ? query.bbox.split(',') : [];
        if (bbox.length !== 4) return callback(new Error('Invalid bbox: ' + util.inspect(bbox)));
        bbox = bbox.map(parseFloat);
        for (var i = 0; i < 4; i++) {
            if (isNaN(bbox[i])) return callback(new Error('Invalid bbox: ' + util.inspect(bbox)));
        }

        pool.acquire(function(thread) {
            get_map(query.layers, function(map) {
                if(!map)
                    return process.nextTick(function() { pool.release(thread); });

                map.resize(query.width, query.height);
                if (query.srs) map.srs = '+init=' + query.srs;
                map.extent = bbox;

                var canvas = new mapnik.Image(query.width, query.height);

                map.render(canvas, function(err, image) {
                    // Wait until the next tick to avoid Mapnik warnings.
                    process.nextTick(function() { pool.release(thread); });

                    if (err) {
                        callback(err);
                    } else {
                        if (args.palette) {
                            image.encode('png8:z=1', {palette: args.palette}, callback);
                        } else {
                            image.encode('png:z=1', callback);
                        }
                    }

                    map.renderer_idle = true;
                });
            });
        });
    };
};
