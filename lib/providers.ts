import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Project} from './types';

export const owner=process.env.GITHUB_OWNER||'aachaman52';
const githubHeaders=()=>({'Accept':'application/vnd.github+json','User-Agent':'Aachman-Control-Center',...(process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{})});
async function json(url:string,init?:RequestInit){const res=await fetch(url,{...init,signal:AbortSignal.timeout(12000),cache:'no-store'});if(!res.ok)throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);return res.json();}
export async function syncGitHub(db:SupabaseClient,userId:string){
 const listing=process.env.GITHUB_TOKEN?'https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=updated':`https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`;
 const repositories=await json(listing,{headers:githubHeaders()}) as Array<{name:string;full_name:string;html_url:string;updated_at:string;language:string|null}>;
 const repos=repositories.filter(r=>r.full_name.startsWith(`${owner}/`));
 for(const repo of repos){
  const {data:existing}=await db.from('cc_projects').select('id').eq('repository_full_name',repo.full_name).maybeSingle();
  let projectId=existing?.id as string|undefined;
  if(!projectId){const {data,error}=await db.from('cc_projects').insert({user_id:userId,name:repo.name,repository_full_name:repo.full_name}).select('id').single();if(error)throw error;projectId=data.id;}
  let commits:Array<{sha:string;html_url:string;commit:{message:string;author:{date:string;name:string}}}>;
  try{commits=await json(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}/commits?per_page=30`,{headers:githubHeaders()});}
  catch(error){if(error instanceof Error&&error.message.includes('HTTP 409'))continue;throw error;}
  if(commits.length){const {error}=await db.from('cc_commits').upsert(commits.map(c=>({user_id:userId,project_id:projectId,sha:c.sha,title:c.commit.message.split('\n')[0],author:c.commit.author.name,committed_at:c.commit.author.date,url:c.html_url})),{onConflict:'user_id,project_id,sha'});if(error)throw error;}
 }
 return {repositories:repos.length};
}
function publicHost(address:string){
 if(isIP(address)){if(address==='127.0.0.1'||address==='0.0.0.0'||address.startsWith('10.')||address.startsWith('192.168.')||address.startsWith('172.')||address.startsWith('169.254.')||address==='::1')return false;}
 return address!=='localhost'&&!address.endsWith('.localhost')&&!address.endsWith('.local');
}
export async function safeWebsiteUrl(input:string){
 const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 if(!publicHost(url.hostname))return null;
 const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicHost(a.address)))return null;
 return url;
}
export async function auditWebsite(db:SupabaseClient,userId:string,project:Project){
 if(!project.website_url)throw Error('Configure a website URL first');
 const url=await safeWebsiteUrl(project.website_url);if(!url)throw Error('Website must use a public HTTPS hostname');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Aachman-Control-Center-SEO/1.0'}});
 const html=(await response.text()).slice(0,1000000);
 const title=html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()||null;
 const description=html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)?.[1]||html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description/i)?.[1]||null;
 const canonical=html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i)?.[1]||null;
 const [robots,sitemap]=await Promise.all(['robots.txt','sitemap.xml'].map(async path=>{try{const res=await fetch(new URL('/'+path,url),{redirect:'error',signal:AbortSignal.timeout(8000)});return res.ok;}catch{return false;}}));
 const issues:string[]=[];
 if(!response.ok)issues.push(`Homepage returned HTTP ${response.status}`);
 if(!title)issues.push('Missing page title');
 if(!description)issues.push('Missing meta description');
 if(!canonical)issues.push('Missing canonical URL');
 if(!robots)issues.push('robots.txt unavailable');
 if(!sitemap)issues.push('sitemap.xml unavailable');
 const {error}=await db.from('cc_seo_snapshots').insert({user_id:userId,project_id:project.id,page_url:url.href,status:response.status,title,description,canonical,has_robots:robots,has_sitemap:sitemap,issues});if(error)throw error;
 return {status:response.status,issues};
}
export async function syncVercel(db:SupabaseClient,userId:string,project:Project){
 if(!process.env.VERCEL_TOKEN||!project.vercel_project_id)throw Error('Vercel token and project ID required');
 const endpoint=new URL('https://api.vercel.com/v6/deployments');endpoint.searchParams.set('projectId',project.vercel_project_id);endpoint.searchParams.set('limit','20');
 const data=await json(endpoint.href,{headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`}}) as {deployments:Array<{uid:string;state:string;url:string;created:number}>};
 if(data.deployments.length){const {error}=await db.from('cc_deployments').upsert(data.deployments.map(d=>({user_id:userId,project_id:project.id,external_id:d.uid,state:d.state,url:`https://${d.url}`,deployed_at:new Date(d.created).toISOString()})),{onConflict:'user_id,external_id'});if(error)throw error;}
 return {deployments:data.deployments.length};
}
export async function syncSearchConsole(db:SupabaseClient,userId:string,project:Project){
 if(!process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN||!project.gsc_property)throw Error('Search Console access token and property required');
 const end=new Date();end.setUTCDate(end.getUTCDate()-3);const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
 const body={startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),dimensions:['date'],rowLimit:1000};
 const data=await json(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(project.gsc_property)}/searchAnalytics/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)}) as {rows?:Array<{keys:string[];clicks:number;impressions:number;ctr:number;position:number}>};
 for(const row of data.rows||[]){for(const [metric,value] of Object.entries({clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position})){const {error}=await db.from('cc_daily_metrics').upsert({user_id:userId,project_id:project.id,provider:'search_console',metric,day:row.keys[0],value,dimensions:{}},{onConflict:'user_id,project_id,provider,metric,day'});if(error)throw error;}}
 return {days:data.rows?.length||0};
}
export async function syncPostHog(db:SupabaseClient,userId:string,project:Project){
 if(!process.env.POSTHOG_PERSONAL_API_KEY||!project.posthog_project_id)throw Error('PostHog personal API key and project ID required');
 const host=process.env.POSTHOG_HOST||'https://us.posthog.com';if(!['https://us.posthog.com','https://eu.posthog.com'].includes(host))throw Error('Invalid PostHog host');
 const query="SELECT toDate(timestamp) AS day, event, count() AS total FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND event IN ('$pageview','signup','download') GROUP BY day, event ORDER BY day DESC LIMIT 1000";
 const data=await json(`${host}/api/projects/${encodeURIComponent(project.posthog_project_id)}/query/`,{method:'POST',headers:{Authorization:`Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:{kind:'HogQLQuery',query}})}) as {results?:Array<[string,string,number]>};
 for(const row of data.results||[]){const {error}=await db.from('cc_daily_metrics').upsert({user_id:userId,project_id:project.id,provider:'posthog',metric:row[1],day:row[0],value:row[2],dimensions:{}},{onConflict:'user_id,project_id,provider,metric,day'});if(error)throw error;}
 return {days:data.results?.length||0};
}
export async function syncWindsorInstagram(db:SupabaseClient,userId:string){
 const key=process.env.WINDSOR_API_KEY,account=process.env.WINDSOR_INSTAGRAM_ACCOUNT_ID;
 if(!key||!account)throw Error('Windsor API key and Instagram account ID required');
 const url=new URL('https://connectors.windsor.ai/instagram');
 url.searchParams.set('api_key',key);url.searchParams.set('fields','media_id,media_permalink,media_views,media_reach,media_like_count,media_comments_count');
 url.searchParams.set('date_preset','last_30d');url.searchParams.set('select_accounts',account);
 let response:unknown;
 try{response=await json(url.href);}catch{throw Error('Windsor Instagram request failed');}
 const rows=Array.isArray(response)?response:Array.isArray((response as {data?:unknown})?.data)?(response as {data:unknown[]}).data:[];
 let count=0;
 for(const item of rows){const row=item as Record<string,unknown>;if(!row.media_id)continue;
  const asNumber=(value:unknown)=>value==null?null:Number(value);
  const {error}=await db.from('cc_marketing_posts').upsert({user_id:userId,platform:'instagram',external_id:String(row.media_id),url:row.media_permalink?String(row.media_permalink):null,views:asNumber(row.media_views),reach:asNumber(row.media_reach),interactions:asNumber(row.media_like_count),clicks:null},{onConflict:'user_id,platform,external_id'});
  if(error)throw error;count++;
 }
 return {posts:count};
}
