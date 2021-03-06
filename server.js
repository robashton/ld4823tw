var
  path = require('path'),
  http = require('http'),
  paperboy = require('paperboy')
  swallow = require('swallow')

  PORT = process.env.PORT  || 8000,
  WEBROOT = path.join(path.dirname(__filename), 'site');

http.createServer(function(req, res) {
  var ip = req.connection.remoteAddress;
  paperboy
    .deliver(WEBROOT, req, res)
    .otherwise(function(err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end("Error 404: File not found");
    });
}).listen(PORT);

swallow.build({
  in: 'assets',
  out: 'site/assets.json',
  extraHandlers: [
    swallow.handlers.byExtension('.ogg', swallow.handlers.binary),
    swallow.handlers.byExtension('.mp3', swallow.handlers.binary)
  ]
}, function() {
  console.log('assets built');
});
