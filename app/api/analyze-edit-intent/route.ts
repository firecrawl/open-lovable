import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
// import type { FileManifest } from '@/types/file-manifest'; // Type is used implicitly through manifest parameter

// Check if we're using Vercel AI Gateway
const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'),
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

const openrouter = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENROUTER_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : 'https://openrouter.ai/api/v1',
});

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

// Schema for the AI's search plan - not file selection!
const searchPlanSchema = z.object({
  editType: z.enum([
    'UPDATE_COMPONENT',
    'ADD_FEATURE', 
    'FIX_ISSUE',
    'UPDATE_STYLE',
    'REFACTOR',
    'ADD_DEPENDENCY',
    'REMOVE_ELEMENT'
  ]).describe('The type of edit being requested'),
  
  reasoning: z.string().describe('Explanation of the search strategy'),
  
  searchTerms: z.array(z.string()).describe('Specific text to search for (case-insensitive). Be VERY specific - exact button text, class names, etc.'),
  
  regexPatterns: z.array(z.string()).optional().describe('Regex patterns for finding code structures (e.g., "className=[\\"\\\'].*header.*[\\"\\\']")'),
  
  fileTypesToSearch: z.array(z.string()).default(['.jsx', '.tsx', '.js', '.ts']).describe('File extensions to search'),
  
  expectedMatches: z.number().min(1).max(10).default(1).describe('Expected number of matches (helps validate search worked)'),
  
  fallbackSearch: z.object({
    terms: z.array(z.string()),
    patterns: z.array(z.string()).optional()
  }).optional().describe('Backup search if primary fails')
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, manifest, model = 'openai/gpt-oss-20b' } = await request.json();
    
    console.log('[analyze-edit-intent] Request received');
    console.log('[analyze-edit-intent] Prompt:', prompt);
    console.log('[analyze-edit-intent] Model:', model);
    console.log('[analyze-edit-intent] Manifest files count:', manifest?.files ? Object.keys(manifest.files).length : 0);
    
    if (!prompt || !manifest) {
      return NextResponse.json({
        error: 'prompt and manifest are required'
      }, { status: 400 });
    }
    
    // Create a summary of available files for the AI
    const validFiles = Object.entries(manifest.files as Record<string, any>)
      .filter(([path]) => {
        // Filter out invalid paths
        return path.includes('.') && !path.match(/\/\d+$/);
      });
    
    const fileSummary = validFiles
      .map(([path, info]: [string, any]) => {
        const componentName = info.componentInfo?.name || path.split('/').pop();
        // const hasImports = info.imports?.length > 0; // Kept for future use
        const childComponents = info.componentInfo?.childComponents?.join(', ') || 'none';
        return `- ${path} (${componentName}, renders: ${childComponents})`;
      })
      .join('\n');
    
    console.log('[analyze-edit-intent] Valid files found:', validFiles.length);
    
    if (validFiles.length === 0) {
      console.error('[analyze-edit-intent] No valid files found in manifest');
      return NextResponse.json({
        success: false,
        error: 'No valid files found in manifest'
      }, { status: 400 });
    }
    
    console.log('[analyze-edit-intent] Analyzing prompt:', prompt);
    console.log('[analyze-edit-intent] File summary preview:', fileSummary.split('\n').slice(0, 5).join('\n'));
    
    // Select the appropriate AI model based on the request
    let aiModel;
    if (model.startsWith('anthropic/')) {
      aiModel = anthropic(model.replace('anthropic/', ''));
    } else if (model.startsWith('openai/')) {
      if (model.includes('gpt-oss')) {
        aiModel = groq(model);
      } else {
        aiModel = openai(model.replace('openai/', ''));
      }
    } else if (model.startsWith('openrouter/')) {
      aiModel = openrouter(model.replace('openrouter/', ''));
    } else if (model.startsWith('google/')) {
      aiModel = googleGenerativeAI(model.replace('google/', ''));
    } else {
      // Default to groq if model format is unclear
      aiModel = groq(model);
    }
    
    console.log('[analyze-edit-intent] Using AI model:', model);
    
    // Use AI to create a search plan
    const result = await generateObject({
      model: aiModel,
      schema: searchPlanSchema,
      messages: [
        {
          role: 'system',
          content: `You are an expert at planning code searches. Your job is to create a search strategy to find the exact code that needs to be edited.

DO NOT GUESS which files to edit. Instead, provide specific search terms that will locate the code.

SEARCH STRATEGY RULES:
1. For text changes (e.g., "change 'Start Deploying' to 'Go Now'"):
   - Search for the EXACT text: "Start Deploying"
   
2. For style changes (e.g., "make header black"):
   - Search for component names: "Header", "<header"
   - Search for class names: "header", "navbar"
   - Search for className attributes containing relevant words
   
3. For removing elements (e.g., "remove the deploy button"):
   - Search for the button text or aria-label
   - Search for relevant IDs or data-testids
   
4. For navigation/header issues:
   - Search for: "navigation", "nav", "Header", "navbar"
   - Look for Link components or href attributes
   
5. Be SPECIFIC:
   - Use exact capitalization for user-visible text
   - Include multiple search terms for redundancy
   - Add regex patterns for structural searches

Current project structure for context:
${fileSummary}`
        },
        {
          role: 'user',
          content: `User request: "${prompt}"

Create a search plan to find the exact code that needs to be modified. Include specific search terms and patterns.`
        }
      ]
    });
    
    console.log('[analyze-edit-intent] Search plan created:', {
      editType: result.object.editType,
      searchTerms: result.object.searchTerms,
      patterns: result.object.regexPatterns?.length || 0,
      reasoning: result.object.reasoning
    });
    
    // Return the search plan, not file matches
    return NextResponse.json({
      success: true,
      searchPlan: result.object
    });
    
  } catch (error) {
    console.error('[analyze-edit-intent] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}