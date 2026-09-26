import {createHash} from 'node:crypto';
import {ProjectError} from '../projects/store';
export interface AcceptanceCase {id:string;input:string;revision:string;environment:'local'|'staging'|'production';steps:string[];result:'passed'|'failed'|'blocked';artifacts:string[];externalDependency?:string;}
export interface AcceptanceReport {suite:string;cases:AcceptanceCase[];digest:string;status:'passed'|'partial'|'blocked';}
export function createAcceptanceReport(suite:string,cases:AcceptanceCase[]):AcceptanceReport{if(!suite||!cases.length||cases.some(item=>!item.id||!item.revision||!item.steps.length))throw new ProjectError('Acceptance cases require traceable inputs, revisions and steps.',422);const status=cases.some(item=>item.result==='failed')?'partial':cases.some(item=>item.result==='blocked')?'blocked':'passed';const digest=createHash('sha256').update(JSON.stringify(cases)).digest('hex');return {suite,cases:structuredClone(cases),digest,status};}
