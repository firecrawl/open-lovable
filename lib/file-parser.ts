import { FileInfo, ImportInfo, ComponentInfo } from '@/types/file-manifest';

/**
 * Parse a JavaScript/JSX file to extract imports, exports, and component info
 */
export function parseJavaScriptFile(content: string, filePath: string): Partial<FileInfo> {
  const imports = extractImports(content);
  const exports = extractExports(content);
  const componentInfo = extractComponentInfo(content, filePath);
  const fileType = determineFileType(filePath, content);
  
  return {
    imports,
    exports,
    componentInfo,
    type: fileType,
  };
}

/**
 * Extract import statements from file content
 */
function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  
  // Match import statements
  const importRegex = /import\s+(?:(.+?)\s+from\s+)?['"](.+?)['"]/g;
  const matches = content.matchAll(importRegex);
  
  for (const match of matches) {
    const [, importClause, source] = match;
    const importInfo: ImportInfo = {
      source,
      imports: [],
      isLocal: source.startsWith('./') || source.startsWith('../') || source.startsWith('@/'),
    };
    
    if (importClause) {
      // Handle default import
      const defaultMatch = importClause.match(/^(\w+)(?:,|$)/);
      if (defaultMatch) {
        importInfo.defaultImport = defaultMatch[1];
      }
      
      // Handle named imports
      const namedMatch = importClause.match(/\{([^}]+)\}/);
      if (namedMatch) {
        importInfo.imports = namedMatch[1]
          .split(',')
          .map(imp => imp.trim())
          .map(imp => imp.split(/\s+as\s+/)[0].trim());
      }
    }
    
    imports.push(importInfo);
  }
  
  return imports;
}

/**
 * Extract export statements from file content
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];
  
  // Match default export
  if (/export\s+default\s+/m.test(content)) {
    // Try to find the name of the default export
    const defaultExportMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    if (defaultExportMatch) {
      exports.push(`default:${defaultExportMatch[1]}`);
    } else {
      exports.push('default');
    }
  }
  
  // Match named exports
  const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
  const namedMatches = content.matchAll(namedExportRegex);
  
  for (const match of namedMatches) {
    exports.push(match[1]);
  }
  
  // Match export { ... } statements
  const exportBlockRegex = /export\s+\{([^}]+)\}/g;
  const blockMatches = content.matchAll(exportBlockRegex);
  
  for (const match of blockMatches) {
    const names = match[1]
      .split(',')
      .map(exp => exp.trim())
      .map(exp => exp.split(/\s+as\s+/)[0].trim());
    exports.push(...names);
  }
  
  return exports;
}

/**
 * Extract React component information
 */
function extractComponentInfo(content: string, filePath: string): ComponentInfo | undefined {
  // Check if this is likely a React component
  const hasJSX = /<[A-Z]\w*|<[a-z][a-z0-9]*(?:\s+[^>]*)?\/?>/.test(content);
  if (!hasJSX && !content.includes('React')) return undefined;
  
  // Try to find component name
  let componentName = '';
  
  // Check for function component
  const funcComponentMatch = content.match(/(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/);
  if (funcComponentMatch) {
    componentName = funcComponentMatch[1];
  } else {
    // Check for arrow function component
    const arrowComponentMatch = content.match(/(?:export\s+)?(?:default\s+)?(?:const|let)\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[^=])*=>/);
    if (arrowComponentMatch) {
      componentName = arrowComponentMatch[1];
    }
  }
  
  // If no component name found, try to get from filename
  if (!componentName) {
    const fileName = filePath.split('/').pop()?.replace(/\.(jsx?|tsx?)$/, '');
    if (fileName && /^[A-Z]/.test(fileName)) {
      componentName = fileName;
    }
  }
  
  if (!componentName) return undefined;
  
  // Extract hooks used
  const hooks: string[] = [];
  const hookRegex = /use[A-Z]\w*/g;
  const hookMatches = content.matchAll(hookRegex);
  for (const match of hookMatches) {
    if (!hooks.includes(match[0])) {
      hooks.push(match[0]);
    }
  }
  
  // Check if component has state
  const hasState = hooks.includes('useState') || hooks.includes('useReducer');
  
  // Extract child components (rough approximation)
  const childComponents: string[] = [];
  const componentRegex = /<([A-Z]\w*)[^>]*(?:\/?>|>)/g;
  const componentMatches = content.matchAll(componentRegex);
  
  for (const match of componentMatches) {
    const comp = match[1];
    if (!childComponents.includes(comp) && comp !== componentName) {
      childComponents.push(comp);
    }
  }
  
  return {
    name: componentName,
    hooks,
    hasState,
    childComponents,
  };
}

/**
 * Determine file type based on path and content
 */
function determineFileType(
  filePath: string,
  content: string
): FileInfo['type'] {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  const dirPath = filePath.toLowerCase();
  
  // Style files
  if (fileName.endsWith('.css')) return 'style';
  
  // Config files
  if (fileName.includes('config') || 
      fileName === 'vite.config.js' ||
      fileName === 'tailwind.config.js' ||
      fileName === 'postcss.config.js') {
    return 'config';
  }
  
  // Hook files
  if (dirPath.includes('/hooks/') || fileName.startsWith('use')) {
    return 'hook';
  }
  
  // Context files
  if (dirPath.includes('/context/') || fileName.includes('context')) {
    return 'context';
  }
  
  // Layout components
  if (fileName.includes('layout') || content.includes('children')) {
    return 'layout';
  }
  
  // Page components (in pages directory or have routing)
  if (dirPath.includes('/pages/') || 
      content.includes('useRouter') ||
      content.includes('useParams')) {
    return 'page';
  }
  
  // Utility files
  if (dirPath.includes('/utils/') || 
      dirPath.includes('/lib/') ||
      !content.includes('export default')) {
    return 'utility';
  }
  
  // Default to component
  return 'component';
}

/**
 * Build component dependency tree
 */
export function buildComponentTree(files: Record<string, FileInfo>) {
  const tree: Record<string, {
    file: string;
    imports: string[];
    importedBy: string[];
    type: 'page' | 'layout' | 'component';
  }> = {};
  
  // First pass: collect all components
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.componentInfo) {
      const componentName = fileInfo.componentInfo.name;
      tree[componentName] = {
        file: path,
        imports: [],
        importedBy: [],
        type: fileInfo.type === 'page' ? 'page' : 
              fileInfo.type === 'layout' ? 'layout' : 'component',
      };
    }
  }
  
  // Second pass: build relationships
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.componentInfo && fileInfo.imports) {
      const componentName = fileInfo.componentInfo.name;
      
      // Find imported components
      for (const imp of fileInfo.imports) {
        if (imp.isLocal && imp.defaultImport) {
          // Check if this import is a component we know about
          if (tree[imp.defaultImport]) {
            tree[componentName].imports.push(imp.defaultImport);
            tree[imp.defaultImport].importedBy.push(componentName);
          }
        }
      }
    }
  }
  
  return tree;
}
