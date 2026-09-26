import sharp from 'sharp';
/** Deliberate synthetic token-shaped base64 in an ignored PNG chunk, not a real credential. */
export async function rasterWithTokenShapedEncoding():Promise<Buffer>{
 const png=await sharp({create:{width:3,height:2,channels:3,background:'#ededed'}}).png().toBuffer();
 const insertAt=png.length-12,padding=(3-(insertAt+8)%3)%3;
 const data=Buffer.concat([Buffer.alloc(padding),Buffer.from('///AKIAABCDEFGHIJKLMNOP/AAAA','base64')]);
 const type=Buffer.from('dzZz');const payload=Buffer.concat([type,data]);
 let crc=0xffffffff;for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([png.subarray(0,insertAt),length,payload,checksum,png.subarray(insertAt)]);
}
