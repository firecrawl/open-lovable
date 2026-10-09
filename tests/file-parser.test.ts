import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildComponentTree, parseJavaScriptFile } from '../lib/file-parser';
import type { FileInfo } from '../types/file-manifest';

describe('JSX component detection', () => {
  const components = [
    ['App', 'export default function App() { return <div>Hello</div>; }'],
    ['Badge', 'export const Badge = () => <span>OK</span>;'],
    ['Divider', 'export default function Divider() { return <hr/>; }'],
    ['Heading', 'export default function Heading() { return <h1>Title</h1>; }'],
    ['Styled', 'export default function Styled() { return <div className="box">Hello</div>; }'],
    ['Parent', 'export default function Parent() { return <Child />; }'],
  ];

  for (const [name, content] of components) {
    it(`recognizes ${name} without a React import`, () => {
      const parsed = parseJavaScriptFile(content, `src/${name}.jsx`);

      assert.equal(parsed.componentInfo?.name, name);
    });
  }

  it('does not treat ordinary comparison expressions as JSX', () => {
    const parsed = parseJavaScriptFile(
      'export default function Compare(a, b) { return a < b && b > 0; }',
      'src/Compare.js',
    );

    assert.equal(parsed.componentInfo, undefined);
  });

  it('includes components with attribute-free tags in the dependency tree', () => {
    const files: Record<string, FileInfo> = {};
    const sources = {
      'src/App.jsx': 'import Header from "./Header"; export default function App() { return <Header />; }',
      'src/Header.jsx': 'export default function Header() { return <header>Hello</header>; }',
    };

    for (const [path, content] of Object.entries(sources)) {
      files[path] = {
        content,
        type: 'component',
        path,
        relativePath: path.slice(4),
        lastModified: 0,
        ...parseJavaScriptFile(content, path),
      };
    }

    const tree = buildComponentTree(files);

    assert.deepEqual(tree.App.imports, ['Header']);
    assert.deepEqual(tree.Header.importedBy, ['App']);
  });
});
