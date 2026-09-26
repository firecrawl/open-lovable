"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReferenceImage} from '@/lib/projects/images';
export function referenceImageURL(projectID:string,imageID:string){return '/api/project-images?'+new URLSearchParams({projectID,imageID});}
export function useProjectImages(projectID:string){
 const [images,setImages]=useState<ReferenceImage[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const sequence=useRef(0);
 const reload=useCallback(async(signal?:AbortSignal)=>{const current=++sequence.current;setLoading(true);setError('');
  try{const response=await fetch('/api/project-images?'+new URLSearchParams({projectID}),{cache:'no-store',signal});const data=await response.json();if(!response.ok||!Array.isArray(data.images))throw new Error(data.error||'Falha ao carregar imagens.');if(!signal?.aborted&&current===sequence.current)setImages(data.images);}
  catch(caught){if(!signal?.aborted&&current===sequence.current)setError(caught instanceof Error?caught.message:'Falha ao carregar imagens.');}
  finally{if(!signal?.aborted&&current===sequence.current)setLoading(false);}
 },[projectID]);
 useEffect(()=>{const controller=new AbortController();void reload(controller.signal);return()=>controller.abort();},[reload]);
 return {images,loading,error,reload};
}
