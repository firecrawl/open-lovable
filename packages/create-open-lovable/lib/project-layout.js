import path from 'path';

export const MAIN_PROJECT_ITEMS = Object.freeze([
  'app',
  'atoms',
  'components',
  'config',
  'hooks',
  'lib',
  'public',
  'styles',
  'types',
  'utils',
  '.gitignore',
  'eslint.config.mjs',
  'next.config.ts',
  'package.json',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json'
]);

export function resolveMainProjectRoot(templatesDir) {
  return path.resolve(templatesDir, '../../..');
}
