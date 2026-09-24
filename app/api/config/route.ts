import {NextResponse} from 'next/server';
export function GET(){return NextResponse.json({supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY},{headers:{'Cache-Control':'public, max-age=3600'}})}
