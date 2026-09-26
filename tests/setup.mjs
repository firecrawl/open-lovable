import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
process.env.OPEN_LOVABLE_DATA_DIR=mkdtempSync(join(tmpdir(),'open-lovable-test-data-'));
process.env.OPEN_LOVABLE_DISABLE_SAVED_SETTINGS='1';
