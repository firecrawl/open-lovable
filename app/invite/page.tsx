"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import LoginForm from '@/components/account/LoginForm';
import {accountRequest,actionClass,useAccount} from '@/components/account/client';
export default function InvitePage(){
 const {account,loading,reload,error:sessionError}=useAccount();
 const [token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1)||window.location.search.slice(1)),value=params.get('token')||'';setToken(/^[A-Za-z0-9_-]{43}$/.test(value)?value:'');window.history.replaceState(null,'','/invite');},[]);
 async function accept(){setBusy(true);setError('');try{await accountRequest('/api/workspaces',{action:'accept-invite',token});window.location.assign('/projects');}catch(caught){setError(caught instanceof Error?caught.message:'Convite não aceito.');setBusy(false);}}
 return <main className="min-h-screen bg-[#f7f7f3] px-[20px] py-[48px] text-[#292922]"><div className="mx-auto max-w-lg"><p className="mb-[32px] text-base font-semibold">Open Lovable · Workspace</p><section className="rounded-lg border border-[#ddddd1] bg-white p-[24px] md:p-[36px]"><h1 className="text-2xl font-semibold tracking-tight">Você recebeu um convite</h1><p className="mb-[28px] mt-[12px] text-sm leading-relaxed text-[#77776b]">O convite só pode ser aceito pela conta com o e-mail autorizado. A aceitação concede o acesso definido pelo administrador.</p>
  {(error||sessionError)&&<p role="alert" className="mb-[20px] rounded border border-red-200 bg-red-50 p-[16px] text-sm text-red-800">{error||sessionError}</p>}
  {!token?<p role="alert" className="text-sm text-[#7b4f30]">Abra novamente o link completo do convite. O código não é guardado neste navegador depois de sair da página.</p>:loading?<p role="status" className="text-sm">Verificando sua sessão…</p>:account?.authenticated?<><p className="mb-[20px] break-all text-sm">Conta: <strong>{account.user?.email}</strong></p><button type="button" onClick={()=>void accept()} disabled={busy||account.purpose==='recovery'} className={actionClass+' w-full'}>{busy?'Aceitando…':'Aceitar convite'}</button></>:<LoginForm onAuthenticated={()=>void reload()}/>}
  <Link href="/projects" className="mt-[28px] block text-sm underline underline-offset-4">Voltar aos projetos</Link>
 </section></div></main>;
}
