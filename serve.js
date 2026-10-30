/* 本地静态服务（零依赖，只用 Node 内置模块）
 *
 * 为什么需要它：
 *   浏览器在 file:// 页面里不允许网页调用 showOpenFilePicker / showSaveFilePicker
 *   （安全限制，File System Access API 只在 http/https 下可用）。所以双击 index.html
 *   打开时，数据只能存在浏览器里，没法固定到本目录的 data.json。
 *   用这个脚本起一个 http://localhost 服务，绑定 data.json 就能正常用了。
 *
 * 用法：双击「启动服务.bat」，或在本目录执行 `node serve.js`
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 只允许读本目录内的文件
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'   // 改完 js 刷新就生效，不用清缓存
    });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('端口 ' + PORT + ' 已被占用：可能已经在运行了，直接打开 http://localhost:' + PORT + '/');
  } else {
    console.log('启动失败：' + e.message);
  }
  process.stdin.pause();
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://localhost:' + PORT + '/';
  console.log('');
  console.log('  国际物流报价助手 已启动');
  console.log('  地址：' + url);
  console.log('  数据文件：' + path.join(ROOT, 'data.json'));
  console.log('  关掉这个窗口即停止服务。');
  console.log('');
  if (process.platform === 'win32') exec('start "" "' + url + '"');
  else if (process.platform === 'darwin') exec('open "' + url + '"');
  else exec('xdg-open "' + url + '"');
});
