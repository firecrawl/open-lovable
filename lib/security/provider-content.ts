import {assertNoSecrets} from './secret-content';
import {normalizeRasterInput} from './raster-input';

type Obj=Record<string,unknown>;
const object=(value:unknown):value is Obj=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const rasterTypes=new Set(['image/png','image/jpeg','image/webp']);

/** Separates only protocol-defined inline images from text. Unknown fields remain scanned.
 * Images are decoded, limited and re-encoded without metadata. Remote image fetching is not allowed.
 * This does not identify credentials or personal data visible in pixels.
 */
export async function prepareProviderBody(body:string):Promise<string>{
 const payload:unknown=JSON.parse(body),inspection:unknown=JSON.parse(body);
 if(!object(payload)||!object(inspection))throw new Error('Provider JSON body must be an object');
 let count=0,bytes=0;
 async function decode(data:unknown,mime:unknown){
  if(typeof mime!=='string'||!rasterTypes.has(mime))throw new Error('Unsupported provider raster image format');
  if(++count>4)throw new Error('Provider image count exceeds four');
  const normalized=await normalizeRasterInput(data);
  if(normalized.mime!==mime)throw new Error('Provider image media type does not match decoded bytes');
  bytes+=normalized.bytes;if(bytes>6*1024*1024)throw new Error('Provider image input exceeds 6 MiB');
  return normalized;
 }
 async function dataURL(data:unknown){
  if(typeof data!=='string')throw new Error('Provider image input requires an inline raster data URL');
  const comma=data.indexOf(',');
  if(comma<0||comma>64)throw new Error('Provider image input requires an inline raster data URL');
  const match=/^data:(image\/(?:png|jpeg|webp));base64$/.exec(data.slice(0,comma));
  if(!match)throw new Error('Provider image input requires an inline raster data URL');
  const normalized=await decode(data.slice(comma+1),match[1]);
  return `data:${normalized.mime};base64,${normalized.data}`;
 }
 async function processPart(part:unknown,safe:unknown){
  if(!object(part)||!object(safe))return;
  if(part.type==='image_url'){
   if(!object(part.image_url)||!object(safe.image_url))throw new Error('Invalid inline image source');
   part.image_url.url=await dataURL(part.image_url.url);safe.image_url.url='[VALIDATED_RASTER_BYTES]';
  }else if(part.type==='input_image'){
   part.image_url=await dataURL(part.image_url);safe.image_url='[VALIDATED_RASTER_BYTES]';
  }else if(part.type==='image'){
   if(!object(part.source)||!object(safe.source)||part.source.type!=='base64')throw new Error('Image source must be an inline base64 raster');
   const normalized=await decode(part.source.data,part.source.media_type);
   part.source.data=normalized.data;safe.source.data='[VALIDATED_RASTER_BYTES]';
  }else if(Object.hasOwn(part,'fileData')){
   throw new Error('Remote provider image/file sources are not supported; use a validated inline raster');
  }else if(object(part.inlineData)&&object(safe.inlineData)){
   const normalized=await decode(part.inlineData.data,part.inlineData.mimeType);
   part.inlineData.data=normalized.data;safe.inlineData.data='[VALIDATED_RASTER_BYTES]';
  }
 }
 // Match exact API locations, not an arbitrary nested key named data/image/source.
 for(const field of ['messages','input','contents']){
  const messages=payload[field],safeMessages=inspection[field];
  if(!Array.isArray(messages)||!Array.isArray(safeMessages))continue;
  if(messages.length>1000)throw new Error('Too many provider messages');
  for(let i=0;i<messages.length;i++){
   const message=messages[i],safeMessage=safeMessages[i];if(!object(message)||!object(safeMessage))continue;
   const key=field==='contents'?'parts':'content';const parts=message[key],safeParts=safeMessage[key];
   if(!Array.isArray(parts)||!Array.isArray(safeParts))continue;
   if(parts.length>1000)throw new Error('Too many provider message parts');
   for(let j=0;j<parts.length;j++)await processPart(parts[j],safeParts[j]);
  }
 }
 assertNoSecrets(inspection);
 const encoded=JSON.stringify(payload);
 if(Buffer.byteLength(encoded)>12*1024*1024)throw new Error('Normalized provider request exceeds byte limit');
 return encoded;
}
