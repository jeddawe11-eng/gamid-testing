// Read-only local UI fixture. No authentication, uploads or backend requests.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:4242');
 if(url.pathname==='/'){
  const requested=url.searchParams.get('surface'),surface=['account','wall-editor','play-together','crew'].includes(requested)?requested:'account';
  const html=await readFile(resolve(root,'dist',surface,'index.html'),'utf8');
  const header=html.match(/<header\b[\s\S]*?<\/header>/)?.[0]||'<header>GamID</header>';
  const styles=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(([,href])=>`<link rel="stylesheet" href="${new URL(href,`http://local/dist/${surface}/`).pathname}">`).join('');
  const app=await readFile(new URL('./fixture.js',import.meta.url),'utf8');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'"});
  res.end(`<!doctype html><html data-gamid-surface="public"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Usage · local ${surface} fixture</title>${styles}<link rel="stylesheet" href="/dist/app/authenticated-shell.css"><link rel="stylesheet" href="/dist/notifications/notifications.css"><link rel="stylesheet" href="/dist/usage/usage.css"><body>${header}<main style="padding:120px 24px 24px;max-width:600px;margin:auto;font:16px system-ui;color:#ddd"><h1>Local Usage fixture · ${surface}</h1><p>No real users or backend calls.</p><nav>${['account','wall-editor','play-together','crew'].map(s=>`<a style="margin-right:10px" href="/?surface=${s}">${s}</a>`).join('')}</nav><p><button id="anonymous">Sign out fixture</button></p><p id="result">Loading shared shell…</p></main><script type="module">${app}</script>`);
 }else{
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(resolve(root,'dist')+'/')&&!path.startsWith(resolve(root,'dist')+'\\'))throw Error('NOT_FOUND');
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
 }
 }catch{res.writeHead(404);res.end('Not found');}}).listen(4242,'127.0.0.1',()=>console.log('Read-only Usage fixture: http://127.0.0.1:4242/'));
