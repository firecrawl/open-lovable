import { NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function POST() {
  try {
    // Check both V2 provider (new) and V1 sandbox (legacy) patterns
    const provider = global.activeSandboxProvider;
    const sandbox = global.activeSandbox;

    if (!provider && !sandbox) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 400 });
    }

    console.log('[create-zip] Creating project zip...');

    // Detect provider type
    const isE2B = provider && provider.constructor.name === 'E2BProvider';
    const isVercel = provider && provider.constructor.name === 'VercelProvider';
    const isV1Sandbox = !provider && sandbox;

    console.log('[create-zip] Provider type:', { isE2B, isVercel, isV1Sandbox });

    if (isE2B && provider.sandbox) {
      // E2B Provider - use Python code execution to avoid command parsing issues
      try {
        console.log('[create-zip] Using E2B Python-based zip creation');

        // Create zip using Python's zipfile module
        const zipCreationResult = await provider.sandbox.runCode(`
import zipfile
import os
import base64
from pathlib import Path

# Change to app directory
os.chdir('/home/user/app')

# Create zip file
zip_path = '/tmp/project.zip'
exclude_patterns = ['node_modules', '.git', '.next', 'dist', 'build', '*.log', '__pycache__', '*.pyc']

def should_exclude(path):
    path_str = str(path)
    for pattern in exclude_patterns:
        if pattern in path_str:
            return True
        if pattern.startswith('*') and path_str.endswith(pattern[1:]):
            return True
    return False

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk('.'):
        # Filter out excluded directories
        dirs[:] = [d for d in dirs if not should_exclude(d)]

        for file in files:
            file_path = os.path.join(root, file)
            if not should_exclude(file_path):
                # Add file to zip with relative path
                arcname = os.path.relpath(file_path, '.')
                zipf.write(file_path, arcname)

# Get file size
file_size = os.path.getsize(zip_path)
print(f"ZIP_SIZE:{file_size}")

# Read and encode to base64
with open(zip_path, 'rb') as f:
    zip_content = f.read()
    base64_content = base64.b64encode(zip_content).decode('utf-8')
    print(f"BASE64_START:{base64_content}:BASE64_END")
        `);

        // Parse the output to extract base64 content
        const output = zipCreationResult.logs.stdout.join('\n');

        // Extract file size
        const sizeMatch = output.match(/ZIP_SIZE:(\d+)/);
        const fileSize = sizeMatch ? sizeMatch[1] : 'unknown';
        console.log(`[create-zip] Created project.zip (${fileSize} bytes)`);

        // Extract base64 content (using [\s\S] instead of 's' flag for compatibility)
        const base64Match = output.match(/BASE64_START:([\s\S]*?):BASE64_END/);
        if (!base64Match) {
          throw new Error('Failed to extract base64 content from Python output');
        }

        const base64Content = base64Match[1].trim();

        // Create a data URL for download
        const dataUrl = `data:application/zip;base64,${base64Content}`;

        return NextResponse.json({
          success: true,
          dataUrl,
          fileName: 'e2b-sandbox-project.zip',
          message: 'Zip file created successfully'
        });

      } catch (error) {
        console.error('[create-zip] E2B Provider error:', error);
        throw error;
      }

    } else if (isVercel && provider) {
      // Vercel Provider - use correct working directory
      try {
        console.log('[create-zip] Using Vercel Provider with /vercel/sandbox path');

        // Install zip utility using dnf package manager with sudo
        console.log('[create-zip] Installing zip utility...');
        const installResult = await provider.sandbox.runCommand({
          cmd: 'dnf',
          args: ['install', '-y', 'zip'],
          sudo: true
        });

        // Create zip file
        const zipResult = await provider.sandbox.runCommand({
          cmd: 'zip',
          args: ['-r', '/tmp/project.zip', '.', '-x', 'node_modules/*', '.git/*', '.next/*', 'dist/*', 'build/*', '*.log'],
          cwd: '/vercel/sandbox'
        });

        // Handle stdout and stderr - they might be functions in Vercel SDK
        let stderr = '';
        try {
          if (typeof zipResult.stderr === 'function') {
            stderr = await zipResult.stderr();
          } else {
            stderr = zipResult.stderr || '';
          }
        } catch (e) {
          stderr = '';
        }

        if (zipResult.exitCode !== 0) {
          throw new Error(`Failed to create zip: ${stderr}`);
        }

        const sizeResult = await provider.sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', 'ls -la /tmp/project.zip | awk \'{print $5}\'']
        });

        let fileSize = '';
        try {
          if (typeof sizeResult.stdout === 'function') {
            fileSize = (await sizeResult.stdout()).trim();
          } else {
            fileSize = (sizeResult.stdout || '').trim();
          }
        } catch (e) {
          fileSize = 'unknown';
        }
        console.log(`[create-zip] Created project.zip (${fileSize} bytes)`);

        // Read the zip file and convert to base64
        const readResult = await provider.sandbox.runCommand({
          cmd: 'base64',
          args: ['/tmp/project.zip']
        });

        let readStderr = '';
        try {
          if (typeof readResult.stderr === 'function') {
            readStderr = await readResult.stderr();
          } else {
            readStderr = readResult.stderr || '';
          }
        } catch (e) {
          readStderr = '';
        }

        if (readResult.exitCode !== 0) {
          throw new Error(`Failed to read zip file: ${readStderr}`);
        }

        let base64Content = '';
        try {
          if (typeof readResult.stdout === 'function') {
            base64Content = (await readResult.stdout()).trim();
          } else {
            base64Content = (readResult.stdout || '').trim();
          }
        } catch (e) {
          throw new Error('Failed to get base64 content from command result');
        }

        // Create a data URL for download
        const dataUrl = `data:application/zip;base64,${base64Content}`;

        return NextResponse.json({
          success: true,
          dataUrl,
          fileName: 'vercel-sandbox-project.zip',
          message: 'Zip file created successfully'
        });

      } catch (error) {
        console.error('[create-zip] Vercel Provider error:', error);
        throw error;
      }

    } else if (isV1Sandbox) {
      // V1 Sandbox pattern - uses object with cmd/args (legacy)
      try {
        const zipResult = await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `zip -r /tmp/project.zip . -x "node_modules/*" ".git/*" ".next/*" "dist/*" "build/*" "*.log"`]
        });

        // Handle potential function-based stdout/stderr (Vercel SDK pattern)
        const exitCode = zipResult.exitCode;
        let stderr = '';

        if (typeof zipResult.stderr === 'function') {
          stderr = await zipResult.stderr();
        } else {
          stderr = zipResult.stderr || '';
        }

        if (exitCode !== 0) {
          throw new Error(`Failed to create zip: ${stderr}`);
        }

        const sizeResult = await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `ls -la /tmp/project.zip | awk '{print $5}'`]
        });

        let fileSize = '';
        if (typeof sizeResult.stdout === 'function') {
          fileSize = await sizeResult.stdout();
        } else {
          fileSize = sizeResult.stdout || '';
        }
        console.log(`[create-zip] Created project.zip (${fileSize.trim()} bytes)`);

        // Read the zip file and convert to base64
        const readResult = await sandbox.runCommand({
          cmd: 'base64',
          args: ['/tmp/project.zip']
        });

        if (readResult.exitCode !== 0) {
          let error = '';
          if (typeof readResult.stderr === 'function') {
            error = await readResult.stderr();
          } else {
            error = readResult.stderr || 'Unknown error';
          }
          throw new Error(`Failed to read zip file: ${error}`);
        }

        let base64Content = '';
        if (typeof readResult.stdout === 'function') {
          base64Content = (await readResult.stdout()).trim();
        } else {
          base64Content = (readResult.stdout || '').trim();
        }

        // Create a data URL for download
        const dataUrl = `data:application/zip;base64,${base64Content}`;

        return NextResponse.json({
          success: true,
          dataUrl,
          fileName: 'vercel-sandbox-project.zip',
          message: 'Zip file created successfully'
        });

      } catch (error) {
        console.error('[create-zip] V1 Sandbox error:', error);
        throw error;
      }
    }

  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}