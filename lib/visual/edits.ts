import {createHash} from 'node:crypto';
import {ProjectError,type ProjectSnapshot} from '../projects/store';
import {normalizeProjectPath} from '../security/input-validation';
import type {ElementRef} from './source-map';
import type {PatchSet} from '../revisions/patches';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function buildTextVisualEdit(snapshot:ProjectSnapshot,element:ElementRef,value:string,baseRevision:string):PatchSet {
 if(element.revisionDigest!==hash(JSON.stringify(snapshot)))throw new ProjectError('Visual selection belongs to an older revision.',409);
 const path=normalizeProjectPath(element.file),source=snapshot.files[path];
 if(source===undefined||hash(source.slice(element.start,element.end))!==element.sourceHash)throw new ProjectError('Visual source mapping is stale.',409);
 if(!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(element.tag)||value.length>2000||/[<>\{\}]/.test(value))throw new ProjectError('Only static text values can be edited visually.',400);
 const openingEnd=source.indexOf('>',element.start);const closing=`</${element.tag}>`;const close=source.indexOf(closing,openingEnd+1);
 if(openingEnd<0||close<0||source.slice(openingEnd+1,close).includes('<')||source.slice(openingEnd+1,close).includes('{'))throw new ProjectError('Dynamic or ambiguous visual content requires an assisted patch.',409);
 const content=source.slice(0,openingEnd+1)+value+source.slice(close);return {baseRevision,operations:[{kind:'update',path,content}],expectedHashes:{[path]:hash(source)}};
}
