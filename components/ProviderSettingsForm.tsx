"use client";
import {scopedProjectURL} from '@/lib/projects/scope-url';
import { useCallback, useEffect, useRef, useState } from 'react';

type Provider='gateway'|'openai'|'anthropic'|'google'|'groq';
type Row={provider:Provider;version:number;enabled:boolean;credentialConfigured:boolean;source:'environment'|'saved'|'unconfigured';baseURL?:string;models:string[]};
const names:Record<Provider,string>={gateway:'Ollama / Classe A+',openai:'OpenAI',anthropic:'Anthropic',google:'Google Gemini',groq:'Groq'};

/** Secret inputs are transient component state and are cleared after save or provider change. */
export default function ProviderSettingsForm({onSaved}:{onSaved:()=>void}) {
 const [rows,setRows]=useState<Row[]>([]);const [provider,setProvider]=useState<Provider>('gateway');
 const [key,setKey]=useState('');const [url,setURL]=useState('');const [models,setModels]=useState('');
 const [enabled,setEnabled]=useState(true);const [clearKey,setClearKey]=useState(false);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 const saving=useRef<AbortController|null>(null);
 const row=rows.find(item=>item.provider===provider);const managed=row?.source==='environment';
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try {
   const response=await fetch(scopedProjectURL('/api/provider-settings'),{cache:'no-store',signal});const data=await response.json();
   if(!response.ok||!Array.isArray(data.providers))throw new Error(data.error||'Falha ao carregar as conexões.');
   if(!signal?.aborted)setRows(data.providers);
  }catch(caught){if(!signal?.aborted)setError(caught instanceof Error?caught.message:'Falha ao carregar as conexões.');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>{controller.abort();saving.current?.abort();};},[load]);
 useEffect(()=>{setKey('');setClearKey(false);setURL(row?.baseURL||'');setModels((row?.models||[]).join('\n'));setEnabled(row?.source==='unconfigured'?true:row?.enabled??true);},[row]);
 async function save(event:React.FormEvent) {
  event.preventDefault();if(busy||loading||managed||!row)return;
  const controller=new AbortController();saving.current=controller;setBusy(true);setError('');setMessage('');
  try {
   const response=await fetch(scopedProjectURL('/api/provider-settings'),{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,version:row.version,enabled,baseURL:url,apiKey:key,clearKey,models:models.split('\n').map(id=>id.trim()).filter(Boolean)})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possivel salvar.');
   if(controller.signal.aborted)return;
   setKey('');setClearKey(false);await load(controller.signal);setMessage('Conexão salva com criptografia no servidor. Teste o modelo antes de usá-lo.');onSaved();
  }catch(caught){if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:'Falha ao salvar.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const field='w-full min-w-0 rounded-md border border-[#cfcfc8] bg-white px-[12px] py-[11px] text-[14px] disabled:bg-[#f5f5f2]';
 return <section aria-labelledby="connection-editor-title" className="mb-[24px] rounded-lg border border-[#deded9] bg-white p-[24px]">
  <div className="mb-[20px] max-w-[760px]"><h2 id="connection-editor-title" className="mb-[8px] text-[19px] font-semibold">Cadastrar e editar conexões</h2><p className="text-[14px] leading-relaxed text-[#65655e]">As chaves ficam cifradas no servidor. Elas não sao devolvidas ao navegador nem salvas no código do projeto. Uma conexão salva ainda precisa passar pelo teste abaixo.</p></div>
  <form onSubmit={save} className="grid gap-[18px] md:grid-cols-2">
   <div><label htmlFor="connection-provider" className="mb-[6px] block text-[13px] font-medium">Provedor da conexão</label><select id="connection-provider" className={field} value={provider} onChange={event=>{setProvider(event.target.value as Provider);setMessage('');setError('');}} disabled={loading||busy}>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
   <div><label htmlFor="connection-url" className="mb-[6px] block text-[13px] font-medium">Endpoint da API</label><input id="connection-url" type="url" className={field} value={url} onChange={event=>setURL(event.target.value)} disabled={loading||busy||managed} autoComplete="off" spellCheck={false}/></div>
   <div><label htmlFor="connection-key" className="mb-[6px] block text-[13px] font-medium">Chave de API</label><input id="connection-key" type="password" className={field} value={key} onChange={event=>setKey(event.target.value)} disabled={loading||busy||managed} autoComplete="new-password" spellCheck={false} maxLength={8192}/><p className="mt-[6px] text-[12px] text-[#65655e]">{row?.credentialConfigured?'Chave armazenada; o valor nunca é devolvido.':'Nenhuma chave armazenada para esta conexão.'} Deixe vazio para manter a chave existente no mesmo endpoint.</p></div>
   <p className="md:col-span-2 text-[13px] leading-relaxed text-[#65655e]">Ao mudar o endpoint, informe a chave para o novo destino ou marque a limpeza da chave armazenada.</p>
   <div><label htmlFor="connection-models" className="mb-[6px] block text-[13px] font-medium">IDs dos modelos</label><textarea id="connection-models" className={field+' min-h-[92px] font-mono text-[12px]'} value={models} onChange={event=>setModels(event.target.value)} disabled={loading||busy||managed} spellCheck={false}/><p className="mt-[6px] text-[12px] text-[#65655e]">Um ID exato por linha. No Ollama, vazio consulta o catálogo do servidor.</p></div>
   <div className="flex flex-col gap-[12px] text-[13px]"><label className="flex items-center gap-[8px]"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)} disabled={loading||busy||managed}/>Conexão habilitada</label><label className="flex items-center gap-[8px]"><input type="checkbox" checked={clearKey} onChange={event=>setClearKey(event.target.checked)} disabled={loading||busy||managed}/>Limpar chave armazenada</label></div>
   <div className="flex items-end justify-end"><button type="submit" className="rounded-md bg-[#252520] px-[22px] py-[12px] text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={loading||busy||managed||!row}>{busy?'Salvando...':'Salvar conexão'}</button></div>
   {managed&&<p className="md:col-span-2 rounded-md bg-[#f5f5f2] p-[14px] text-[13px]">Esta conexão é controlada por variáveis de ambiente. O formulário não substitui uma configuração de implantação existente.</p>}
   {error&&<p role="alert" className="md:col-span-2 rounded-md border border-red-200 bg-red-50 p-[14px] text-[13px] text-red-800">{error}</p>}
   {message&&<p role="status" className="md:col-span-2 rounded-md border border-green-200 bg-green-50 p-[14px] text-[13px] text-green-900">{message}</p>}
  </form>
 </section>;
}
