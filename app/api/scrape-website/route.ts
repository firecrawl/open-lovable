import { ClientInputError, publicErrorMessage, readJsonObject, requireHttpUrl } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from "next/server";
import FirecrawlApp from '@mendable/firecrawl-js';

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const body = await readJsonObject(request);
    
    if (!body.url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }
    
    const url = requireHttpUrl(body.url);
    // Only cheap, read-only scrape options are client controlled; actions,
    // proxies, extraction and timeouts stay server defined.
    const allowedFormats = new Set(['markdown', 'html', 'screenshot', 'links']);
    const formats: Array<'markdown' | 'html' | 'screenshot' | 'links'> = Array.isArray(body.formats)
      ? body.formats.filter((format: unknown): format is 'markdown' | 'html' | 'screenshot' | 'links' => typeof format === 'string' && allowedFormats.has(format))
      : ['markdown', 'html'];
    if (formats.length === 0) throw new ClientInputError('At least one supported format is required');
    const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options : {};
    const waitFor = Number.isInteger(options.waitFor) && options.waitFor >= 0 && options.waitFor <= 10_000 ? options.waitFor : 2000;

    // Initialize Firecrawl with API key from environment
    const apiKey = process.env.FIRECRAWL_API_KEY;
    
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      // For demo purposes, return mock data if API key is not set
      return NextResponse.json({
        success: true,
        data: {
          title: "Example Website",
          content: `This is a mock response for ${url}. Configure FIRECRAWL_API_KEY to enable real scraping.`,
          description: "A sample website",
          markdown: `# Example Website\n\nThis is mock content for demonstration purposes.`,
          html: `<h1>Example Website</h1><p>This is mock content for demonstration purposes.</p>`,
          metadata: {
            title: "Example Website",
            description: "A sample website",
            sourceURL: url,
            statusCode: 200
          }
        }
      });
    }
    
    const app = new FirecrawlApp({ apiKey });
    
    // Scrape the website using the latest SDK patterns
    // Include screenshot if requested in formats
    const scrapeResult = await app.scrape(url, {
      formats,
      onlyMainContent: options.onlyMainContent !== false, // Default to true for cleaner content
      waitFor, // Wait for dynamic content
      timeout: 30000
    });
    
    // Handle the response according to the latest SDK structure
    const result = scrapeResult as any;
    if (result.success === false) {
      throw new Error(result.error || "Failed to scrape website");
    }
    
    // The SDK may return data directly or nested
    const data = result.data || result;
    
    return NextResponse.json({
      success: true,
      data: {
        title: data?.metadata?.title || "Untitled",
        content: data?.markdown || data?.html || "",
        description: data?.metadata?.description || "",
        markdown: data?.markdown || "",
        html: data?.html || "",
        metadata: data?.metadata || {},
        screenshot: data?.screenshot || null,
        links: data?.links || []
      }
    });
    
  } catch (error) {
    console.error("Error scraping website:", error);
    
    // Return a more detailed error response
    return NextResponse.json({
      success: false,
      error: publicErrorMessage(error, "Failed to scrape website"),
      // Provide mock data as fallback for development
      data: {
        title: "Example Website",
        content: "This is fallback content due to an error. Please check your configuration.",
        description: "Error occurred while scraping",
        markdown: "# Error\n\nFailed to scrape website",
        html: `<h1>Error</h1><p>Failed to scrape website</p>`,
        metadata: {
          title: "Error",
          description: "Failed to scrape website",
          statusCode: 500
        }
      }
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}

// Optional: Add OPTIONS handler for CORS if needed
export async function OPTIONS(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  return new NextResponse(null, {
    status: 200,
    headers: {
    },
  });
}