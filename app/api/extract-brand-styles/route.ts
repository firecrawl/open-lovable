import { ClientInputError, publicErrorMessage, readJsonObject, requireHttpUrl } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const body = await readJsonObject(request);
    const url = requireHttpUrl(body.url);
    const prompt = body.prompt;

    console.log('[extract-brand-styles] Extracting brand styles for:', url);
    console.log('[extract-brand-styles] Prompt characters:', typeof prompt==='string'?prompt.length:0);

    // Call Firecrawl API to extract branding information
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

    if (!FIRECRAWL_API_KEY) {
      console.error('[extract-brand-styles] No Firecrawl API key found');
      throw new Error('Firecrawl API key not configured');
    }

    console.log('[extract-brand-styles] Calling Firecrawl branding API for:', url);

    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ['branding'],
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error('[extract-brand-styles] Firecrawl API error:', firecrawlResponse.status, errorText);
      throw new Error(`Firecrawl API returned ${firecrawlResponse.status}`);
    }

    const firecrawlData = await firecrawlResponse.json();
    console.log('[extract-brand-styles] Firecrawl response received successfully');

    // Extract branding data from response
    const brandingData = firecrawlData.data?.branding || firecrawlData.branding;

    if (!brandingData) {
      console.error('[extract-brand-styles] No branding data in Firecrawl response');
      console.log('[extract-brand-styles] Response structure:', JSON.stringify(firecrawlData, null, 2));
      throw new Error('No branding data in Firecrawl response');
    }

    console.log('[extract-brand-styles] Successfully extracted branding data');

    // Return the branding data
    return NextResponse.json({
      success: true,
      url,
      styleName: brandingData.name || url,
      guidelines: brandingData,
    });

  } catch (error) {
    console.error('[extract-brand-styles] Error occurred:', error);
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, 'Failed to extract brand styles')
      },
      { status: error instanceof ClientInputError ? 400 : 500 }
    );
  }
}
