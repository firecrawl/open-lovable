import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSelectedFileContent} from '../lib/visual/file-content';
test('selected file content prefers generated output and falls back to authorized sandbox cache',()=>{assert.equal(resolveSelectedFileContent('/src/App.tsx',[{path:'/src/App.tsx',content:'generated'}],{'src/App.tsx':'sandbox'}),'generated');assert.equal(resolveSelectedFileContent('/src/App.tsx',[],{'src/App.tsx':'sandbox'}),'sandbox');assert.equal(resolveSelectedFileContent('/src/Missing.tsx',[],{}),'// File content is unavailable');});
