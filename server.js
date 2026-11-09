// Servidor estático mínimo (sem dependências) para publicar o Mundo Vivo no Railway.
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = __dirname, PORT = process.env.PORT || 3000;
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
var PUBLIC = /^\/(index\.html|css\/|js\/|favicon)/;

http.createServer(function (req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  if (!PUBLIC.test(url) || url.indexOf('..') >= 0) { res.writeHead(404); return res.end('Não encontrado'); }
  var file = path.join(ROOT, url);
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', function () { console.log('Mundo Vivo no ar na porta ' + PORT); });
