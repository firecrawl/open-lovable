"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {accountRequest,actionClass,fieldClass,useAccount} from './client';
export default function LoginForm({onAuthenticated}:{onAuthenticated?:()=>void}) {
 const {account,error:configurationError,loading}=useAccount();
 const [mode,setMode]=useState<'login'|'recover'|'register'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef<AbortController|null>(null);useEffect(()=>()=>active.current?.abort(),[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;const controller=new AbortController();active.current=controller;setBusy(true);setError('');setNotice('');
  try{
   await accountRequest('/api/auth',mode==='recover'?{action:mode,email}:{action:mode,email,password},controller.signal);
   if(mode==='login'){setPassword('');if(onAuthenticated)onAuthenticated();else window.location.assign('/projects');}
   else {setPassword('');setNotice(mode==='recover'?'Se este endereço for elegível, siga as instruções de recuperação enviadas pelo provedor de conta.':'Confira as instruções de confirmação do provedor de conta. Depois, entre com seu e-mail e senha.');}
  }catch(caught){if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:'Não foi possível entrar.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const changeMode=(next:typeof mode)=>{setMode(next);setError('');setNotice('');setPassword('');};
 if(loading)return <p role="status" className="py-[32px] text-sm text-[#73736a]">Verificando a configuração de acesso…</p>;
 if(account?.mode==='individual')return <div className="space-y-[16px] text-sm"><p>Esta instalação usa o perfil de operador individual. O login por contas não está habilitado.</p><Link className="underline" href="/projects">Abrir projetos do operador</Link></div>;
 return <div>
  {(error||configurationError)&&<p role="alert" className="mb-[20px] rounded-md border border-red-200 bg-red-50 p-[16px] text-sm text-red-800">{error||configurationError}</p>}
  {notice&&<p role="status" className="mb-[20px] rounded-md border border-[#d6ddca] bg-[#f6f8f0] p-[16px] text-sm leading-relaxed text-[#405034]">{notice}</p>}
  <form onSubmit={submit} className="space-y-[20px]">
   <div><label htmlFor="account-email" className="mb-[8px] block text-sm font-medium">E-mail</label><input id="account-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required maxLength={254} disabled={busy} className={fieldClass}/></div>
   {mode!=='recover'&&<div><label htmlFor="account-password" className="mb-[8px] block text-sm font-medium">Senha</label><input id="account-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='register'?'new-password':'current-password'} required minLength={mode==='register'?12:1} maxLength={mode==='login'?1024:128} disabled={busy} className={fieldClass}/>{mode==='register'&&<p className="mt-[8px] text-xs text-[#73736a]">Use pelo menos 12 caracteres.</p>}</div>}
   <button type="submit" disabled={busy||!!configurationError} className={actionClass+' w-full'}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='recover'?'Solicitar recuperação':'Criar conta'}</button>
  </form>
  <div className="mt-[24px] flex flex-wrap justify-between gap-[16px] text-sm text-[#814726]">
   {mode==='login'?<button type="button" onClick={()=>changeMode('recover')} disabled={busy} className="underline underline-offset-4">Esqueci minha senha</button>:<button type="button" onClick={()=>changeMode('login')} disabled={busy} className="underline underline-offset-4">Voltar para entrar</button>}
   {account?.signupEnabled&&mode!=='register'&&<button type="button" onClick={()=>changeMode('register')} disabled={busy} className="underline underline-offset-4">Criar uma conta</button>}
  </div>
 </div>;
}
