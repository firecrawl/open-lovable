import {z} from 'zod';
import {getTrustedAppOrigin} from '../security/operator-access';
import {ClientInputError} from '../security/input-validation';
import {ProjectError} from '../projects/store';
import {readSessionCookie} from './config';
/** Validates browser origin before any account operation. */
export function accountOrigin(request:Request):string {
 let origin:string;try{origin=getTrustedAppOrigin(request);}catch{throw new ProjectError('Application origin is invalid.',503);}
 const unsafe=!['GET','HEAD','OPTIONS'].includes(request.method);
 const supplied=request.headers.get('origin');
 if(request.headers.get('sec-fetch-site')==='cross-site'||(supplied!==null&&supplied!==origin)||(unsafe&&supplied!==origin))throw new ProjectError('Cross-origin requests are not permitted.',403);
 if(unsafe&&request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ProjectError('A JSON request is required.',415);
 return origin;
}
export const requestCookie=(request:Request,origin:string)=>readSessionCookie(request.headers.get('cookie'),origin);
export const privateJSON=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie','Referrer-Policy':'no-referrer',...headers}});
export function accountFailure(error:unknown):Response {
 const status=error instanceof ProjectError?error.status:error instanceof z.ZodError||error instanceof ClientInputError?400:503;
 return privateJSON({success:false,error:error instanceof ProjectError?error.message:status===400?'Review the supplied fields.':'Account service is unavailable. Check server configuration.'},status,status===429?{'Retry-After':'60'}:{});
}
