import http from 'node:http';
import fs from 'node:fs/promises';
http.createServer(async(req,res)=>{
  if(!['/','/fire-vfx-preview.html'].includes(req.url)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile('artifacts/fire-vfx-preview.html'));}
  catch{res.writeHead(500).end('Preview unavailable');}
}).listen(47832,'127.0.0.1',()=>console.log('Fire preview: http://127.0.0.1:47832'));
