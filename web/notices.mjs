// Writes ../THIRD-PARTY-NOTICES.md from the packages bundled into index.html
// (production dependencies only). Run after changing dependencies.
import {readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
// Every installed package that isn't build-only, from package-lock.json.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const dirs = Object.entries(lock.packages).filter(([k, v]) => k && !v.dev && !v.optional).map(([k]) => k);
const seen = new Set(), out = ['# Third-party notices', '', 'The interface (index.html) includes these open-source packages.', ''];
for (const dir of dirs.sort()) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const id = pkg.name + '@' + pkg.version;
  if (seen.has(id)) continue;
  seen.add(id);
  const lic = readdirSync(dir).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  out.push('## ' + id, '', 'License: ' + (pkg.license || 'see below'), '');
  if (lic) out.push('```', readFileSync(join(dir, lic), 'utf8').trim(), '```', '');
}
const fonts = 'node_modules/@astryxdesign/theme-neutral/fonts';
if (existsSync(fonts)) {
  for (const f of readdirSync(fonts).filter(f => /licen[cs]e|ofl/i.test(f))) {
    out.push('## Theme font license (' + f + ')', '', '```', readFileSync(join(fonts, f), 'utf8').trim(), '```', '');
  }
}
writeFileSync('../THIRD-PARTY-NOTICES.md', out.join('\n'));
console.log(seen.size + ' packages listed');
