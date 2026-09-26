import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { inspectSandbox, unavailableDiagnostics } from '@/lib/sandbox/diagnostics';

export async function GET(request: Request) {
  const denied = await authorizeOperatorRequest(request);
  if (denied) return denied;
  const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
  if (!provider) return Response.json(unavailableDiagnostics('No active sandbox'), {status:409, headers:{'Cache-Control':'no-store'}});
  try {
    const diagnostics = await inspectSandbox(provider);
    return Response.json(diagnostics, {status:diagnostics.status === 'unavailable' ? 503 : 200, headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json(unavailableDiagnostics('Sandbox diagnostic connection failed'), {status:503, headers:{'Cache-Control':'no-store'}});
  }
}
