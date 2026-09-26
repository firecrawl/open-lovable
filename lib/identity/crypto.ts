import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {ProjectError} from '../projects/store';
import {authTokensSchema,type AuthTokens} from './types';
const keyFor=(key:Buffer)=>{
 if(key.length!==32)throw new ProjectError('Identity master key must have 32 bytes.',503);
 return Buffer.from(hkdfSync('sha256',key,Buffer.alloc(0),'open-lovable:identity:v1',32));
};
/** Encrypts provider tokens only for the exact local session, actor and configured issuer. */
export function encodeAuthTokens(key:Buffer,id:string,actor:string,issuer:string,tokens:AuthTokens):string {
 const valid=authTokensSchema.parse(tokens),derived=keyFor(key),nonce=randomBytes(12);
 try {
  const cipher=createCipheriv('aes-256-gcm',derived,nonce);
  cipher.setAAD(Buffer.from(`session:v1:${id}:${actor}:${issuer}`));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(valid)),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64');
 }finally{derived.fill(0);}
}
/** Authenticates stored tokens without exposing a key or provider error in the failure response. */
export function decodeAuthTokens(key:Buffer,id:string,actor:string,issuer:string,encrypted:string):AuthTokens {
 const derived=keyFor(key);
 try {
  const bytes=Buffer.from(encrypted,'base64');if(bytes.length<29||bytes.length>32768)throw new Error('Invalid ciphertext');
  const decipher=createDecipheriv('aes-256-gcm',derived,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(`session:v1:${id}:${actor}:${issuer}`));decipher.setAuthTag(bytes.subarray(12,28));
  const plaintext=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
  try{return authTokensSchema.parse(JSON.parse(plaintext.toString('utf8')));}finally{plaintext.fill(0);}
 }catch{throw new ProjectError('Stored session credentials cannot be authenticated.',503);}
 finally{derived.fill(0);}
}
