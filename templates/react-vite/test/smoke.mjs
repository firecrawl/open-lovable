import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes('/src/main.tsx')) throw new Error('entry missing');
console.log('template smoke ok');
