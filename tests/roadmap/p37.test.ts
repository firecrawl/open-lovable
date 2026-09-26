import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {statusLabel} from '../../components/onboarding/CapabilityDisclosure';
test('P37 capability statuses are explicit and progressive disclosure keeps advanced work secondary',async()=>{assert.deepEqual(statusLabel,{available:'Disponível',configured:'Configurada',connected:'Conectada',operational:'Operacional'});const page=await readFile(new URL('../../app/projects/page.tsx',import.meta.url),'utf8');assert.match(page,/CapabilityDisclosure/);assert.match(page,/Pesquisa/);assert.match(page,/Laboratório/);assert.doesNotMatch(page,/provision|billing|payment/i);});
test('P37 invalid integration remains actionable rather than claiming success',async()=>{const page=await readFile(new URL('../../app/projects/page.tsx',import.meta.url),'utf8');assert.match(page,/role="alert"/);assert.match(page,/Não foi possível criar o projeto/);assert.match(page,/disabled=\{busy\|\|loading\|\|!canCreate/);});
