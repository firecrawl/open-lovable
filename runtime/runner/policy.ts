import {RuntimeContractError,type ExecutionSpec} from '../../lib/runtime/contracts';
import {createExecutionPolicy,validateExecutionSpec,type ExecutionPolicy} from '../../lib/runtime/policy';

export interface RunnerCommand {args:string[];policy:ExecutionPolicy;timeoutMs:number;networkMode:string;}

/** Builds a rootless container invocation; it never accepts host mounts or arbitrary host cwd. */
export function buildRootlessRunnerCommand(spec:ExecutionSpec,phase:ExecutionPolicy['phase']='build',networkName?:string,image='open-lovable-runner:rootless-1'):RunnerCommand {
 const policy=createExecutionPolicy(phase,phase==='install'?'registry':'none');
 const validated=validateExecutionSpec(spec,policy);
 if(phase==='install'){
  if(!networkName||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(networkName))throw new RuntimeContractError('Approved install network is required',403);
 }else if(networkName)throw new RuntimeContractError('Network selection is not allowed outside approved install',403);
 const network=phase==='install'?networkName!:'none';
 const args=['run','--rm','--init','--read-only','--network',network,'--pids-limit',String(policy.limits.pids),'--memory',`${policy.limits.memoryMb}m`,'--cpus','1','--storage-opt',`size=${policy.limits.diskMb}M`,'--cap-drop','ALL','--security-opt','no-new-privileges','--user','65532:65532','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/workspace:rw,nosuid,size='+policy.limits.diskMb+'m','--workdir',validated.cwd!];
 for(const [key,value] of Object.entries(validated.env??{}))args.push('--env',`${key}=${value}`);
 args.push(image);
 args.push(...validated.argv);
 return {args,policy,timeoutMs:validated.timeoutMs!,networkMode:network};
}
