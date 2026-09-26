import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { inspectSandbox } from '@/lib/sandbox/diagnostics';

export async function GET(request: Request) {
  const denied = await authorizeOperatorRequest(request);
  if (denied) return denied;
  const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
  if (!provider) return Response.json({success:true,active:false,healthy:false,sandboxData:null,message:'No active sandbox'}, {headers:{'Cache-Control':'no-store'}});
  try {
    const diagnostics = await inspectSandbox(provider);
    const info = provider.getSandboxInfo();
    return Response.json({success:diagnostics.status !== 'unavailable',active:true,healthy:diagnostics.success,
      sandboxData:{sandboxId:info?.sandboxId,url:info?.url,filesTracked:Array.from(global.existingFiles || []),lastHealthCheck:diagnostics.checkedAt},
      diagnostics, message:diagnostics.success ? 'Sandbox HTTP endpoint is responding; browser rendering is not verified' : 'Sandbox requires attention',
    }, {headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({success:false,active:true,healthy:false,message:'Sandbox health could not be verified'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
