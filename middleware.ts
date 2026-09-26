import {NextResponse,type NextRequest} from 'next/server';
import {authorizeOperatorRequest,getTrustedAppOrigin} from './lib/security/operator-access';
import {authMode,accountApiAllowed,accountPageAllowed,readSessionCookie} from './lib/identity/config';
/** This edge gate controls routing only; each account API validates the actual server session. */
export async function middleware(request:NextRequest) {
 let mode:'individual'|'supabase';try{mode=authMode();}catch{return NextResponse.json({error:'Authentication profile is invalid.'},{status:503});}
 if(mode==='individual'){
  const denied=await authorizeOperatorRequest(request);if(denied)return denied;
 }else{
  let origin:string;try{origin=getTrustedAppOrigin(request);}catch{return NextResponse.json({error:'Application origin is invalid.'},{status:503});}
  const path=request.nextUrl.pathname;
  if(path.startsWith('/api/')){
   if(!accountApiAllowed(path))return NextResponse.json({error:'This operation belongs to the isolated individual profile.'},{status:403});
  }else{
   if(!accountPageAllowed(path))return NextResponse.json({error:'This page is not available in the account profile.'},{status:403});
   const publicPage=path==='/login'||path==='/auth/confirm'||path==='/invite';
   if(!publicPage&&!readSessionCookie(request.headers.get('cookie'),origin))return NextResponse.redirect(new URL('/login',origin));
   if(path==='/')return NextResponse.redirect(new URL('/projects',origin));
  }
 }
 const response=NextResponse.next();
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('Referrer-Policy','no-referrer');
 response.headers.set('Content-Security-Policy',"frame-ancestors 'none'");
 response.headers.set('Cache-Control','no-store');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
