import { readJsonObject, ClientInputError } from '@/lib/security/input-validation';
import { safeLogger as logger } from '@/lib/security/secret-content';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(req);
  if (accessDenied) return accessDenied;
  try {
    const { query } = await readJsonObject(req);
    
    if (typeof query !== 'string' || !query.trim() || query.length > 4096) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if(!process.env.FIRECRAWL_API_KEY) return NextResponse.json({error:'Firecrawl API key not configured'},{status:503});
    // Use Firecrawl search to get top 10 results with screenshots
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        limit: 10,
        scrapeOptions: {
          formats: ['markdown', 'screenshot'],
          onlyMainContent: true,
        },
      }),
    });

    if (!searchResponse.ok) {
      throw new Error('Search failed');
    }

    const searchData = await searchResponse.json();
    
    // Format results with screenshots and markdown
    const results = searchData.data?.map((result: any) => ({
      url: result.url,
      title: result.title || result.url,
      description: result.description || '',
      screenshot: result.screenshot || null,
      markdown: result.markdown || '',
    })) || [];

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ClientInputError) return NextResponse.json({error:error.message},{status:400});
    logger.error('Search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}