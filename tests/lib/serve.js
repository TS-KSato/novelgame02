// 試験用の静的サーバー。リポジトリの直下を配信する（外部パッケージを使わない）。
// prefix を渡すと、リポジトリをそのパスの下に置く（例：/novelgame02 なら /novelgame02/ で配信し、ルート直下は 404）。
// 公開先（GitHub Pages の /novelgame02/）と同じ形で試せるようにするため。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

// prefix は「/novelgame02」のように、末尾の / を付けない形で渡す（空なら公開直下）。
function serve(root, port, prefix) {
  const mount = (prefix || '').replace(/\/+$/, '');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (mount) {
      if (pathname !== mount && !pathname.startsWith(mount + '/')) { res.writeHead(404); return res.end('not found'); }
      pathname = pathname.slice(mount.length) || '/';
    }
    let p = path.normalize(path.join(root, pathname));
    if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { serve };

if (require.main === module) {
  const port = Number(process.argv[2] || 8080);
  const prefix = process.argv[3] || '';
  serve(ROOT_DIR, port, prefix).then(() => console.log('http://127.0.0.1:' + port + (prefix ? prefix + '/' : '/')));
}
