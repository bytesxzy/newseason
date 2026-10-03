'use strict';
/* Print an ARC task's train pairs as digit grids (dev data only). node tools/arc-show.js <task.json> [maxPairs] */
const fs = require('node:fs');
const t = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const max = +(process.argv[3] || 3);
const show = g => g.map(r => r.map(v => v === 0 ? '.' : String(v)).join('')).join('\n');
t.train.slice(0, max).forEach((p, i) => {
  const a = show(p.input).split('\n'), b = show(p.output).split('\n');
  console.log('--- pair ' + i + '  in ' + p.input.length + 'x' + p.input[0].length + '  out ' + p.output.length + 'x' + p.output[0].length);
  for (let r = 0; r < Math.max(a.length, b.length); r++) console.log((a[r] || '').padEnd(p.input[0].length + 3) + (b[r] || ''));
});
