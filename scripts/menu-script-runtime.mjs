import fs from 'node:fs';
import path from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';

const require = createRequire(import.meta.url);
const cache = new Map();
// The application uses extensionless TypeScript imports; reuse its menu service
// in Node scripts without importing the Cloudflare runtime.
export function loadMenuModule(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  let source = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import \{(.*?)\} from ['"](.*?)['"];$/gm,
    (_, names, name) => `const {${names.replace(/ as /g, ': ')}} = require('${name}');`).replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${names.join(',')}});`;
  new Function('require', 'exports', source)(name => name.startsWith('.')
    ? loadMenuModule(path.resolve(path.dirname(file), `${name}.ts`)) : require(name), module.exports);
  return module.exports;
}
