"use client";
import {useEffect,useState} from 'react';
import {loadRuns,readRunEvents,runRequest} from '@/lib/runs/client';
import type {RunEvent,RunSummary} from '@/lib/runs/types';
const labels:Record<string,string>={
 'audit.exported':'Registro exportado por usu\u00e1rio autorizado','run.invalid-data':'Dados da tarefa recusados por integridade','run.queued':'Pedido salvo na fila','run.claimed':'Executor iniciou o trabalho','model.requested':'Solicita\u00e7\u00e3o enviada ao modelo',
 'model.responded':'Resposta do modelo registrada','run.progress':'Progresso do trabalho','proposal.compiled':'Proposta compilada',
 'plan.completed':'Plano salvo sem alterar arquivos','revision.accepted':'Revis\u00e3o aprovada','run.cancelled':'Cancelamento registrado',
 'run.authorization-denied':'Permiss\u00e3o deixou de autorizar a execu\u00e7\u00e3o','run.requeued':'Valida\u00e7\u00e3o retomada',
 'run.interrupted':'Execu\u00e7\u00e3o interrompida','run.stopped':'Execu\u00e7\u00e3o encerrada',
};
const states:Record<string,string>={QUEUED:'Na fila',RUNNING:'Em execu\u00e7\u00e3o',AWAITING_INPUT:'Aguardando uma decis\u00e3o',AWAITING_APPROVAL:'Aguardando sua revis\u00e3o',SUCCEEDED:'Conclu\u00edda',FAILED:'Falhou',CANCELLED:'Cancelada',INTERRUPTED:'Interrompida'};
const phases:Record<string,string>={planning:'Preparando contexto',generating:'Recebendo resposta',compiling:'Compilando arquivos'};
type PendingApproval={id:string;actionDigest:string;nonce:string;expiresAt:number;kind:string;model:string;connection:{provider:string;endpoint:string;credentialConfigured:boolean}};
/** The displayed timeline is a read-only projection of authorized, persistent server events. */
export default function RunJournal({projectId,refreshKey}:{projectId:string;refreshKey:string}){
 const [runs,setRuns]=useState<RunSummary[]>([]),[selected,setSelected]=useState(''),[events,setEvents]=useState<RunEvent[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[live,setLive]=useState(false),[exporting,setExporting]=useState(false),[approval,setApproval]=useState<PendingApproval|null>(null),[approvalBusy,setApprovalBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
  void loadRuns(projectId,controller.signal).then(data=>{if(controller.signal.aborted)return;setRuns(data.runs);setSelected(current=>data.runs.some(run=>run.id===current)?current:data.runs[0]?.id||'');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[projectId,refreshKey,revision]);
 useEffect(()=>{const run=runs.find(item=>item.id===selected);if(!run||run.state!=='AWAITING_INPUT'){setApproval(null);return;}const controller=new AbortController();void runRequest<{pending:PendingApproval|null}>('/api/v1/runs/'+selected+'/approval',undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setApproval(data.pending);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar a decisão pendente.');});return()=>controller.abort();},[runs,selected,revision]);
 useEffect(()=>{
  if(!selected)return;const controller=new AbortController();setEvents([]);setError('');setLive(true);
  const observe=async()=>{let cursor=0;
   try{while(!controller.signal.aborted){
    const response=await fetch('/api/v1/runs/'+selected+'/events?cursor='+cursor,{cache:'no-store',signal:controller.signal});
    cursor=await readRunEvents(response,selected,cursor,event=>{if(!controller.signal.aborted)setEvents(previous=>[...previous,event].slice(-1000));});
    if(controller.signal.aborted)return;
    const {run}=await runRequest<{run:RunSummary}>('/api/v1/runs/'+selected,undefined,controller.signal);
    setRuns(previous=>previous.map(item=>item.id===run.id?run:item));
    if(!['QUEUED','RUNNING'].includes(run.state)&&cursor>=run.lastSequence)return;
   }}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Falha ao acompanhar a execu\u00e7\u00e3o.');}
   finally{if(!controller.signal.aborted)setLive(false);}
  };void observe();return()=>controller.abort();
 },[selected,revision,refreshKey]);
 async function resolveApproval(decision:'approve'|'deny'){
  if(!selected||!approval||approvalBusy)return;setApprovalBusy(true);setError('');
  try{await runRequest('/api/v1/runs/'+selected+'/approval',{approvalId:approval.id,actionDigest:approval.actionDigest,nonce:approval.nonce,decision,connection:approval.connection});setApproval(null);setRevision(value=>value+1);}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível resolver a decisão pendente.');}finally{setApprovalBusy(false);}
 }
 async function download(){
  if(!selected||exporting)return;setExporting(true);setError('');
  try{
   const response=await fetch('/api/v1/runs/'+selected+'/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   if(!response.ok){const data=await response.json();throw new Error(data.error||'Exporta\u00e7\u00e3o indispon\u00edvel.');}
   const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');anchor.href=url;anchor.download='run-'+selected+'.json';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setRevision(value=>value+1);
  }catch(e){setError(e instanceof Error?e.message:'N\u00e3o foi poss\u00edvel exportar.');}finally{setExporting(false);}
 }
 const run=runs.find(item=>item.id===selected);
 return <div className="min-h-[430px] p-[22px]">
  <div className="flex flex-wrap items-start justify-between gap-[16px]"><div><h2 className="text-[17px] font-semibold">{'Execu\u00e7\u00e3o rastre\u00e1vel'}</h2><p className="mt-[10px] max-w-[640px] text-[13px] leading-relaxed text-[#727266]">{'O servidor conserva os pedidos e eventos. Fechar esta aba encerra apenas a observa\u00e7\u00e3o, n\u00e3o cancela uma tarefa admitida.'}</p></div><button type="button" onClick={()=>setRevision(value=>value+1)} className="min-h-[44px] rounded-md border border-[#d2d2c8] px-[14px] text-[12px]">{'Atualizar conex\u00e3o'}</button></div>
  {error&&<p role="alert" className="mt-[18px] break-words border-l-2 border-red-700 bg-red-50 p-[14px] text-[13px] text-red-900">{error}</p>}
  {loading&&!runs.length?<p role="status" className="py-[28px] text-[13px]">{'Consultando execu\u00e7\u00f5es\u2026'}</p>:!runs.length?<p className="py-[28px] text-[13px] text-[#727266]">{'Nenhuma execu\u00e7\u00e3o rastre\u00e1vel neste projeto. Pedidos antigos permanecem na conversa e no hist\u00f3rico.'}</p>:<>
   <label htmlFor="run-history" className="mb-[8px] mt-[22px] block text-[12px] font-medium">{'Pedido acompanhado'}</label><select id="run-history" value={selected} onChange={e=>setSelected(e.target.value)} className="min-h-[44px] w-full rounded-md border border-[#d2d2c8] bg-white px-[12px] text-[13px]">{runs.map(item=><option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString('pt-BR')} {'\u00b7'} {item.mode==='plan'?'Plano':'Constru\u00e7\u00e3o'} {'\u00b7'} {states[item.state]||item.state}</option>)}</select>
   <button type="button" disabled={exporting||!selected} onClick={()=>void download()} className="mt-[16px] min-h-[44px] rounded-md border border-[#d2d2c8] px-[14px] text-[12px] disabled:opacity-40">{exporting?'Exportando\u2026':'Baixar registro da execu\u00e7\u00e3o'}</button>
   {run&&<><dl className="my-[22px] grid gap-[16px] border-y border-[#e3e3d9] py-[18px] text-[12px] sm:grid-cols-2"><div><dt className="text-[#77776b]">Estado</dt><dd className="mt-[5px] font-medium">{states[run.state]||run.state}</dd></div><div><dt className="text-[#77776b]">Modelo autorizado</dt><dd className="mt-[5px] break-all font-medium">{run.model}</dd></div><div><dt className="text-[#77776b]">{'Identifica\u00e7\u00e3o do pedido'}</dt><dd className="mt-[5px] break-all font-mono text-[11px]">{run.requestId}</dd></div><div><dt className="text-[#77776b]">{'Uso reportado pelo provedor'}</dt><dd className="mt-[5px]">{typeof run.usage.inputTokens==='number'||typeof run.usage.outputTokens==='number'?`${run.usage.inputTokens??'N/D'} entrada / ${run.usage.outputTokens??'N/D'} sa\u00edda`:'N\u00e3o informado; n\u00e3o significa consumo zero.'}</dd></div></dl>
    {run.state==='QUEUED'&&!run.workerAvailable&&<p role="status" className="mb-[18px] border-l-2 border-amber-600 bg-amber-50 p-[14px] text-[13px]">{'Pedido salvo, mas o executor n\u00e3o est\u00e1 respondendo. Inicie o Studio completo com npm run dev ou npm start. N\u00e3o envie o pedido novamente.'}</p>}
    {run.error&&<p className="mb-[18px] break-words text-[13px] text-red-800">{run.error}</p>}
    {approval&&<section aria-label="Decisão pendente" className="mb-[18px] rounded-md border border-amber-300 bg-amber-50 p-[16px]"><h3 className="text-[13px] font-semibold">Decisão necessária antes de retomar</h3><p className="mt-[7px] text-[12px] leading-relaxed text-[#66583e]">O servidor pausou o run antes do efeito externo. Confirme o contexto abaixo; a decisão está vinculada ao digest e expira em {new Date(approval.expiresAt).toLocaleString('pt-BR')}.</p><dl className="mt-[12px] grid gap-[8px] text-[11px] sm:grid-cols-2"><div><dt className="text-[#77705f]">Tipo</dt><dd className="font-medium">{approval.kind}</dd></div><div><dt className="text-[#77705f]">Provedor</dt><dd className="break-all font-medium">{approval.connection.provider}</dd></div><div><dt className="text-[#77705f]">Endpoint</dt><dd className="break-all font-mono">{approval.connection.endpoint}</dd></div><div><dt className="text-[#77705f]">Credencial configurada</dt><dd className="font-medium">{approval.connection.credentialConfigured?'Sim':'Não'}</dd></div></dl><div className="mt-[14px] flex flex-wrap gap-[8px]"><button type="button" disabled={approvalBusy} onClick={()=>void resolveApproval('approve')} className="min-h-[40px] rounded-md bg-[#272721] px-[14px] text-[12px] font-medium text-white disabled:opacity-40">{approvalBusy?'Processando...':'Aprovar e retomar'}</button><button type="button" disabled={approvalBusy} onClick={()=>void resolveApproval('deny')} className="min-h-[40px] rounded-md border border-[#b7a98b] px-[14px] text-[12px] disabled:opacity-40">Recusar</button></div></section>}
   </>}
   <ol aria-label={'Eventos da execu\u00e7\u00e3o'} className="divide-y divide-[#e3e3d9]">{events.map(event=><li key={event.eventId} className="flex gap-[14px] py-[14px]"><span className="pt-[2px] font-mono text-[11px] text-[#858577]">{String(event.sequence).padStart(2,'0')}</span><div className="min-w-0"><p className="text-[13px] font-medium">{labels[event.type]||event.type}</p><p className="mt-[5px] text-[11px] text-[#77776b]">{new Date(event.occurredAt).toLocaleTimeString('pt-BR')}{typeof event.payload.phase==='string'?' \u00b7 '+(phases[event.payload.phase]||event.payload.phase):''}</p></div></li>)}</ol>
   <p role="status" className="mt-[16px] text-[11px] text-[#77776b]">{live?'Acompanhando eventos do servidor\u2026':'Hist\u00f3rico carregado.'}</p>
  </>}
 </div>;
}
