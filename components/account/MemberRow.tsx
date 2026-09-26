"use client";
import {useEffect,useState} from 'react';
import type {MemberSummary} from '@/lib/identity/types';
import {actionClass,fieldClass} from './client';
export const roleLabels:Record<string,string>={owner:'Proprietário',admin:'Administrador',editor:'Editor',viewer:'Visualização',billing:'Financeiro'};
export default function MemberRow({member,editable,busy,onChange,onRevoke}:{member:MemberSummary;editable:boolean;busy:boolean;onChange:(role:string)=>Promise<void>;onRevoke:()=>Promise<void>}) {
 const [role,setRole]=useState(member.role);useEffect(()=>setRole(member.role),[member.role,member.version]);
 return <div data-testid="member-row" className="flex min-w-0 flex-wrap items-center justify-between gap-[16px] border-b border-[#e4e4da] py-[20px]">
  <div className="min-w-0"><p className="break-all text-sm font-medium">{member.email||member.actorId}</p><p className="mt-[4px] text-xs text-[#66665b]">{roleLabels[member.role]}{member.active!==1?' · Acesso revogado':''}</p></div>
  {editable&&member.active===1&&<div className="flex min-w-0 flex-wrap items-center gap-[8px]"><select aria-label="Permissão do membro" value={role} onChange={e=>setRole(e.target.value as typeof role)} disabled={busy} className={fieldClass+' !w-auto !py-[8px] !text-xs'}>{Object.entries(roleLabels).filter(([id])=>id!=='owner').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button type="button" disabled={busy||role===member.role} onClick={()=>void onChange(role)} className={actionClass+' !px-[12px] !py-[8px] !text-xs'}>Salvar permissão</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Revogar o acesso deste membro ao workspace?'))void onRevoke();}} className="px-[8px] py-[8px] text-xs text-red-800 underline underline-offset-4 disabled:opacity-40">Revogar acesso</button></div>}
 </div>;
}
