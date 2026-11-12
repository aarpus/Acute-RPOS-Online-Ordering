import fs from 'node:fs';
import { parse } from 'dotenv';
const bytes = fs.readFileSync(process.argv[2] || '.local-backups/admin-login-tail.jsonl');
const text = bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8');
const secrets = ['.env', '.dev.vars'].flatMap(file => fs.existsSync(file) ? Object.values(parse(fs.readFileSync(file))) : []).filter(value => value.length >= 8);
function redact(value) {
  let result = String(value).replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
  for (const secret of secrets) result = result.replaceAll(secret, '[REDACTED]');
  return result;
}
const events = [];
let depth = 0, start = -1, quoted = false, escape = false;
for (let i = 0; i < text.length; i++) {
  const char = text[i];
  if (quoted) { if (escape) escape = false; else if (char === '\\') escape = true; else if (char === '"') quoted = false; continue; }
  if (char === '"') { quoted = true; continue; }
  if (char === '{') { if (depth++ === 0) start = i; }
  if (char === '}' && --depth === 0 && start !== -1) {
    try { events.push(JSON.parse(text.slice(start, i + 1))); } catch {}
    start = -1;
  }
}
for (const event of events.slice(-4)) {
  for (const log of event.logs ?? []) {
    if (log.level === 'error' || JSON.stringify(log.message).includes('Admin login failed')) console.log(redact(JSON.stringify(log.message)).slice(0, 5000));
  }
  for (const exception of event.exceptions ?? []) console.log(redact(exception.message).slice(0, 1500));
}
