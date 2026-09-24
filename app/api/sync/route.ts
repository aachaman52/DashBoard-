import {NextRequest,NextResponse} from 'next/server';
import {authenticated} from '@/lib/auth';
import {syncGitHub,auditWebsite,syncVercel,syncSearchConsole,syncPostHog,syncWindsorInstagram} from '@/lib/providers';
import type {Project} from '@/lib/types';
export async function POST(request:NextRequest){
 const auth=await authenticated(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
 let body:{provider?:string;projectId?:string};try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 const provider=body.provider;
 if(!provider||!['github','seo','vercel','search_console','posthog','windsor'].includes(provider))return NextResponse.json({error:'Unsupported provider'},{status:400});
 if(provider!=='github'&&provider!=='windsor'&&!body.projectId)return NextResponse.json({error:'Project required'},{status:400});
 const {db,user}=auth;
 const {data:run,error:runError}=await db.from('cc_sync_runs').insert({user_id:user.id,provider,status:'running'}).select('id').single();
 if(runError)return NextResponse.json({error:runError.message},{status:502});
 try{
  let result:unknown;
  if(provider==='github')result=await syncGitHub(db,user.id);
  else if(provider==='windsor')result=await syncWindsorInstagram(db,user.id);
  else{
   const {data:project,error}=await db.from('cc_projects').select('*').eq('id',body.projectId).single();
   if(error||!project)throw Error('Project not found');
   if(provider==='seo')result=await auditWebsite(db,user.id,project as Project);
   if(provider==='vercel')result=await syncVercel(db,user.id,project as Project);
   if(provider==='search_console')result=await syncSearchConsole(db,user.id,project as Project);
   if(provider==='posthog')result=await syncPostHog(db,user.id,project as Project);
  }
  await db.from('cc_sync_runs').update({status:'success',ended_at:new Date().toISOString()}).eq('id',run.id);
  await db.from('cc_integrations').upsert({user_id:user.id,provider,external_id:'',status:'connected',last_sync:new Date().toISOString(),last_error:null},{onConflict:'user_id,provider,external_id'});
  return NextResponse.json({ok:true,result});
 }catch(error){const message=error instanceof Error?error.message:'Sync failed';await db.from('cc_sync_runs').update({status:'error',error:message.slice(0,500),ended_at:new Date().toISOString()}).eq('id',run.id);await db.from('cc_integrations').upsert({user_id:user.id,provider,external_id:'',status:'error',last_error:message.slice(0,500)},{onConflict:'user_id,provider,external_id'});return NextResponse.json({error:message},{status:502});}
}
