import {NextRequest} from 'next/server';
import {serverClient} from './supabase';
export async function authenticated(request:NextRequest){
 const value=request.headers.get('authorization')||'';
 const token=value.startsWith('Bearer ')?value.slice(7):'';
 if(!token) return null;
 const db=serverClient(token);
 const {data:{user},error}=await db.auth.getUser(token);
 return error||!user?null:{user,db};
}
