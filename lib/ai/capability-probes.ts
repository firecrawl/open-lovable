import type {ModelOption} from './provider-catalog';
export type CapabilityName='text'|'coding'|'vision'|'tools'|'reasoning';
export type CapabilityState='supported'|'unsupported'|'unknown';
export interface CapabilityEvidence {modelId:string;capability:CapabilityName;state:CapabilityState;source:'declared'|'negative-declared'|'probe'|'unknown';alternatives:string[];requiresExplicitSelection:boolean;reason:string;}
/** Declared positives and explicit negatives are authoritative; omission from a partial catalog remains unknown. */
export function assessCapability(model:ModelOption,capability:CapabilityName,catalog:ModelOption[]):CapabilityEvidence {
 const declared=model.capabilities.includes(capability);
 const negative=(model as ModelOption & {negativeCapabilities?:string[]}).negativeCapabilities?.includes(capability)===true;
 const state:CapabilityState=declared?'supported':negative?'unsupported':'unknown';
 const source:CapabilityEvidence['source']=declared?'declared':negative?'negative-declared':'unknown';
 const alternatives=catalog.filter(option=>option.id!==model.id&&option.configured&&option.capabilities.includes(capability)).map(option=>option.id).sort();
 const reason=state==='supported'?'Capability is declared by the configured model.':state==='unsupported'?'Capability is explicitly declared unsupported by this model.':'Capability status is unknown because the catalog has no positive or negative evidence; explicit confirmation or an authorized probe is required.';
 return {modelId:model.id,capability,state,source,alternatives,requiresExplicitSelection:state!=='supported',reason};
}
export function assertCapability(model:ModelOption,capability:CapabilityName,catalog:ModelOption[]):CapabilityEvidence {const evidence=assessCapability(model,capability,catalog);if(evidence.state!=='supported'){const suffix=evidence.alternatives.length?` Available alternatives: ${evidence.alternatives.join(', ')}.`:' No configured alternative is available.';throw new Error(`${evidence.reason}${suffix} Select a model explicitly; no silent fallback was applied.`);}return evidence;}
