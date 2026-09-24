import {NextRequest,NextResponse} from 'next/server';
import {authenticated} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await authenticated(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {db}=auth;
 const since=new Date(Date.now()-90*86400000).toISOString();
 const [projects,commits,deployments,metrics,seo,activity,marketing,alerts,integrations,skills,targets,syncs]=await Promise.all([
  db.from('cc_projects').select('*').order('created_at',{ascending:false}).limit(100),
  db.from('cc_commits').select('*').gte('committed_at',since).order('committed_at',{ascending:false}).limit(300),
  db.from('cc_deployments').select('*').order('deployed_at',{ascending:false}).limit(100),
  db.from('cc_daily_metrics').select('*').gte('day',since.slice(0,10)).order('day',{ascending:false}).limit(1000),
  db.from('cc_seo_snapshots').select('*').order('checked_at',{ascending:false}).limit(200),
  db.from('cc_activity_sessions').select('*').gte('started_at',since).order('started_at',{ascending:false}).limit(1000),
  db.from('cc_marketing_posts').select('*').order('posted_at',{ascending:false}).limit(200),
  db.from('cc_alerts').select('*').is('resolved_at',null).order('created_at',{ascending:false}).limit(100),
  db.from('cc_integrations').select('*').limit(50),
  db.from('cc_skill_evidence').select('*').order('occurred_at',{ascending:false}).limit(100),
  db.from('cc_study_targets').select('*').maybeSingle(),
  db.from('cc_sync_runs').select('*').order('started_at',{ascending:false}).limit(30)
 ]);
 const results={projects,commits,deployments,metrics,seo,activity,marketing,alerts,integrations,skills,targets,syncs};
 for(const [name,result] of Object.entries(results)){if(result.error)return NextResponse.json({error:`${name}: ${result.error.message}`},{status:502});}
 return NextResponse.json(Object.fromEntries(Object.entries(results).map(([name,result])=>[name,result.data])),{headers:{'Cache-Control':'private, no-store'}});
}
