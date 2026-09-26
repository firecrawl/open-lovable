"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {accountRequest,useAccount,type AccountInfo} from './client';
export default function AccountBar({workspaceId,account:externalAccount}:{workspaceId?:string;account?:AccountInfo|null}) {
 const {account:loadedAccount,error:loadError}=useAccount(!externalAccount);const account=externalAccount||loadedAccount;const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(account?.mode==='supabase'&&!account.authenticated)window.location.replace('/login');else if(account?.purpose==='recovery')window.location.replace('/auth/confirm');},[account]);
 if(!account||account.mode==='individual')return loadError?<p role="alert" className="bg-red-50 px-[24px] py-[12px] text-sm text-red-800">{loadError}</p>:null;
 async function select(id:string){setBusy(true);setError('');try{await accountRequest('/api/workspaces',{action:'select',workspaceId:id});window.location.assign('/projects');}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível trocar o workspace.');setBusy(false);}}
 async function logout(){setBusy(true);setError('');try{await accountRequest('/api/auth',{action:'logout'});window.location.assign('/login');}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível sair.');setBusy(false);}}
 return <div className="border-b border-[#dcdcd2] bg-[#f1f1eb] px-[20px] py-[12px] text-xs text-[#5d5d52] md:px-[32px]">
  <div className="mx-auto flex max-w-[1580px] flex-wrap items-center justify-between gap-[12px]">
   <div className="flex min-w-0 flex-wrap items-center gap-[12px]"><label htmlFor="active-workspace" className="font-medium">Workspace</label><select id="active-workspace" value={workspaceId||account.selectedWorkspaceId||''} onChange={e=>void select(e.target.value)} disabled={busy} className="max-w-full rounded border border-[#d1d1c6] bg-white px-[8px] py-[8px] text-xs"><option value="" disabled>Selecione</option>{account.workspaces?.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><Link href="/workspaces" className="underline underline-offset-4">Gerenciar workspace</Link></div>
   <div className="flex min-w-0 flex-wrap items-center gap-[16px]"><span className="break-all">{account.user?.email}</span><button type="button" onClick={()=>void logout()} disabled={busy} className="font-medium underline underline-offset-4">Sair</button></div>
  </div>
  {error&&<p role="alert" className="mx-auto mt-[12px] max-w-[1580px] text-red-800">{error}</p>}
 </div>;
}
