import {ProjectError} from '../projects/store';
export interface QuotaUsage {source:number;references:number;candidates:number;logs:number;captures:number;research:number;release:number;}
export interface QuotaLimits {maxBytes:number;maxArtifacts:number;retentionMs:number;}
export class QuotaService {
 constructor(private readonly limits:QuotaLimits={maxBytes:256*1024*1024,maxArtifacts:10000,retentionMs:30*24*60*60*1000}) {}
 assertCanStore(usage:QuotaUsage,kind:keyof QuotaUsage,bytes:number,currentArtifacts=0,additionalArtifacts=1):void {if(!Number.isSafeInteger(bytes)||bytes<0||bytes>32*1024*1024)throw new ProjectError('Invalid artifact size',400);const total=Object.values(usage).reduce((sum,value)=>sum+value,0);if(total+bytes>this.limits.maxBytes||currentArtifacts+additionalArtifacts>this.limits.maxArtifacts)throw new ProjectError('Workspace artifact quota exceeded (storage budget)',413);if(!(kind in usage))throw new ProjectError('Unknown artifact kind',400);}
 retentionCutoff(now=Date.now()):number {return now-this.limits.retentionMs;}
}
