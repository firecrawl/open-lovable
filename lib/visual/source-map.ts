import {createHash} from 'node:crypto';
import {normalizeProjectPath} from '../security/input-validation';

export interface ElementRef {runtimeId:string;revisionDigest:string;elementId:string;file:string;start:number;end:number;tag:string;sourceHash:string;}
export interface SourceMap {revisionDigest:string;elements:ElementRef[];version:1;}
const tagPattern=/<([A-Za-z][A-Za-z0-9._:-]*)(?=\s|\/?>)/g;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function buildSourceMap(files:Record<string,string>,revisionDigest:string,runtimeId:string):SourceMap {
 const elements:ElementRef[]=[];
 for(const file of Object.keys(files).sort()){
  if(!/[.]tsx?$|[.]jsx?$/.test(file))continue;
  const text=files[file];let match:RegExpExecArray|null;let index=0;
  while((match=tagPattern.exec(text))){const tag=match[1];if(['Fragment','React.Fragment'].includes(tag))continue;const start=match.index,end=match.index+match[0].length;const elementId=digest(`${revisionDigest}:${file}:${start}:${index++}`).slice(0,32);elements.push({runtimeId,revisionDigest,elementId,file:normalizeProjectPath(file),start,end,tag,sourceHash:digest(text.slice(start,end))});}
 }
 return {revisionDigest,elements,version:1};
}
export function instrumentJsx(files:Record<string,string>,map:SourceMap):Record<string,string>{
 const byFile=new Map(map.elements.map(element=>[`${element.file}:${element.start}`,element]));const output={...files};
 for(const [file,text] of Object.entries(files)){
  if(!/[.]tsx?$|[.]jsx?$/.test(file))continue;
  output[file]=text.replace(tagPattern,(whole,tag:string,index:number)=>{const element=byFile.get(`${file}:${index}`);if(!element||whole.includes('data-open-lovable-element'))return whole;const insertion=`data-open-lovable-element="${element.elementId}"`;return whole.replace(`<${tag}`,`<${tag} ${insertion}`);});
 }
 return output;
}
