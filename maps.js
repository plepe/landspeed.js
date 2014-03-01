var mapnik = require('mapnik');
var fs = require('fs');
var path = require('path');

var global_args;
var maps = {};

function time() {
    return new Date().getTime();
}

function init(args) {
    global_args = args;
}

function list_maps() {
    console.log('List maps:')
    for (var k in maps) {
        for (var i in maps[k]) {
            var map = maps[k][i];
            console.log(k + '/' + i + ': ' + (map.renderer_idle?'idle for  ' + ((time() - map.renderer_stop) / 1000).toFixed(0) + 's':'not idle'));
        }
    }
}

// check if we should clean our list of loaded maps
function clean_maps() {
    var count;
    list_maps();

    for (var k in maps) {
        for (var i = 0; i < maps[k].length; i++) {
            var map = maps[k][i];
            count++;

            // if map render job is idle and last render process is older than
            // an hour, remove map
            if (map.renderer_idle && (time() - map.renderer_stop > 3600000)) {
                console.log(k + '/' + i + ': garbage collector removes map');
                maps[k].splice(i, 1);
                i--;
            }
        }
    }
}

function get_map(layer, callback) {
    if (!maps[layer])
        maps[layer] = []

    for (var i in maps[layer]) {
        if(maps[layer][i].renderer_idle) {
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
    map.renderer_start = null;
    map.renderer_stop = null;
    maps[layer].push(map);

    clean_maps();
}

module.exports = {
    'init': init,
    'get': get_map,
    'list': list_maps,
    'clean': clean_maps,
    'maps': maps
};
