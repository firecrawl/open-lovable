"use client";
import {useParams} from 'next/navigation';
import ProjectWorkspace from '@/components/projects/ProjectWorkspace';
export default function ProjectPage(){const {id}=useParams<{id:string}>();return <ProjectWorkspace key={id} id={id}/>;}
