import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { loadMenuModule } from './menu-script-runtime.mjs';

const policy = loadMenuModule('lib/menu-create-policy.ts');
const menuRoutes = loadMenuModule('lib/admin-menu.ts');
let view = 'items', visibility = {}, posEnabled = true, loading = false;
const menu = { storeCode: 'store-a', get loading() { return loading; }, error: '', canCreate: resource => policy.canCreateMenuRecord(posEnabled, visibility, resource) };
let controls;
async function component(file) {
  let source = (await transformWithOxc(fs.readFileSync(file, 'utf8'), file, { jsx: { runtime: 'classic' } })).code;
  const names = [...source.matchAll(/export (?:function|const) (\w+)/g)].map(match => match[1]);
  const defaultName = source.match(/export default function (\w+)/)?.[1];
  source = source.replace(/^import \{(.*?)\} from ["'](.*?)["'];$/gm, (_, names, name) => `const {${names.replace(/ as /g, ': ')}} = require('${name}');`)
    .replace(/^import (\w+) from ["'](.*?)["'];$/gm, (_, name, path) => `const ${name} = require('${path}');`)
    .replace(/^export default /gm, '').replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${[...names, ...(defaultName ? [`default: ${defaultName}`] : [])].join(',')}});`;
  const exports = {};
  new Function('React', 'require', 'exports', source)(React, name => {
    if (name === 'react') return React;
    if (name === 'next/navigation') return { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams({ view, store_code: 'store-a' }) };
    if (name === '../../lib/admin-menu') return menuRoutes;
    if (name === './legacy-menu-client') return { useLegacyMenu: () => menu, OriginalMenuProvider: ({ children }) => children };
    if (name === './MenuControls') return controls;
    if (name.endsWith('Workspace')) return () => React.createElement('div', { 'data-screen': name.slice(2) });
    throw new Error(`Unexpected import: ${name}`);
  }, exports);
  return exports;
}
controls = await component('components/admin/MenuControls.tsx');
const workspace = (await component('components/admin/MenuWorkspace.tsx')).default;
const render = () => renderToStaticMarkup(React.createElement(workspace));
for (const role of ['admin', 'super_admin']) {
  // Visibility is intentionally independent of the signed-in admin's role.
  menu.role = role;
  visibility = { items: false, variants: false };
  view = 'categories';
  let html = render();
  assert.doesNotMatch(html, /data-screen="ItemsWorkspace"|data-screen="VariantsWorkspace"/);
  assert.match(html, /data-screen="CategoriesWorkspace"/);
  const nav = renderToStaticMarkup(React.createElement(controls.MenuNavigation, { active: 'Categories', onChange() {} }));
  assert.doesNotMatch(nav, /view=items|view=variants/);
  assert.match(nav, /view=categories&amp;store_code=store-a/);
  view = 'items'; html = render();
  assert.doesNotMatch(html, /data-screen=/);
  assert.match(html, /hidden by Super Admin/);
  for (const tab of ['Variants / Sizes', 'Images', 'Inventory', 'Schedule', 'Pricing', 'SEO & Meta', 'Combo Groups', 'Modifiers / Add-ons']) {
    assert.equal(policy.canViewMenuEditorTab(tab, () => false), false, `${role}: ${tab}`);
  }
  assert.equal(policy.canViewMenuEditorTab('Basic Info', () => false), true);
  visibility = Object.fromEntries(Object.keys(policy.menuCreateSections).map(key => [key, false]));
  assert.doesNotMatch(render(), /data-screen=|<a /);
  posEnabled = false;
  assert.match(render(), /data-screen="ItemsWorkspace"/);
  posEnabled = true;
}
loading = true;
assert.doesNotMatch(render(), /data-screen=/);
console.log('Passed: hidden navigation, unmounted screens, direct-link blocking, nested tabs, all-hidden/loading states, both admin roles, and POS-off restoration.');
