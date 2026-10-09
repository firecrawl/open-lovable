export interface BuildValidation {
  success: boolean;
  errors: string[];
  isRendering: boolean;
  warnings?: string[];
}

/**
 * Validates that the sandbox build was successful
 * Checks compilation status and verifies app is rendering
 */
export async function validateBuild(sandboxUrl: string, sandboxId: string): Promise<BuildValidation> {
  try {
    // Step 1: Wait for Vite to process files (give it time to compile)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Check if the sandbox is actually serving content
    const response = await fetch(sandboxUrl, {
      headers: {
        'User-Agent': 'MianAI-Validator',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        errors: [`Sandbox returned ${response.status}`],
        isRendering: false
      };
    }

    const html = await response.text();

    // Step 3: Check if it's the default page or actual app
    const isDefaultPage =
      html.includes('Vercel Sandbox Ready') ||
      html.includes('Start building your React app with Vite') ||
      html.includes('Vite + React') ||
      !html.includes('id="root"');

    if (isDefaultPage) {
      return {
        success: false,
        errors: ['Sandbox showing default page, app not rendered'],
        isRendering: false
      };
    }

    // Step 4: Check for Vite error overlay in HTML
    const hasViteError = html.includes('vite-error-overlay');
    if (hasViteError) {
      // Try to extract error message
      const errorMatch = html.match(/Failed to resolve import "([^"]+)"/);
      const error = errorMatch
        ? `Missing package: ${errorMatch[1]}`
        : 'Vite compilation error detected';

      return {
        success: false,
        errors: [error],
        isRendering: false
      };
    }

    // Success! App is rendering
    return {
      success: true,
      errors: [],
      isRendering: true
    };

  } catch (error) {
    console.error('[validateBuild] Error during validation:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Validation failed'],
      isRendering: false
    };
  }
}

/**
 * Extracts missing package names from error messages
 */
export function extractMissingPackages(error: any): string[] {
  const message = error?.message || String(error);
  const packages: string[] = [];

  // Pattern 1: "Failed to resolve import 'package-name'"
  const importMatches = message.matchAll(/Failed to resolve import ["']([^"']+)["']/g);
  for (const match of importMatches) {
    packages.push(match[1]);
  }

  // Pattern 2: "Cannot find module 'package-name'"
  const moduleMatches = message.matchAll(/Cannot find module ["']([^"']+)["']/g);
  for (const match of moduleMatches) {
    packages.push(match[1]);
  }

  // Pattern 3: "Package 'package-name' not found"
  const packageMatches = message.matchAll(/Package ["']([^"']+)["'] not found/g);
  for (const match of packageMatches) {
    packages.push(match[1]);
  }

  return [...new Set(packages)]; // Remove duplicates
}

/**
 * Classifies error type for targeted recovery
 */
export type ErrorType = 'missing-package' | 'syntax-error' | 'sandbox-timeout' | 'not-rendered' | 'vite-error' | 'unknown';

export function classifyError(error: any): ErrorType {
  const message = (error?.message || String(error)).toLowerCase();

  if (message.includes('failed to resolve import') ||
      message.includes('cannot find module') ||
      message.includes('missing package')) {
    return 'missing-package';
  }

  if (message.includes('syntax error') ||
      message.includes('unexpected token') ||
      message.includes('parsing error')) {
    return 'syntax-error';
  }

  if (message.includes('timeout') ||
      message.includes('not responding') ||
      message.includes('timed out')) {
    return 'sandbox-timeout';
  }

  if (message.includes('not rendered') ||
      message.includes('sandbox ready') ||
      message.includes('default page')) {
    return 'not-rendered';
  }

  if (message.includes('vite') ||
      message.includes('compilation')) {
    return 'vite-error';
  }

  return 'unknown';
}

/**
 * Calculates retry delay based on attempt number and error type
 */
export function calculateRetryDelay(attempt: number, errorType: ErrorType): number {
  const baseDelay = 2000; // 2 seconds

  // Different strategies for different errors
  switch (errorType) {
    case 'missing-package':
      // Packages need time to install
      return baseDelay * 2 * attempt; // 4s, 8s, 12s

    case 'not-rendered':
      // Vite needs time to compile
      return baseDelay * 3 * attempt; // 6s, 12s, 18s

    case 'vite-error':
      // Vite restart needed
      return baseDelay * 2 * attempt;

    case 'sandbox-timeout':
      // Sandbox might be slow
      return baseDelay * 4 * attempt; // 8s, 16s, 24s

    default:
      // Standard exponential backoff
      return baseDelay * attempt;
  }
}
