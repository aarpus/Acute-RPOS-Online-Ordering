import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const expected = JSON.parse(fs.readFileSync(new URL('./menu-design-signatures.json', import.meta.url), 'utf8'));
for (const [file, signature] of Object.entries(expected)) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const value = file.endsWith('.css') ? source.trimEnd() : JSON.stringify([...source.matchAll(/className=("[^"]*"|\{`[^`]*`\})/g)].map(match => match[1]));
  assert.equal(createHash('sha256').update(value).digest('hex'), signature, `${file}: the original design changed`);
}
const entry = fs.readFileSync('components/admin/MenuWorkspace.tsx', 'utf8');
for (const name of ['Items','Categories','Variants','ModifierGroups','ComboItems','Offers','TaxRules','Inventory','Schedules','Pricing','SeoMeta']) assert.match(entry, new RegExp(`<${name}Workspace\\b`));
assert.doesNotMatch(entry, /DatabaseMenuWorkspace/);
const combo = fs.readFileSync('components/admin/ComboItemsWorkspace.tsx', 'utf8');
for (const name of ['mw-list','mw-editor','mw-preview','mw-preview-includes','mw-editor-tabs','mw-editor-actions']) assert.ok(combo.includes(`"${name}"`) || combo.includes(` ${name}"`));
assert.ok(combo.includes("['Basic Info', 'Combo Groups', 'Images', 'Pricing', 'Inventory', 'Schedule', 'SEO & Meta']"));
console.log('Passed: original classes and their order in 10 retained screens, all 11 original stylesheets, retained screen routing and Combo Master table/editor/group tabs/preview.');
