import {createHash} from 'node:crypto';
import {Agent,fetch as httpFetch} from 'undici';
import {z} from 'zod';
import {validateProviderURL,publicLookup,loopbackLookup} from '../ai/provider-transport';
import {ProjectError} from '../projects/store';
import {authTokensSchema,emailSchema,type AuthTokens} from './types';
export interface IdentityProviderConfig {url:string;publishableKey:string;allowLoopback?:boolean;}
export interface ProviderUser {subject:string;email:string;name:string;}
const userSchema=z.object({id:z.string().uuid(),email:emailSchema,email_confirmed_at:z.string().datetime(),is_anonymous:z.boolean().optional(),user_metadata:z.record(z.unknown()).optional()});
/** Minimal server-side GoTrue adapter. No service-role key, browser SDK or localStorage session. */
export class SupabaseIdentityProvider {
 readonly issuer:string;
 readonly binding:string;
 private readonly local:boolean;
 constructor(private readonly config:IdentityProviderConfig) {
  const url=validateProviderURL(config.url,config.allowLoopback);
  if(url.pathname!=='/'&&url.pathname!=='')throw new ProjectError('Identity URL must be an origin.',503);
  if(config.publishableKey.length>8192||/[\s\r\n]/.test(config.publishableKey))throw new ProjectError('Invalid identity publishable key.',503);
  let publicKey=config.publishableKey.startsWith('sb_publishable_');
  if(!publicKey)try{publicKey=JSON.parse(Buffer.from(config.publishableKey.split('.')[1],'base64url').toString()).role==='anon';}catch{/* Not an accepted public key. */}
  if(!publicKey)throw new ProjectError('Identity requires a publishable or anon key, never a service-role key.',503);
  this.issuer=url.origin+'/auth/v1';this.local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  this.binding=this.issuer+'#'+createHash('sha256').update(config.publishableKey).digest('hex');
 }
 private async call(path:string,method:string,body?:unknown,token?:string,signal?:AbortSignal):Promise<unknown> {
  const dispatcher=new Agent({connect:{timeout:10000,lookup:this.local?loopbackLookup:publicLookup}});
  const headers:Record<string,string>={'apikey':this.config.publishableKey,'Content-Type':'application/json','Accept':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const timeout=AbortSignal.timeout(15000),joined=signal?AbortSignal.any([timeout,signal]):timeout;
  try {
   const serialized=body===undefined?undefined:JSON.stringify(body);
   if(serialized&&Buffer.byteLength(serialized)>32768)throw new ProjectError('Identity request is oversized.');
   const response=await httpFetch(this.issuer+path,{method,headers,body:serialized,dispatcher,redirect:'error',signal:joined});
   if(!response.ok){await response.body?.cancel();throw new ProjectError(response.status===429?'Identity rate limit reached. Try later.':'Identity provider rejected the request.',response.status===429?429:response.status>=500?503:401);}
   if(response.status===204)return {};
   const chunks:Buffer[]=[];let length=0;
   if(response.body)for await(const chunk of response.body){length+=chunk.byteLength;if(length>128*1024)throw new ProjectError('Identity provider response is oversized.',503);chunks.push(Buffer.from(chunk));}
   const text=Buffer.concat(chunks).toString('utf8');return text?JSON.parse(text):{};
  }catch(error){if(error instanceof ProjectError)throw error;throw new ProjectError('Identity provider connection failed. Retry later.',503);}
  finally{await dispatcher.destroy();}
 }
 /** Identity is checked by /user, not by decoding untrusted session payloads. */
 async getUser(token:string,signal?:AbortSignal):Promise<ProviderUser> {
  const parsed=userSchema.safeParse(await this.call('/user','GET',undefined,token,signal));
  if(!parsed.success||parsed.data.is_anonymous)throw new ProjectError('A verified email identity is required.',403);
  const user=parsed.data;return {subject:user.id,email:user.email,name:typeof user.user_metadata?.name==='string'?user.user_metadata.name.slice(0,120):user.email};
 }
 private async exchange(path:string,body:unknown,signal?:AbortSignal) {
  const result=authTokensSchema.safeParse(await this.call(path,'POST',body,undefined,signal));
  if(!result.success)throw new ProjectError('Identity provider returned invalid session data.',503);
  return {tokens:result.data,user:await this.getUser(result.data.access_token,signal)};
 }
 signIn(email:string,password:string,signal?:AbortSignal){return this.exchange('/token?grant_type=password',{email,password},signal);}
 refresh(refreshToken:string,signal?:AbortSignal){return this.exchange('/token?grant_type=refresh_token',{refresh_token:refreshToken},signal);}
 confirm(tokenHash:string,type:'signup'|'email'|'recovery',signal?:AbortSignal){return this.exchange('/verify',{token_hash:tokenHash,type},signal);}
 async signOut(accessToken:string):Promise<void>{await this.call('/logout?scope=local','POST',undefined,accessToken);}
 async recover(email:string,redirectTo:string,signal?:AbortSignal):Promise<void>{await this.call('/recover?redirect_to='+encodeURIComponent(redirectTo),'POST',{email},undefined,signal);}
 async signUp(email:string,password:string,redirectTo:string,signal?:AbortSignal):Promise<void>{await this.call('/signup?redirect_to='+encodeURIComponent(redirectTo),'POST',{email,password},undefined,signal);}
 async updatePassword(tokens:AuthTokens,password:string,signal?:AbortSignal):Promise<void>{await this.call('/user','PUT',{password},tokens.access_token,signal);}
}
