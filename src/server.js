import http from 'node:http';
import {readFile, mkdir, appendFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {minutesByCategory, classify} from './metrics.js';

const port = Number(process.env.PORT || 3000);
const token = process.env.CONTROL_CENTER_TOKEN;
const owner = process.env.GITHUB_OWNER || 'aachaman52';
const root = new URL('../public/', import.meta.url);
const dbFile = new URL('../data/activity.ndjson', import.meta.url);
const maxBody = 16384;
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};

function authorize(req) {
  if (!token || token.length < 32) return false;
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const a = Buffer.from(supplied), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a,b);
}
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'"});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
async function sessions() {
  try { return (await readFile(dbFile,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function github(path) {
  const headers = {'Accept':'application/vnd.github+json','User-Agent':'Aachman-Control-Center'};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`,{headers,signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}
async function readBody(req) {
  let body='';
  for await (const chunk of req) { body += chunk; if (body.length > maxBody) throw new Error('Body too large'); }
  return JSON.parse(body);
}
const server=http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (!authorize(req)) return send(res,401,{error:'Unauthorized or server token not configured'});
      if (req.method==='GET' && url.pathname==='/api/projects') {
        const repos=await github(`/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`);
        return send(res,200,{projects:repos.map(r=>({id:r.id,name:r.name,url:r.html_url,description:r.description,updated:r.updated_at,language:r.language,private:r.private})),source:'github',asOf:new Date().toISOString()});
      }
      const repo=url.pathname.match(/^\/api\/projects\/([^/]+)\/activity$/);
      if (req.method==='GET' && repo) {
        const name=decodeURIComponent(repo[1]);
        if (!/^[\w.-]+$/.test(name)) return send(res,400,{error:'Invalid repository'});
        const [commits,issues,releases]=await Promise.all([
          github(`/repos/${encodeURIComponent(owner)}/${name}/commits?per_page=20`),
          github(`/repos/${encodeURIComponent(owner)}/${name}/issues?state=all&per_page=20`),
          github(`/repos/${encodeURIComponent(owner)}/${name}/releases?per_page=10`)]);
        return send(res,200,{commits:commits.map(c=>({sha:c.sha.slice(0,8),message:c.commit.message.split('\n')[0],date:c.commit.author.date,url:c.html_url})),issues:issues.filter(i=>!i.pull_request).map(i=>({number:i.number,title:i.title,state:i.state,url:i.html_url})),releases:releases.map(r=>({tag:r.tag_name,published:r.published_at,url:r.html_url})),source:'github'});
      }
      if (req.method==='GET' && url.pathname==='/api/activity') {
        const data=await sessions();
        return send(res,200,{sessions:data.slice(-300),minutes:minutesByCategory(data),source:'local desktop uploads'});
      }
      if (req.method==='POST' && url.pathname==='/api/activity') {
        const data=await readBody(req);
        if (typeof data.app!=='string' || data.app.length>120 || typeof data.start!=='string' || typeof data.end!=='string' || !Number.isFinite(Date.parse(data.start)) || !Number.isFinite(Date.parse(data.end)) || Date.parse(data.end)<Date.parse(data.start) || Date.parse(data.end)-Date.parse(data.start)>86400000) return send(res,400,{error:'Invalid session'});
        const entry={app:data.app,start:data.start,end:data.end,category:typeof data.category==='string' && ['Development','Study','School','Research','Business','Marketing','Communication','Entertainment','Other','Idle'].includes(data.category)?data.category:classify(data.app),project:typeof data.project==='string'?data.project.slice(0,80):null};
        await mkdir(new URL('../data/',import.meta.url),{recursive:true}); await appendFile(dbFile,JSON.stringify(entry)+'\n',{mode:0o600});
        return send(res,201,{saved:true});
      }
      if (req.method==='GET' && url.pathname==='/api/summary') {
        const data=await sessions();
        return send(res,200,{activity:minutesByCategory(data),traffic:null,seo:null,marketing:null,deployments:null,source:'local activity only',asOf:new Date().toISOString()});
      }
      if (req.method==='GET' && url.pathname==='/api/export/activity.csv') {
        const data=await sessions(); const escape=v=>`"${String(v??'').replaceAll('"','""')}"`;
        return send(res,200,'start,end,app,category,project\r\n'+data.map(s=>[s.start,s.end,s.app,s.category,s.project].map(escape).join(',')).join('\r\n'),'text/csv; charset=utf-8');
      }
      return send(res,404,{error:'Not found'});
    }
    if (req.method!=='GET') return send(res,405,{error:'Method not allowed'});
    const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if (!['index.html','app.js','style.css','manifest.webmanifest','icon.svg'].includes(path)) return send(res,404,{error:'Not found'});
    const content=await readFile(new URL(path,root));
    return send(res,200,content,mime[extname(path)] || 'application/octet-stream');
  } catch(error) { return send(res,500,{error:error.message}); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Control Center on http://127.0.0.1:${port}`));
