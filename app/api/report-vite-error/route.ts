import { ClientInputError, readJsonObject } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

declare global {
  var viteErrors: any[];
}

// Initialize global viteErrors array if it doesn't exist
if (!global.viteErrors) {
  global.viteErrors = [];
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const { error, file, type = 'runtime-error' } = await readJsonObject(request);
    
    if (typeof error !== 'string' || !error || error.length > 16_384) {
      return NextResponse.json({ 
        success: false, 
        error: 'Error message must be a nonempty string of at most 16384 characters' 
      }, { status: 400 });
    }
    
    // Parse the error to extract useful information
    const errorObj: any = {
      type: typeof type === 'string' ? type.slice(0, 64) : 'runtime-error',
      message: error,
      file: typeof file === 'string' && file ? file.slice(0, 512) : 'unknown',
      timestamp: new Date().toISOString()
    };
    
    // Extract import information if it's an import error
    const importMatch = error.match(/Failed to resolve import ['"]([^'"]+)['"] from ['"]([^'"]+)['"]/);
    if (importMatch) {
      errorObj.type = 'import-error';
      errorObj.import = importMatch[1];
      errorObj.file = importMatch[2];
    }
    
    // Add to global errors array
    global.viteErrors.push(errorObj);
    
    // Keep only last 50 errors
    if (global.viteErrors.length > 50) {
      global.viteErrors = global.viteErrors.slice(-50);
    }
    
    console.log('[report-vite-error] Error reported:', errorObj);
    
    return NextResponse.json({
      success: true,
      message: 'Error reported successfully',
      error: errorObj
    });
    
  } catch (error) {
    console.error('[report-vite-error] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof ClientInputError ? error.message : 'Failed to record error'
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}