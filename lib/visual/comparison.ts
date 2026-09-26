import {createHash} from 'node:crypto';
import {ProjectError} from '../projects/store';
export interface VisualEvidence {targetDigest:string;renderDigest:string;viewport:{width:number;height:number};metric?:number;review:string;functionalErrors:string[];referenceOnly:boolean;evidenceDigest:string;}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function buildVisualEvidence(input:Omit<VisualEvidence,'evidenceDigest'>):VisualEvidence {
 if(!/^[a-f0-9]{64}$/.test(input.targetDigest)||!/^[a-f0-9]{64}$/.test(input.renderDigest))throw new ProjectError('Visual evidence requires content digests.',400);
 if(!Number.isInteger(input.viewport.width)||!Number.isInteger(input.viewport.height)||input.viewport.width<240||input.viewport.height<240||input.viewport.width>4096||input.viewport.height>4096)throw new ProjectError('Visual evidence viewport is invalid.',400);
 if(input.metric!==undefined&&(!Number.isFinite(input.metric)||input.metric<0||input.metric>1))throw new ProjectError('Visual evidence metric must be between zero and one.',400);
 if(!input.review.trim()||input.review.length>4000)throw new ProjectError('Human visual review is required.',400);
 if(input.referenceOnly)throw new ProjectError('A reference image cannot substitute for functional interface evidence.',409);
 return {...input,evidenceDigest:hash(JSON.stringify(input))};
}
export function assertComparableVisualEvidence(evidence:VisualEvidence):void {const {evidenceDigest,...unsigned}=evidence;if(evidenceDigest!==hash(JSON.stringify(unsigned)))throw new ProjectError('Visual evidence integrity failed.',409);if(evidence.functionalErrors.length)throw new ProjectError('Functional errors must be resolved before visual release comparison.',409);}
