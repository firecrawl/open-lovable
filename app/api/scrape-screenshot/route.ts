import { readJsonObject, ClientInputError } from '@/lib/security/input-validation';
import { safeLogger as logger } from '@/lib/security/secret-content';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';

export async function POST(req: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(req);
  if (accessDenied) return accessDenied;
  try {
    const { url } = await readJsonObject(req);
    
    if (typeof url !== 'string' || !url.trim() || url.length > 8192) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Initialize Firecrawl with API key from environment
    const apiKey = process.env.FIRECRAWL_API_KEY;
    
    if (!apiKey) {
      logger.error("FIRECRAWL_API_KEY not configured");
      return NextResponse.json({ 
        error: 'Firecrawl API key not configured' 
      }, { status: 500 });
    }
    
    const app = new FirecrawlApp({ apiKey });

    logger.log('[scrape-screenshot] Attempting to capture screenshot for:', url);
    logger.log('[scrape-screenshot] Using Firecrawl API key:', apiKey ? 'Present' : 'Missing');

    // Use the new v4 scrape method (not scrapeUrl)
    const scrapeResult = await app.scrape(url, {
      formats: ['screenshot'], // Request screenshot format
      waitFor: 3000, // Wait for page to fully load
      timeout: 30000,
      onlyMainContent: false, // Get full page for screenshot
      actions: [
        {
          type: 'wait',
          milliseconds: 2000 // Additional wait for dynamic content
        }
      ]
    });

    logger.log('[scrape-screenshot] Full scrape result:', JSON.stringify(scrapeResult, null, 2));
    logger.log('[scrape-screenshot] Scrape result type:', typeof scrapeResult);
    logger.log('[scrape-screenshot] Scrape result keys:', Object.keys(scrapeResult));
    
    // The Firecrawl v4 API might return data directly without a success flag
    // Check if we have data with screenshot
    if (scrapeResult && scrapeResult.screenshot) {
      // Direct screenshot response
      return NextResponse.json({
        success: true,
        screenshot: scrapeResult.screenshot,
        metadata: scrapeResult.metadata || {}
      });
    } else if ((scrapeResult as any)?.data?.screenshot) {
      // Nested data structure
      return NextResponse.json({
        success: true,
        screenshot: (scrapeResult as any).data.screenshot,
        metadata: (scrapeResult as any).data.metadata || {}
      });
    } else if ((scrapeResult as any)?.success === false) {
      // Explicit failure
      logger.error('[scrape-screenshot] Firecrawl API error:', (scrapeResult as any).error);
      throw new Error((scrapeResult as any).error || 'Failed to capture screenshot');
    } else {
      // No screenshot in response
      logger.error('[scrape-screenshot] No screenshot in response. Full response:', JSON.stringify(scrapeResult, null, 2));
      throw new Error('Screenshot not available in response - check console for full response structure');
    }

  } catch (error: any) {
    if (error instanceof ClientInputError) return NextResponse.json({error:error.message},{status:400});
    logger.error('[scrape-screenshot] Screenshot capture error:', error);
    logger.error('[scrape-screenshot] Error stack:', error.stack);
    
    // Provide fallback response for development - removed NODE_ENV check as it doesn't work in Next.js production builds
    
    return NextResponse.json({ 
      error: error.message || 'Failed to capture screenshot'
    }, { status: 500 });
  }
}