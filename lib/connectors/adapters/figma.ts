import {assertContext,type AdapterContext,type AdapterManifest,type AdapterResult} from './contracts';
export const figmaManifest:AdapterManifest={id:'figma',version:'1.0.0',capabilities:['read_frame','read_asset'],requiredScopes:['figma:read'],inputSchema:'FigmaFrameRef',outputSchema:'DesignFrame'};
export interface FigmaFrameRef{fileId:string;frameId:string;accountId:string;projectId:string;}
export interface DesignFrame{fileId:string;frameId:string;name:string;imageUrl?:string;}
export async function readFigmaFrame(context:AdapterContext,ref:FigmaFrameRef,fetcher:(ref:FigmaFrameRef)=>Promise<DesignFrame>):Promise<AdapterResult<DesignFrame>>{assertContext(context,figmaManifest);if(ref.projectId!==context.projectId)throw new Error('Figma object belongs to another project.');const data=await fetcher(ref);return {data,manifest:figmaManifest,provenance:{source:'figma',location:`file:${ref.fileId}/frame:${ref.frameId}`,observedAt:new Date().toISOString(),projectId:context.projectId}};}
