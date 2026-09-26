import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
async function budgetFactory(){
 const recoveryModule=await import('../lib/projects/recovery') as Record<string,unknown>;
 const fn=recoveryModule.createRecoveryBudget;
 assert.equal(typeof fn,'function','Recovery budget must be testable at synchronous boundaries');
 return fn as (options:{timeoutMs:number;signal?:AbortSignal})=>{check:()=>void};
}
test('recovery deadline is enforced even while timers cannot execute',async()=>{
 const factory=await budgetFactory();const budget=factory({timeoutMs:20});
 const start=performance.now();while(performance.now()-start<40){};
 assert.throws(()=>budget.check(),/time|deadline/i);
});
test('recovery still observes an explicitly cancelled caller and rejects invalid budgets',async()=>{
 const factory=await budgetFactory();const controller=new AbortController();const budget=factory({timeoutMs:1000,signal:controller.signal});
 controller.abort(new Error('caller cancelled'));assert.throws(()=>budget.check(),/cancel/);
 assert.throws(()=>factory({timeoutMs:0}),/Invalid/);
});
