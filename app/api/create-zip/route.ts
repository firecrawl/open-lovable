import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { quoteShellArgument } from '@/lib/security/input-validation';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { createExportScript, zipExportManifest } from '@/lib/sandbox/project-export';
import { readCommandResult } from '@/lib/sandbox/command-result';

export async function POST(request: Request) {
  const denied = await authorizeOperatorRequest(request);
  if (denied) return denied;
  const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
  if (!provider && !global.activeSandbox) return Response.json({success:false,error:'No active sandbox'},{status:409});
  try {
    const root = provider?.getSandboxInfo()?.provider === 'e2b' ? '/home/user/app' : '/vercel/sandbox';
    const script = createExportScript(root);
    const result = provider
      ? await provider.runCommand(`node --input-type=module -e ${quoteShellArgument(script)}`)
      : await readCommandResult(await global.activeSandbox.runCommand({cmd:'node',args:['--input-type=module','-e',script],cwd:root}));
    if (!result.success || result.exitCode !== 0) throw new Error('Export command failed; check project limits and sandbox availability');
    const archive = zipExportManifest(result.stdout);
    const fileName = 'open-lovable-project.zip';
    if (request.headers.get('accept')?.includes('application/zip')) {
      return new Response(new Uint8Array(archive.bytes),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${fileName}"`,'Cache-Control':'no-store'}});
    }
    // Preserve the existing UI contract while limiting memory and export size.
    return Response.json({success:true,dataUrl:`data:application/zip;base64,${Buffer.from(archive.bytes).toString('base64')}`,fileName,excludedCount:archive.excludedCount,
      message:'Project exported. Environment/credential files and symbolic links were excluded.'},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[create-zip] Export failed:',error instanceof Error ? error.message : 'Unknown error');
    return Response.json({success:false,error:'Could not export this project. Check sandbox availability and export limits (500 files, 2 MiB per file, 8 MiB total).'}, {status:502,headers:{'Cache-Control':'no-store'}});
  }
}
