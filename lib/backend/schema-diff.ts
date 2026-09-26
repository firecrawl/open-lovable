import {createHash} from 'node:crypto';
import {ProjectError} from '../projects/store';
export interface SchemaDiff {baseDigest:string;nextDigest:string;added:string[];removed:string[];}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const normalize=(schema:string)=>schema.split('\n').map(line=>line.trim()).filter(Boolean).sort();
export function compareSchema(base:string,next:string):SchemaDiff {const a=normalize(base),b=normalize(next),setA=new Set(a),setB=new Set(b);return {baseDigest:digest(a.join('\n')),nextDigest:digest(b.join('\n')),added:b.filter(line=>!setA.has(line)),removed:a.filter(line=>!setB.has(line))};}
export function assertAdditive(diff:SchemaDiff):void {if(diff.removed.length)throw new ProjectError('Schema diff removes objects and requires explicit destructive review.',409);}
