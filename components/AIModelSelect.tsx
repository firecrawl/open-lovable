"use client";
import { useModelCatalog } from '@/hooks/useModelCatalog';

interface Props {value:string; onValueChange:(value:string)=>void; className?:string; disabled?:boolean; label?:string;projectId?:string;}
export default function AIModelSelect({value,onValueChange,className,disabled,projectId,label='AI model'}:Props) {
  const {models,loading,error}=useModelCatalog(projectId);
  return <select aria-label={label} aria-busy={loading} value={value} onChange={event=>onValueChange(event.target.value)}
    disabled={disabled || loading} title={error || 'Configured credentials are not a successful model test'}
    className={className ?? 'min-w-0 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900'}>
    {!models.some(model=>model.id===value) && <option value={value} disabled>{value} - unavailable</option>}
    {models.map(model=><option key={model.id} value={model.id}>{model.label}{!loading && !model.configured ? ' - configure' : ''}</option>)}
  </select>;
}
