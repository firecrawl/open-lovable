/** Edge-safe profile routing. An unknown profile is never treated as individual access. */
export function authMode():'individual'|'supabase' {
 const mode=process.env.OPEN_LOVABLE_AUTH_MODE||'individual';
 if(mode!=='individual'&&mode!=='supabase')throw new Error('Unsupported authentication mode');
 return mode;
}
export const ACCOUNT_API_PATHS=new Set(['/api/auth','/api/workspaces','/api/projects','/api/project-images','/api/ai-models','/api/ai-model-test','/api/provider-settings']);
export function accountPageAllowed(path:string):boolean {
 return path==='/'||path==='/login'||path==='/workspaces'||path==='/invite'||path==='/auth/confirm'||path==='/settings/ai'||path==='/projects'||/^\/projects\/[0-9a-f-]{36}$/.test(path);
}
export function sessionCookieName(origin:string):string {
 return origin.startsWith('https://')?'__Host-ol_session':'ol_session';
}
export function sessionCookie(origin:string,token:string,clear=false):string {
 const secure=origin.startsWith('https://');
 return `${sessionCookieName(origin)}=${clear?'':token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:43200}${secure?'; Secure':''}`;
}
export function readSessionCookie(header:string|null,origin:string):string {
 const name=sessionCookieName(origin),matches=(header||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(matches.length!==1)return '';
 const value=matches[0].slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}

/** Only exact versioned run operations are added; legacy sandbox endpoints stay forbidden in account mode. */
export function accountApiAllowed(path:string):boolean {
 return ACCOUNT_API_PATHS.has(path)||path==='/api/v1/projects'||path==='/api/v1/runs'||/^\/api\/v1\/runs\/[0-9a-f-]{36}(?:\/(?:events|cancel|accept|export|approval))?$/.test(path);
}
