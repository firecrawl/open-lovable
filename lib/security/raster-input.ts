import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {isBase64} from './base64';
export class RasterInputError extends Error {constructor(message:string,readonly status=400){super(message);this.name='RasterInputError';}}
let decoding=0;
/** Decode raster bytes, enforce budgets, orient/resize and re-encode without EXIF or profiles. */
export async function normalizeRasterInput(data:unknown) {
 if(typeof data!=='string'||data.length>7*1024*1024||!isBase64(data))throw new RasterInputError('Use a valid PNG, JPEG or WebP file up to 5 MiB.');
 const bytes=Buffer.from(data,'base64');
 if(!bytes.length||bytes.length>5*1024*1024)throw new RasterInputError('Image exceeds 5 MiB.');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!png&&!jpeg&&!webp)throw new RasterInputError('Only raster PNG, JPEG and WebP images are accepted.');
 if(decoding>=2)throw new RasterInputError('Image processor is busy. Retry after the current upload.',429);
 decoding++;
 try {
  const image=sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning',animated:false});
  const metadata=await image.metadata();
  if(!metadata.width||!metadata.height||metadata.width>8192||metadata.height>8192||(metadata.pages||1)>1)throw new RasterInputError('Image dimensions exceed 8192 pixels or contain animation.');
  const resized=image.rotate().resize({width:2048,height:4096,fit:'inside',withoutEnlargement:true});
  const encoded=await (jpeg?resized.jpeg({quality:90}):webp?resized.webp({quality:90}):resized.png({compressionLevel:9})).toBuffer({resolveWithObject:true});
  if(encoded.data.length>3*1024*1024)throw new RasterInputError('Normalized image exceeds 3 MiB. Crop or reduce the input.');
  return {data:encoded.data.toString('base64'),mime:jpeg?'image/jpeg':webp?'image/webp':'image/png',width:encoded.info.width,height:encoded.info.height,bytes:encoded.data.length,sha256:createHash('sha256').update(encoded.data).digest('hex')};
 }catch(error){if(error instanceof RasterInputError)throw error;throw new RasterInputError('Image could not be decoded within its pixel and format limits.');}
 finally{decoding--;}
}
