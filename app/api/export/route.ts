import {NextRequest,NextResponse} from 'next/server';
import {authenticated} from '@/lib/auth';
import ExcelJS from 'exceljs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const tables:Record<string,string>={activity:'cc_activity_sessions',projects:'cc_projects',commits:'cc_commits',metrics:'cc_daily_metrics',seo:'cc_seo_snapshots',marketing:'cc_marketing_posts',deployments:'cc_deployments'};
function cell(input:unknown){const value=typeof input==='object'?JSON.stringify(input):String(input??'');return /^[=+@\-\t\r]/.test(value)?`'${value}`:value;}
export async function GET(request:NextRequest){
 const auth=await authenticated(request);if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});
 const kind=request.nextUrl.searchParams.get('kind')||'';const format=request.nextUrl.searchParams.get('format');
 if(!tables[kind]||!['csv','xlsx'].includes(format||''))return NextResponse.json({error:'Invalid export'},{status:400});
 const {data,error}=await auth.db.from(tables[kind]).select('*').limit(5000);
 if(error)return NextResponse.json({error:error.message},{status:502});
 const rows=data||[];const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 if(format==='csv'){
  const escape=(value:unknown)=>`"${cell(value).replaceAll('"','""')}"`;
  const content=[columns.map(escape).join(','),...rows.map(row=>columns.map(key=>escape(row[key])).join(','))].join('\r\n')+'\r\n';
  return new NextResponse(content,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="control-center-${kind}.csv"`,'Cache-Control':'private, no-store'}});
 }
 const book=new ExcelJS.Workbook();book.creator='Aachman Studios Control Center';const sheet=book.addWorksheet(kind.slice(0,31));
 sheet.columns=columns.map(key=>({header:key,key,width:Math.min(50,Math.max(14,key.length+5))}));
 for(const row of rows)sheet.addRow(Object.fromEntries(columns.map(key=>[key,cell(row[key])])));
 if(rows.length)sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:columns.length}};
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17443B'}};
 const buffer=await book.xlsx.writeBuffer();
 return new NextResponse(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="control-center-${kind}.xlsx"`,'Cache-Control':'private, no-store'}});
}
