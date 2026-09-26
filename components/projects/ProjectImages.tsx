"use client";
import {useRef,useState} from 'react';
import Image from 'next/image';
import type {ReferenceImage} from '@/lib/projects/images';
import {referenceImageURL} from '@/hooks/useProjectImages';
interface Props {id:string;images:ReferenceImage[];selected:string[];onSelection:(ids:string[])=>void;reload:()=>Promise<void>;locked:boolean;loading:boolean;loadError:string;}
export default function ProjectImages({id,images,selected,onSelection,reload,locked,loading,loadError}:Props){
 const [role,setRole]=useState<'target'|'current'>('target'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const lock=useRef(false);
 async function upload(file?:File){
  if(!file||locked||lock.current)return;setError('');setNotice('');
  if(file.size>5*1024*1024){setError('A imagem deve ter até 5 MiB.');return;}
  lock.current=true;setBusy(true);
  try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Falha ao ler a imagem.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
   const response=await fetch('/api/project-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upload',projectID:id,name:file.name,role,data})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Falha ao salvar imagem.');await reload();setNotice('Imagem salva. Selecione-a para incluir em uma solicitação.');
  }catch(caught){setError(caught instanceof Error?caught.message:'Falha ao salvar imagem.');}finally{lock.current=false;setBusy(false);}
 }
 async function archive(image:ReferenceImage){if(locked||lock.current)return;if(!window.confirm('Arquivar esta referência? Ela permanece preservada para execuções anteriores.'))return;lock.current=true;setBusy(true);setError('');
  try{const response=await fetch('/api/project-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'archive',projectID:id,imageID:image.id})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Falha ao arquivar.');onSelection(selected.filter(key=>key!==image.id));await reload();setNotice('Referência arquivada; o histórico foi preservado.');}
  catch(caught){setError(caught instanceof Error?caught.message:'Falha ao arquivar.');}finally{lock.current=false;setBusy(false);}
 }
 function choose(image:ReferenceImage,checked:boolean){if(checked&&selected.length>=4){setError('Selecione no máximo quatro imagens por solicitação.');return;}setError('');onSelection(checked?[...selected,image.id]:selected.filter(key=>key!==image.id));}
 return <div className="min-h-[430px] p-[22px]">
  <h2 className="text-[17px] font-semibold">Imagens de referência</h2><p className="mb-[18px] mt-[10px] max-w-[690px] text-[13px] leading-relaxed text-[#727266]">Envie um layout desejado ou uma captura do resultado atual. Revise a imagem antes: textos, rostos e segredos visíveis podem ser enviados ao provedor quando você autorizar a solicitação. Use apenas imagens que você tem permissão de utilizar.</p>
  <div className="flex flex-wrap items-end gap-[12px]"><div className="min-w-0"><label htmlFor="image-role" className="mb-[6px] block text-[12px]">Papel da imagem</label><select id="image-role" value={role} onChange={event=>setRole(event.target.value as 'target'|'current')} disabled={locked||busy} className="max-w-full rounded-md border border-[#d2d2c8] p-[10px] text-[13px]"><option value="target">Layout desejado</option><option value="current">Captura do resultado atual</option></select></div>
  <label className="cursor-pointer rounded-md border border-[#d2d2c8] px-[14px] py-[11px] text-[13px]">{busy?'Processando imagem...':'Adicionar imagem'}<input className="sr-only" type="file" aria-label="Enviar imagem de referência" accept="image/png,image/jpeg,image/webp" disabled={locked||busy} onChange={event=>{void upload(event.target.files?.[0]);event.currentTarget.value='';}}/></label></div>
  <p className="mt-[10px] text-[11px] text-[#77776b]">PNG, JPEG ou WebP. Até 5 MiB na entrada; dimensões e metadados são normalizados. Nenhuma chamada de IA ocorre no upload.</p>
  {(error||loadError)&&<p role="alert" className="mt-[16px] rounded-md bg-red-50 p-[12px] text-[13px] text-red-800">{error||loadError}</p>}
  {notice&&<p role="status" className="mt-[16px] text-[13px] text-[#455638]">{notice}</p>}
  {loading&&<p role="status" className="mt-[20px] text-[13px]">Carregando referências...</p>}
  <div className="mt-[24px] grid gap-[20px] md:grid-cols-2">{images.map(image=><article key={image.id} className="min-w-0 overflow-hidden rounded-md border border-[#deded5]">
   <div className="flex h-[200px] items-center justify-center bg-[#f2f2ed] p-[10px]"><Image unoptimized src={referenceImageURL(id,image.id)} alt={image.name} width={image.width} height={image.height} className="max-h-full w-auto max-w-full object-contain"/></div>
   <div className="p-[14px]"><p className="break-all text-[13px] font-medium">{image.name}</p><p className="mt-[5px] text-[11px] text-[#77776b]">{image.role==='target'?'Layout desejado':'Resultado atual'} × {image.width} × {image.height}</p>
   <label className="mt-[12px] flex items-start gap-[8px] text-[12px]"><input type="checkbox" aria-label={'Usar '+image.name+' nesta solicitação'} checked={selected.includes(image.id)} disabled={locked||busy} onChange={event=>choose(image,event.target.checked)}/>Incluir nesta solicitação</label>
   <button type="button" disabled={locked||busy} onClick={()=>void archive(image)} className="mt-[12px] text-[11px] text-[#77776b] underline">Arquivar referência</button></div>
  </article>)}</div>
  {!loading&&!images.length&&<p className="mt-[28px] text-[13px] text-[#77776b]">Nenhuma imagem adicionada. O modo por texto continua disponível.</p>}
 </div>;
}
