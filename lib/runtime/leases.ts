import {randomUUID} from 'node:crypto';
import {RuntimeContractError, type RuntimeRef} from './contracts';
export interface RuntimeLease {id:string;runtimeId:string;actorId:string;expiresAt:number;fencing:number;revokedAt?:number;}
export class RuntimeLeaseStore {
 private readonly leases=new Map<string,RuntimeLease>();
 constructor(private readonly clock=()=>Date.now(),private readonly maxTtlMs=15*60*1000){}
 issue(runtimeId:string,actorId:string,requestedTtlMs=5*60*1000):RuntimeLease {const ttl=Math.max(1,Math.min(requestedTtlMs,this.maxTtlMs));const lease={id:randomUUID(),runtimeId,actorId,expiresAt:this.clock()+ttl,fencing:1};this.leases.set(lease.id,lease);return {...lease};}
 renew(leaseId:string,actorId:string,requestedTtlMs=5*60*1000):RuntimeLease {const current=this.require(leaseId,actorId);const renewed={...current,expiresAt:this.clock()+Math.min(requestedTtlMs,this.maxTtlMs),fencing:current.fencing+1};this.leases.set(leaseId,renewed);return {...renewed};}
 revoke(leaseId:string,actorId:string):void {const current=this.require(leaseId,actorId);this.leases.set(leaseId,{...current,revokedAt:this.clock()});}
 require(leaseId:string,actorId:string,runtimeId?:string):RuntimeLease {const lease=this.leases.get(leaseId);if(!lease||lease.actorId!==actorId||lease.revokedAt||lease.expiresAt<=this.clock()||(runtimeId&&lease.runtimeId!==runtimeId))throw new RuntimeContractError('Runtime lease is invalid or expired',403);return {...lease};}
 bind(ref:RuntimeRef,actorId:string):RuntimeLease{return this.require(ref.leaseId,actorId,ref.id);}
}
