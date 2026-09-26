import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTransition,canTransition,isTerminal} from '../../lib/runs/state-machine';

test('P08-A allows queued execution to run, wait and resume without terminal replay',()=>{assert.equal(canTransition('QUEUED','RUNNING'),true);assert.equal(canTransition('RUNNING','AWAITING_INPUT'),true);assert.equal(canTransition('AWAITING_INPUT','QUEUED'),true);assert.equal(isTerminal('SUCCEEDED'),true);});
test('P08-B rejects late commits and invalid terminal transitions',()=>{assert.throws(()=>assertTransition('SUCCEEDED','QUEUED'),/Invalid run state/i);assert.throws(()=>assertTransition('CANCELLED','RUNNING'),/Invalid run state/i);assert.equal(canTransition('RUNNING','CANCELLED'),true);});
