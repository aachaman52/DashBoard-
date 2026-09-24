import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {auditWebsite,syncGitHub,syncVercel,syncPostHog,syncSearchConsole,syncWindsorInstagram} from '@/lib/providers';
import type {Project} from '@/lib/types';
export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Scheduled sync not configured'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:projects,error}=await db.from('cc_projects').select('*').limit(1000);
 if(error)return NextResponse.json({error:error.message},{status:502});
 const users=[...new Set((projects||[]).map(p=>p.user_id as string))];
 const results:Array<{user:string;provider:string;project?:string;status:string}>=[];
 for(const userId of users){
  const run=async(provider:string,task:()=>Promise<unknown>,projectId?:string)=>{try{await task();results.push({user:userId,provider,project:projectId,status:'success'});}catch(error){const message=error instanceof Error?error.message:'Sync failed';results.push({user:userId,provider,project:projectId,status:'error'});await db.from('cc_sync_runs').insert({user_id:userId,provider,status:'error',error:message.slice(0,500),ended_at:new Date().toISOString()});}};
  await run('github',()=>syncGitHub(db,userId));
  if(process.env.WINDSOR_API_KEY)await run('windsor',()=>syncWindsorInstagram(db,userId));
  for(const project of (projects||[]).filter(p=>p.user_id===userId) as Project[]){
   if(project.website_url)await run('seo',()=>auditWebsite(db,userId,project),project.id);
   if(project.vercel_project_id&&process.env.VERCEL_TOKEN)await run('vercel',()=>syncVercel(db,userId,project),project.id);
   if(project.posthog_project_id&&process.env.POSTHOG_PERSONAL_API_KEY)await run('posthog',()=>syncPostHog(db,userId,project),project.id);
   if(project.gsc_property&&process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN)await run('search_console',()=>syncSearchConsole(db,userId,project),project.id);
  }
 }
 return NextResponse.json({synced:results.length,failed:results.filter(x=>x.status==='error').length},{headers:{'Cache-Control':'no-store'}});
}
