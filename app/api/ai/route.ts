import {NextRequest,NextResponse} from 'next/server';
import {authenticated} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await authenticated(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
 const kind=request.nextUrl.searchParams.get('kind');
 const sources:Record<string,{table:string;order:string}>={projects:{table:'cc_projects',order:'created_at'},development:{table:'cc_commits',order:'committed_at'},deployments:{table:'cc_deployments',order:'deployed_at'},seo:{table:'cc_seo_snapshots',order:'checked_at'},analytics:{table:'cc_daily_metrics',order:'day'},marketing:{table:'cc_marketing_posts',order:'posted_at'},activity:{table:'cc_activity_sessions',order:'started_at'},skills:{table:'cc_skill_evidence',order:'occurred_at'},alerts:{table:'cc_alerts',order:'created_at'}};
 if(!kind||!sources[kind])return NextResponse.json({error:'Supported kinds: '+Object.keys(sources).join(', ')},{status:400});
 const {table,order}=sources[kind];const {data,error}=await auth.db.from(table).select('*').order(order,{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:error.message},{status:502});
 return NextResponse.json({kind,count:data.length,items:data,asOf:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
}
