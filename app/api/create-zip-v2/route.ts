import { NextResponse } from 'next/server';

declare global {
  var activeSandboxProvider: any;
}

export async function POST() {
  try {
    if (!global.activeSandboxProvider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[create-zip-v2] Creating project zip...');
    
    // Create zip file in sandbox using standard commands
    const zipResult = await global.activeSandboxProvider.runCommand(
      'tar --exclude="node_modules" --exclude=".git" --exclude=".next" --exclude="dist" --exclude="build" --exclude="*.log" -czf /tmp/project.tar.gz .'
    );
    console.log('[create-zip-v2] zipResult', zipResult);
    
    if (zipResult.exitCode !== 0) {
      const error = typeof zipResult.stderr === 'function' 
        ? await zipResult.stderr() 
        : zipResult.stderr || '';
      throw new Error(`Failed to create zip: ${error}`);
    }
    

    const sizeResult = await global.activeSandboxProvider.runCommand(
      'ls -la /tmp/project.tar.gz | awk \'{print $5}\''
    );
    
    const fileSize = typeof sizeResult.stdout === 'function'
      ? await sizeResult.stdout()
      : sizeResult.stdout || '';
    console.log(`[create-zip] Created project.zip (${fileSize.trim()} bytes)`);
    
    // Read the zip file and convert to base64
    const readResult = await global.activeSandboxProvider.runCommand(
      'base64 /tmp/project.tar.gz'
    );
    console.log('[create-zip-v2] readResult', readResult);
    
    if (readResult.exitCode !== 0) {
      const error = typeof readResult.stderr === 'function'
        ? await readResult.stderr()
        : readResult.stderr || '';
      throw new Error(`Failed to read zip file: ${error}`);
    }
    
    const base64Content = typeof readResult.stdout === 'function'
      ? (await readResult.stdout()).trim()
      : (readResult.stdout || '').trim();
    
    // Create a data URL for download
    const dataUrl = `data:application/tar+gz;base64,${base64Content}`;
    
    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'vercel-sandbox-project.tar.gz',
      message: 'Zip file created successfully'
    });
    
  } catch (error) {
    console.error('[create-zip-v2] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}