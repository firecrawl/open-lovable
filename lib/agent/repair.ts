import {RuntimeContractError} from '../runtime/contracts';
export interface RepairBudget {maxRepairs:number;maxToolCalls:number;deadlineMs:number;}
export interface RepairStep {attempt:number;phase:'observe'|'act'|'validate'|'stopped';passed:boolean;summary:string;}
export interface RepairResult {passed:boolean;steps:RepairStep[];reason:'passed'|'repair_limit'|'tool_limit'|'deadline'|'no_progress'|'failed';}

function validBudget(budget:RepairBudget):void {
 if(!Number.isSafeInteger(budget.maxRepairs)||budget.maxRepairs<0||!Number.isSafeInteger(budget.maxToolCalls)||budget.maxToolCalls<0||!Number.isSafeInteger(budget.deadlineMs)||budget.deadlineMs<1) throw new RuntimeContractError('Invalid repair budget',400);
}

export async function runRepairLoop(
 budget:RepairBudget,
 observe:()=>Promise<string>,
 act:(diagnosis:string)=>Promise<string>,
 validate:()=>Promise<{passed:boolean;summary:string}>,
 clock=()=>Date.now(),
 signal?:AbortSignal,
):Promise<RepairResult>{
 validBudget(budget);
 const started=clock(),steps:RepairStep[]=[];let previous='';let calls=0;
 const stop=(reason:RepairResult['reason']):RepairResult=>({passed:false,steps,reason});
 const before=():RepairResult|null=>{if(signal?.aborted)return stop('deadline');if(clock()-started>=budget.deadlineMs)return stop('deadline');if(calls>=budget.maxToolCalls)return stop('tool_limit');calls++;return null;};
 const after=():RepairResult|null=>{if(signal?.aborted||clock()-started>=budget.deadlineMs)return stop('deadline');return null;};
 for(let attempt=0;attempt<=budget.maxRepairs;attempt++){
  let halted=before();if(halted)return halted;
  const diagnosis=await observe();halted=after();if(halted)return halted;
  steps.push({attempt,phase:'observe',passed:false,summary:diagnosis.slice(0,1000)});
  if(diagnosis===previous&&attempt>0)return stop('no_progress');previous=diagnosis;
  halted=before();if(halted)return halted;
  const result=await validate();halted=after();if(halted)return halted;
  steps.push({attempt,phase:'validate',passed:result.passed,summary:result.summary.slice(0,1000)});
  if(result.passed)return {passed:true,steps,reason:'passed'};
  if(attempt===budget.maxRepairs){steps.push({attempt,phase:'stopped',passed:false,summary:'Repair budget exhausted'});return stop('repair_limit');}
  halted=before();if(halted)return halted;
  const action=await act(diagnosis);halted=after();if(halted)return halted;
  steps.push({attempt,phase:'act',passed:true,summary:action.slice(0,1000)});
 }
 throw new RuntimeContractError('Repair loop reached an invalid state',500);
}
