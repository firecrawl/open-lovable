"use client";
import {useCallback,useEffect,useState} from 'react';
import type {WorkspaceSummary} from '@/lib/identity/types';
export interface AccountInfo {mode:'individual'|'supabase';authenticated:boolean;signupEnabled?:boolean;user?:{id:string;email:string;name:string};purpose?:'normal'|'recovery';selectedWorkspaceId?:string|null;workspaces?:WorkspaceSummary[];}
export async function accountRequest<T>(url:string,body?:unknown,signal?:AbortSignal):Promise<T> {
 const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Não foi possível concluir a operação.');
 return data as T;
}
export function useAccount(enabled=true){
 const [account,setAccount]=useState<AccountInfo|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const reload=useCallback(async(signal?:AbortSignal)=>{
  setError('');try{const next=await accountRequest<AccountInfo>('/api/auth',undefined,signal);if(!signal?.aborted)setAccount(next);return next;}
  catch(error){if(!signal?.aborted)setError(error instanceof Error?error.message:'Falha ao verificar a sessão.');return null;}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();void reload(controller.signal);return()=>controller.abort();},[reload,enabled]);
 return {account,error,loading,reload};
}
export const fieldClass='w-full min-w-0 rounded-md border border-[#cecec4] bg-white px-[12px] py-[12px] text-sm text-[#25251f] outline-none focus:ring-2 focus:ring-[#9c4928] disabled:opacity-50';
export const actionClass='rounded-md bg-[#282821] px-[20px] py-[12px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40';
