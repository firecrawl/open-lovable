"use client";
import { useCallback, useEffect, useState } from 'react';
import {scopedProjectURL} from '@/lib/projects/scope-url';
import { appConfig } from '@/config/app.config';
import type { ModelCatalog, ModelOption } from '@/lib/ai/provider-catalog';

const initialOptions = appConfig.ai.availableModels.map(id => ({id,label:appConfig.ai.modelDisplayNames[id] ?? id,configured:false}));
export function useModelCatalog(projectId?:string) {
  const [catalog,setCatalog]=useState<ModelCatalog|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const reload=useCallback(async (signal?:AbortSignal) => {
    setLoading(true);setError('');
    try {
      const response=await fetch(scopedProjectURL('/api/ai-models',projectId),{cache:'no-store',signal});
      if (!response.ok) throw new Error('Não foi possível consultar as conexões de IA.');
      const next = await response.json() as ModelCatalog;
      if (!Array.isArray(next.models) || !next.gateway) throw new Error('Catálogo inválido.');
      if (!signal?.aborted) setCatalog(next);
    } catch (caught) {
      if (!signal?.aborted) {setCatalog(null);setError(caught instanceof Error ? caught.message : 'Falha ao carregar modelos.');}
    } finally {if (!signal?.aborted) setLoading(false);}
  },[projectId]);
  useEffect(() => {const controller=new AbortController();void reload(controller.signal);return () => controller.abort();},[reload]);
  const models: Array<Pick<ModelOption,'id'|'label'|'configured'>> = catalog?.models ?? initialOptions;
  return {catalog,models,loading,error,reload};
}
