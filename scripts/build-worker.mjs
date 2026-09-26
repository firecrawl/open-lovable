import {build} from 'esbuild';
// Application-owned worker only. Generated project scripts are never entries in this build.
await build({entryPoints:['workers/agent-worker.ts'],outfile:'.open-lovable-build/agent-worker.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',logLevel:'info'});
