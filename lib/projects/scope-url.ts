"use client";
/** Adds only the selected project identifier; the server independently authorizes that resource. */
export function scopedProjectURL(path:string,explicitProjectId?:string):string {
 const projectId=explicitProjectId||(typeof window==='undefined'?undefined:new URLSearchParams(window.location.search).get('projectId'));
 return projectId?path+(path.includes('?')?'&':'?')+'projectId='+encodeURIComponent(projectId):path;
}
