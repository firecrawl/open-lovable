import {ProjectError,type RunState} from '../projects/store';
const terminal=new Set<RunState>(['SUCCEEDED','FAILED','CANCELLED','INTERRUPTED']);
const transitions:Record<RunState,RunState[]>={QUEUED:['RUNNING','CANCELLED','FAILED'],RUNNING:['QUEUED','AWAITING_INPUT','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'],AWAITING_INPUT:['QUEUED','CANCELLED','FAILED'],AWAITING_APPROVAL:['QUEUED','CANCELLED','FAILED'],SUCCEEDED:[],FAILED:[],CANCELLED:[],INTERRUPTED:[]};
export function canTransition(from:RunState,to:RunState):boolean{return from===to||transitions[from].includes(to)}
export function assertTransition(from:RunState,to:RunState):void{if(!canTransition(from,to))throw new ProjectError(`Invalid run state transition: ${from} -> ${to}`,409)}
export function isTerminal(state:RunState):boolean{return terminal.has(state)}
