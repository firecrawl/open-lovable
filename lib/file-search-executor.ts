/**
 * Agentic file search executor
 * Executes search plans to find exact code locations before editing
 */

export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchedTerm?: string;
  matchedPattern?: string;
  contextBefore: string[];
  contextAfter: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface SearchPlan {
  editType: string;
  reasoning: string;
  searchTerms: string[];
  regexPatterns?: string[];
  fileTypesToSearch?: string[];
  expectedMatches?: number;
  fallbackSearch?: {
    terms: string[];
    patterns?: string[];
  };
}

export interface SearchExecutionResult {
  success: boolean;
  results: SearchResult[];
  filesSearched: number;
  executionTime: number;
  usedFallback: boolean;
  error?: string;
}

/**
 * Execute a search plan against the codebase
 */
export function executeSearchPlan(
  searchPlan: SearchPlan,
  files: Record<string, string>
): SearchExecutionResult {
  const startTime = Date.now();
  const results: SearchResult[] = [];
  let filesSearched = 0;
  let usedFallback = false;

  const { 
    searchTerms = [], 
    regexPatterns = [], 
    fileTypesToSearch = ['.jsx', '.tsx', '.js', '.ts'],
    fallbackSearch 
  } = searchPlan;

  // Helper function to perform search
  const performSearch = (terms: string[], patterns?: string[]): SearchResult[] => {
    const searchResults: SearchResult[] = [];

    for (const [filePath, content] of Object.entries(files)) {
      // Skip files that don't match the desired extensions
      const shouldSearch = fileTypesToSearch.some(ext => filePath.endsWith(ext));
      if (!shouldSearch) continue;

      filesSearched++;
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let matched = false;
        let matchedTerm: string | undefined;
        let matchedPattern: string | undefined;

        // Check simple search terms (case-insensitive)
        for (const term of terms) {
          if (line.toLowerCase().includes(term.toLowerCase())) {
            matched = true;
            matchedTerm = term;
            break;
          }
        }

        // Check regex patterns if no term match
        if (!matched && patterns) {
          for (const pattern of patterns) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(line)) {
                matched = true;
                matchedPattern = pattern;
                break;
              }
            } catch {
              console.warn(`[file-search] Invalid regex pattern: ${pattern}`);
            }
          }
        }

        if (matched) {
          // Get context lines (3 before, 3 after)
          const contextBefore = lines.slice(Math.max(0, i - 3), i);
          const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 4));

          // Determine confidence based on match type and context
          let confidence: 'high' | 'medium' | 'low' = 'medium';
          
          // High confidence if it's an exact match or in a component definition
          if (matchedTerm && line.toLowerCase().includes(matchedTerm.toLowerCase())) {
            confidence = 'high';
          } else if (line.includes('function') || line.includes('export') || line.includes('return')) {
            confidence = 'high';
          } else if (matchedPattern) {
            confidence = 'medium';
          }

          searchResults.push({
            filePath,
            lineNumber: i + 1,
            lineContent: line.trim(),
            matchedTerm,
            matchedPattern,
            contextBefore,
            contextAfter,
            confidence
          });
        }
      }
    }

    return searchResults;
  };

  // Execute primary search
  results.push(...performSearch(searchTerms, regexPatterns));

  // If no results and we have a fallback, try it
  if (results.length === 0 && fallbackSearch) {
    console.log('[file-search] No results from primary search, trying fallback...');
    usedFallback = true;
    results.push(...performSearch(
      fallbackSearch.terms,
      fallbackSearch.patterns
    ));
  }

  const executionTime = Date.now() - startTime;

  // Sort results by confidence
  results.sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  return {
    success: results.length > 0,
    results,
    filesSearched,
    executionTime,
    usedFallback,
    error: results.length === 0 ? 'No matches found for search terms' : undefined
  };
}

/**
 * Format search results for AI consumption
 */
export function formatSearchResultsForAI(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  const sections: string[] = [];
  
  sections.push('🔍 SEARCH RESULTS - EXACT LOCATIONS FOUND:\n');
  
  // Group by file for better readability
  const resultsByFile = new Map<string, SearchResult[]>();
  for (const result of results) {
    if (!resultsByFile.has(result.filePath)) {
      resultsByFile.set(result.filePath, []);
    }
    resultsByFile.get(result.filePath)!.push(result);
  }

  for (const [filePath, fileResults] of resultsByFile) {
    sections.push(`\n📄 FILE: ${filePath}`);
    
    for (const result of fileResults) {
      sections.push(`\n  📍 Line ${result.lineNumber} (${result.confidence} confidence)`);
      
      if (result.matchedTerm) {
        sections.push(`     Matched: "${result.matchedTerm}"`);
      } else if (result.matchedPattern) {
        sections.push(`     Pattern: ${result.matchedPattern}`);
      }
      
      sections.push(`     Code: ${result.lineContent}`);
      
      if (result.contextBefore.length > 0 || result.contextAfter.length > 0) {
        sections.push(`     Context:`);
        for (const line of result.contextBefore) {
          sections.push(`       ${line}`);
        }
        sections.push(`     → ${result.lineContent}`);
        for (const line of result.contextAfter) {
          sections.push(`       ${line}`);
        }
      }
    }
  }

  sections.push('\n\n🎯 RECOMMENDED ACTION:');
  
  // Recommend the highest confidence result
  const bestResult = results[0];
  sections.push(`Edit ${bestResult.filePath} at line ${bestResult.lineNumber}`);

  return sections.join('\n');
}

/**
 * Select the best file to edit based on search results
 */
export function selectTargetFile(
  results: SearchResult[],
  editType: string
): { filePath: string; lineNumber: number; reason: string } | null {
  if (results.length === 0) return null;

  // For style updates, prefer components over CSS files
  if (editType === 'UPDATE_STYLE') {
    const componentResult = results.find(r => 
      r.filePath.endsWith('.jsx') || r.filePath.endsWith('.tsx')
    );
    if (componentResult) {
      return {
        filePath: componentResult.filePath,
        lineNumber: componentResult.lineNumber,
        reason: 'Found component with style to update'
      };
    }
  }

  // For remove operations, find the component that renders the element
  if (editType === 'REMOVE_ELEMENT') {
    const renderResult = results.find(r => 
      r.lineContent.includes('return') || 
      r.lineContent.includes('<')
    );
    if (renderResult) {
      return {
        filePath: renderResult.filePath,
        lineNumber: renderResult.lineNumber,
        reason: 'Found element to remove in render output'
      };
    }
  }

  // Default: use highest confidence result
  const best = results[0];
  return {
    filePath: best.filePath,
    lineNumber: best.lineNumber,
    reason: `Highest confidence match (${best.confidence})`
  };
}