"use client";
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import AccountBar from '@/components/account/AccountBar';
import MemberRow,{roleLabels} from '@/components/account/MemberRow';
import {accountRequest,actionClass,fieldClass,useAccount} from '@/components/account/client';
import type {MemberSummary} from '@/lib/identity/types';
interface Invitation {id:string;email:string;role:string;expires_at:number;consumed_at:number|null;cancelled_at:number|null;}
export default function WorkspacesPage(){
 const {account,error:loadError,loading,reload}=useAccount();
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[role,setRole]=useState('editor'),[link,setLink]=useState('');
 const [members,setMembers]=useState<MemberSummary[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]),[membersLoading,setMembersLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const workspace=account?.workspaces?.find(w=>w.id===account.selectedWorkspaceId),admin=workspace?.role==='owner'||workspace?.role==='admin';
 const workspaceId=workspace?.id;
 const loadMembers=useCallback(async(signal?:AbortSignal)=>{
  if(!workspaceId||!admin)return;setMembersLoading(true);
  try{const data=await accountRequest<{members:MemberSummary[];invitations:Invitation[]}>('/api/workspaces?id='+workspaceId,undefined,signal);if(!signal?.aborted){setMembers(data.members);setInvitations(data.invitations);}}
  catch(caught){if(!signal?.aborted)setError(caught instanceof Error?caught.message:'Falha ao consultar membros.');}
  finally{if(!signal?.aborted)setMembersLoading(false);}
 },[workspaceId,admin]);
 useEffect(()=>{setMembers([]);setInvitations([]);setLink('');const controller=new AbortController();void loadMembers(controller.signal);return()=>controller.abort();},[loadMembers]);
 async function mutate(body:{action:string;[key:string]:unknown},message:string){setBusy(true);setError('');setNotice('');try{await accountRequest('/api/workspaces',body);await reload();if(body.action!=='create'&&body.action!=='select')await loadMembers();setNotice(message);}catch(caught){setError(caught instanceof Error?caught.message:'Operação não concluída.');}finally{setBusy(false);}}
 async function create(event:React.FormEvent){event.preventDefault();await mutate({action:'create',name},'Workspace criado.');setName('');}
 async function invite(event:React.FormEvent){event.preventDefault();if(!workspace)return;setBusy(true);setError('');setNotice('');try{const result=await accountRequest<{invitation:{token:string}}>('/api/workspaces',{action:'invite',workspaceId:workspace.id,email,role});setLink(window.location.origin+'/invite#token='+result.invitation.token);setNotice('Link criado. Compartilhe com o endereço convidado; nenhum e-mail foi enviado por este comando.');await loadMembers();}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível criar o convite.');}finally{setBusy(false);}}
 if(loading)return <main className="p-[32px]"><p role="status">Carregando workspaces…</p></main>;
 if(account?.mode==='individual')return <main className="p-[32px]"><h1 className="text-xl font-semibold">Perfil individual</h1><p className="my-[20px]">A gestão de equipes exige o perfil de contas configurado no servidor.</p><Link href="/projects" className="underline">Voltar aos projetos</Link></main>;
 return <main className="min-h-screen bg-[#f7f7f3] text-[#292922]">
  <AccountBar account={account} workspaceId={workspaceId}/>
  <div className="mx-auto max-w-6xl px-[20px] py-[32px] md:px-[40px]">
   <header className="mb-[32px] flex flex-wrap items-end justify-between gap-[16px] border-b border-[#dcdcd1] pb-[24px]"><div><p className="mb-[8px] text-xs uppercase tracking-[0.15em] text-[#934c2b]">Pessoas e acesso</p><h1 className="text-3xl font-semibold tracking-tight">Workspaces</h1></div><Link href="/projects" className="text-sm underline underline-offset-4">Voltar aos projetos</Link></header>
   {(error||loadError)&&<p role="alert" className="mb-[24px] rounded-md border border-red-200 bg-red-50 p-[16px] text-sm text-red-800">{error||loadError}</p>}
   {notice&&<p role="status" className="mb-[24px] rounded-md border border-[#d9dfcd] bg-[#f5f8ee] p-[16px] text-sm leading-relaxed text-[#405232]">{notice}</p>}
   <div className="grid items-start gap-[32px] lg:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="min-w-0">
     <h2 className="mb-[16px] text-sm font-semibold">Seus espaços de trabalho</h2>
     <div className="divide-y divide-[#deded3] border-y border-[#deded3]">{account?.workspaces?.map(w=><button type="button" key={w.id} disabled={busy} onClick={()=>void mutate({action:'select',workspaceId:w.id},'Workspace selecionado.')} className={'block w-full px-[8px] py-[16px] text-left '+(workspace?.id===w.id?'bg-white':'')}><span className="block break-words text-sm font-medium">{w.name}</span><span className="mt-[4px] block text-xs text-[#66665b]">{roleLabels[w.role]}</span></button>)}</div>
     <form onSubmit={create} className="mt-[32px] border-t border-[#deded3] pt-[24px]"><label htmlFor="new-workspace" className="mb-[8px] block text-sm font-medium">Nome do novo workspace</label><input id="new-workspace" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required disabled={busy} className={fieldClass}/><button disabled={busy||!name.trim()} className={actionClass+' mt-[12px] w-full'}>Criar workspace</button></form>
    </aside>
    <section className="min-w-0 rounded-lg border border-[#deded3] bg-white p-[20px] md:p-[28px]">
     {workspace?<><div className="mb-[28px] flex flex-wrap items-center justify-between gap-[16px]"><div><h2 className="break-words text-2xl font-semibold tracking-tight">{workspace.name}</h2><p className="mt-[8px] text-sm text-[#66665b]">Seu acesso: {roleLabels[workspace.role]}</p></div>{admin&&<button type="button" disabled={busy||membersLoading} onClick={()=>void loadMembers()} className="text-xs underline underline-offset-4">Atualizar membros</button>}</div>
      {!admin?<p className="text-sm leading-relaxed text-[#737367]">Você pode usar os projetos permitidos neste workspace. Convites, conexões e alterações de acesso são administrados pelo proprietário e pelos administradores.</p>:<>
       <form onSubmit={invite} className="grid items-end gap-[12px] border-y border-[#e4e4da] py-[24px] md:grid-cols-[minmax(0,1fr)_160px_auto]"><div><label htmlFor="invite-email" className="mb-[8px] block text-xs font-medium">E-mail do convidado</label><input id="invite-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} disabled={busy} className={fieldClass}/></div><div><label htmlFor="invite-role" className="mb-[8px] block text-xs font-medium">Permissão do convite</label><select id="invite-role" value={role} onChange={e=>setRole(e.target.value)} disabled={busy} className={fieldClass}>{Object.entries(roleLabels).filter(([id])=>id!=='owner'&&(workspace.role==='owner'||id!=='admin')).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></div><button disabled={busy||!email.trim()} className={actionClass}>Criar convite</button></form>
       {link&&<div className="my-[20px] rounded-md border border-[#dfcfb9] bg-[#fcf8f0] p-[16px]"><label htmlFor="invitation-link" className="mb-[8px] block text-xs font-medium">Link do convite</label><input id="invitation-link" readOnly value={link} className={fieldClass+' !text-xs'}/><button type="button" onClick={()=>{void (navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject(new Error('Clipboard unavailable'))).then(()=>setNotice('Link copiado.')).catch(()=>setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.'));}} className="mt-[12px] text-xs underline underline-offset-4">Copiar link</button><p className="mt-[8px] text-xs leading-relaxed text-[#82745e]">Válido por 24 horas, para uma única aceitação com o e-mail convidado.</p></div>}
       <h3 className="mt-[28px] text-sm font-semibold">Membros</h3>
       {membersLoading&&<p role="status" className="py-[12px] text-xs text-[#66665b]">Atualizando permissões…</p>}
       {members.map(member=><MemberRow key={member.actorId} member={member} busy={busy||membersLoading} editable={member.actorId!==account?.user?.id&&member.role!=='owner'&&(workspace.role==='owner'||member.role!=='admin')} onChange={next=>mutate({action:'change-member',workspaceId:workspace.id,actorId:member.actorId,role:next,version:member.version},'Permissão atualizada.')} onRevoke={()=>mutate({action:'revoke-member',workspaceId:workspace.id,actorId:member.actorId,version:member.version},'Acesso revogado.')}/>)}
       <h3 className="mb-[12px] mt-[32px] text-sm font-semibold">Convites</h3>
       {!invitations.length?<p className="text-sm text-[#66665b]">Nenhum convite criado neste workspace.</p>:<div className="divide-y divide-[#e5e5da]">{invitations.map(invitation=><div key={invitation.id} className="flex min-w-0 flex-wrap items-center justify-between gap-[12px] py-[12px]"><div className="min-w-0"><p className="break-all text-sm">{invitation.email}</p><p className="mt-[4px] text-xs text-[#66665b]">{roleLabels[invitation.role]} · {invitation.consumed_at?'Aceito':invitation.cancelled_at?'Cancelado':invitation.expires_at<=Date.now()?'Expirado':'Pendente'}</p></div>{!invitation.consumed_at&&!invitation.cancelled_at&&invitation.expires_at>Date.now()&&<button type="button" disabled={busy} onClick={()=>void mutate({action:'cancel-invite',workspaceId:workspace.id,inviteId:invitation.id},'Convite cancelado.')} className="text-xs underline">Cancelar convite</button>}</div>)}</div>}
      </>}
     </>:<div className="py-[32px]"><h2 className="text-xl font-semibold">Escolha um workspace</h2><p className="mt-[12px] text-sm leading-relaxed text-[#737367]">Selecione um espaço ao lado, crie um novo ou aceite um convite válido.</p></div>}
    </section>
   </div>
  </div>
 </main>;
}
