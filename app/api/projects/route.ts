import {NextRequest,NextResponse} from 'next/server';
import {authenticated} from '@/lib/auth';
import {safeWebsiteUrl} from '@/lib/providers';
export async function PATCH(request:NextRequest){
 const auth=await authenticated(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
 let input:Record<string,unknown>;try{input=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 if(typeof input.id!=='string')return NextResponse.json({error:'Project ID required'},{status:400});
 const update:Record<string,string|null>={};
 for(const field of ['website_url','vercel_project_id','posthog_project_id','gsc_property']){
  const value=input[field];if(value!==null&&typeof value!=='string')continue;
  if(typeof value==='string'&&value.length>300)return NextResponse.json({error:`${field} too long`},{status:400});
  update[field]=value;
 }
 if(update.website_url&&!(await safeWebsiteUrl(update.website_url)))return NextResponse.json({error:'Website must use a public HTTPS hostname'},{status:400});
 const {data,error}=await auth.db.from('cc_projects').update(update).eq('id',input.id).select().single();
 return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json(data);
}
