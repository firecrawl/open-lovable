import {createHash,randomUUID} from 'node:crypto';
import {RuntimeContractError} from '../runtime/contracts';
export interface PlanStep {id:string;title:string;acceptance:string[];}
export interface PlanRevision {id:string;version:number;baseRevision:string;requirements:string[];steps:PlanStep[];approvedDigest?:string;createdAt:number;}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class PlanService {private readonly plans=new Map<string,PlanRevision[]>();constructor(private readonly clock=()=>Date.now()){}
 create(projectId:string,baseRevision:string,requirements:string[],steps:PlanStep[]):PlanRevision {if(!projectId||!baseRevision||!requirements.length||!steps.length)throw new RuntimeContractError('Plan requires requirements and steps',400);const history=this.plans.get(projectId)??[],plan={id:randomUUID(),version:history.length+1,baseRevision,requirements:[...requirements],steps:steps.map(step=>({...step,acceptance:[...step.acceptance]})),createdAt:this.clock()};history.push(plan);this.plans.set(projectId,history);return clone(plan);}
 approve(projectId:string,planId:string):PlanRevision {const plan=this.require(projectId,planId);const approved={...plan,approvedDigest:digest(unsigned(plan))};this.replace(projectId,approved);return clone(approved);}
 edit(projectId:string,planId:string,requirements: string[],steps:PlanStep[]):PlanRevision {const plan=this.require(projectId,planId);const edited={...plan,id:randomUUID(),version:plan.version+1,requirements:[...requirements],steps:steps.map(step=>({...step,acceptance:[...step.acceptance]})),approvedDigest:undefined,createdAt:this.clock()};const history=this.plans.get(projectId)!;history.push(edited);return clone(edited);}
 requireApproved(projectId:string,planId:string):PlanRevision {const plan=this.require(projectId,planId);if(!plan.approvedDigest||plan.approvedDigest!==digest(unsigned(plan)))throw new RuntimeContractError('Plan is not approved for execution',409);return clone(plan);}
 private require(projectId:string,id:string){const plan=this.plans.get(projectId)?.find(candidate=>candidate.id===id);if(!plan)throw new RuntimeContractError('Plan not found',404);return plan;}
 private replace(projectId:string,plan:PlanRevision){const history=this.plans.get(projectId)!;history[history.findIndex(candidate=>candidate.id===plan.id)]=plan;}
}
function unsigned(plan:PlanRevision){const {approvedDigest:_,...rest}=plan;return rest;}
function clone<T>(value:T):T{return JSON.parse(JSON.stringify(value));}
