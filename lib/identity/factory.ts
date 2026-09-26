import {ProjectError,projectStore} from '../projects/store';
import {masterKey} from '../settings/store';
import {IdentityStore} from './store';
import {SupabaseIdentityProvider} from './supabase';
import {AccountService} from './service';
import {authMode} from './config';
/** Constructs services from operator-controlled configuration only; never request body values. */
export function accountService(origin:string):AccountService {
 if(authMode()!=='supabase')throw new ProjectError('Account authentication is not enabled.',409);
 const local=['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);
 const provider=new SupabaseIdentityProvider({
  url:process.env.OPEN_LOVABLE_SUPABASE_URL||'',
  publishableKey:process.env.OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY||'',
  allowLoopback:local&&process.env.OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK==='1',
 });
 return new AccountService(new IdentityStore(projectStore(),masterKey()),provider,origin);
}
