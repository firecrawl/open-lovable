"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {appConfig} from '@/config/app.config';
import AccountBar from '@/components/account/AccountBar';
import {useAccount} from '@/components/account/client';
import AIModelSelect from '@/components/AIModelSelect';
import CapabilityDisclosure from '@/components/onboarding/CapabilityDisclosure';
import {projectRequest} from '@/lib/projects/client';
import type {Project} from '@/lib/projects/store';

type Summary=Omit<Project,'snapshot'>;
export default function ProjectsPage(){
 const {account}=useAccount();
 const selectedRole=account?.workspaces?.find(w=>w.id===account.selectedWorkspaceId)?.role;
 const canCreate=account?.mode!=='supabase'||['owner','admin','editor'].includes(selectedRole||'');
 const router=useRouter();const [projects,setProjects]=useState<Summary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState(''),[model,setModel]=useState(appConfig.ai.defaultModel);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/projects',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha ao consultar projetos.');if(!controller.signal.aborted)setProjects(data.projects);}).catch(caught=>{if(!controller.signal.aborted)setError(caught.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
 async function create(event:React.FormEvent){event.preventDefault();if(busy||loading||!canCreate||!name.trim())return;setBusy(true);setError('');try{const {project}=await projectRequest<{project:Project}>({action:'create',name,model});router.push('/projects/'+project.id);}catch(caught){setError(caught instanceof Error?caught.message:'Não foi possível criar o projeto.');setBusy(false);}}
 return <main className="min-h-screen bg-[#f7f7f5] text-[#252520]">
  <AccountBar/>
  <div className="mx-auto max-w-[1200px] px-[20px] py-[28px] md:px-[36px]">
   <header className="mb-[48px] flex flex-wrap items-center justify-between gap-[16px] border-b border-[#dddcd5] pb-[22px]"><Link href="/" className="text-[16px] font-semibold tracking-tight">Open Lovable</Link><nav className="flex flex-wrap gap-[24px] text-[13px]">{account?.mode!=='supabase'&&<Link href="/" className="text-[#68685f] hover:underline">Construtor por URL</Link>}{(account?.mode!=='supabase'||selectedRole==='owner'||selectedRole==='admin')&&<Link href="/settings/ai" className="font-medium hover:underline">Conexões de IA</Link>}</nav></header>
   <div className="mb-[32px] max-w-[700px]"><p className="mb-[10px] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b4826]">Espaço de criação</p><h1 className="text-[36px] font-semibold leading-tight tracking-tight md:text-[44px]">Seus projetos</h1><p className="mt-[16px] text-[16px] leading-relaxed text-[#696960]">Crie, revise e continue de onde parou. Cada proposta tem seu próprio histórico; você decide quando ela vira uma revisão.</p></div>
   {error&&<p role="alert" className="mb-[24px] break-words rounded-md border border-red-200 bg-red-50 p-[16px] text-[14px] text-red-800">{error}</p>}
   <form onSubmit={create} className="mb-[40px] grid items-end gap-[16px] rounded-lg border border-[#deded6] bg-white p-[24px] md:grid-cols-[1.1fr_1fr_auto]">
    <div className="min-w-0"><label htmlFor="project-name" className="mb-[8px] block text-[13px] font-medium">Nome do projeto</label><input id="project-name" value={name} onChange={event=>setName(event.target.value)} maxLength={120} required placeholder="Ex.: Agenda da minha empresa" disabled={busy||loading||!canCreate} className="w-full min-w-0 rounded-md border border-[#d0d0c7] bg-white px-[12px] py-[12px] text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-600"/></div>
    <div className="min-w-0"><p className="mb-[8px] text-[13px] font-medium">Modelo inicial</p><AIModelSelect label="Modelo do projeto" value={model} onValueChange={setModel} disabled={busy||loading||!canCreate}/></div>
    <button type="submit" disabled={busy||loading||!canCreate||!name.trim()} className="rounded-md bg-[#272721] px-[24px] py-[13px] text-[14px] font-medium text-white disabled:opacity-40">{busy?'Criando…':'Criar projeto'}</button>
   </form>
   <CapabilityDisclosure items={[{id:'research',label:'Pesquisa',description:'Consulte fontes autorizadas quando o projeto precisar de contexto adicional.',status:'available'},{id:'operate',label:'Operar',description:'Conecte ferramentas somente depois de revisar escopos e permissões.',status:'available'},{id:'mobile',label:'Mobile',description:'Prepare uma saída responsiva sem alterar o projeto salvo automaticamente.',status:'available'},{id:'lab',label:'Laboratório',description:'Experimente recursos avançados sem misturar protótipos à versão publicada.',status:'available'}]}/>
   <section aria-label="Projetos salvos"><div className="mb-[16px] flex items-baseline justify-between"><h2 className="text-[18px] font-semibold">Projetos salvos</h2><span className="text-[12px] text-[#727268]">{loading?'Consultando…':`${projects.length} projeto${projects.length===1?'':'s'}`}</span></div>
    {loading?<p role="status" className="py-[30px] text-[14px] text-[#6a6a63]">Carregando seus projetos…</p>:projects.length===0?<div className="border-y border-dashed border-[#d9d9d0] py-[48px]"><h3 className="text-[20px] font-medium">Nenhum projeto salvo ainda</h3><p className="mt-[8px] text-[14px] text-[#727268]">Dê um nome acima para começar. Depois, descreva uma ideia ou importe o código existente.</p></div>:<div className="divide-y divide-[#e1e1d9] border-y border-[#deded6]">{projects.map(project=><Link key={project.id} href={'/projects/'+project.id} className="group flex min-w-0 flex-wrap items-center justify-between gap-[16px] py-[22px] hover:bg-white"><div className="min-w-0"><h3 className="break-words text-[18px] font-medium group-hover:text-[#a34920]">{project.name}</h3><p className="mt-[6px] break-all text-[12px] text-[#77776e]">Revisão {project.version} · {new Date(project.updated_at).toLocaleString('pt-BR')}</p></div><span className="text-[13px] font-medium">Abrir projeto →</span></Link>)}</div>}
   </section>
   <p className="mt-[36px] text-[12px] leading-relaxed text-[#77776e]">{account?.mode==='supabase'?'Workspace da sua conta.':'Workspace individual.'} Os dados ficam na instalação do servidor, não apenas nesta aba. Mantenha backup do diretório privado de dados.</p>
  </div>
 </main>;
}
