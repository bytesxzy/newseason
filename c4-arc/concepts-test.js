'use strict';
/* Tests for the concept machines (src/60-concepts.js).
 *
 * The machines are run ALONE (no other solver family) on seeded parametric
 * tasks from tools/concept-suite.js, so a pass means the machine itself
 * recovered the rule from three demonstrations and applied it to a fourth
 * input of different size and layout. Thresholds are per family, out of N
 * seeded tasks; they sit below the measured rate so the suite is stable.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suite = path.join(__dirname, '..', 'tools', 'concept-suite.js');
const N = 5;
/* family -> minimum solved out of N, measured with the module alone */
const EXPECT = {
  between_hv: 4, fill_between_diag: 4, ray_fixed_dir: 4, ray_by_color: 3, ray_cross: 4,
  flood_enclosed_seed: 3, reflect_across_line: 4, template_stamp_marker: 4, mirror_beside: 4,
  largest_rect_fill: 4, diag_from_corners: 4, extend_to_wall: 3, move_to_corner: 4, count_objects_bar: 3
};
const only = Object.keys(EXPECT).join(',');
const r = spawnSync(process.execPath, [suite, '--n', String(N), '--budget', '2', '--module', 'concepts', '--only', only], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
let pass = 0, fail = 0;
for (const line of r.stdout.split('\n')) {
  const m = line.match(/^(\S+)\s+(\d+)\/(\d+)/);
  if (!m || !(m[1] in EXPECT)) continue;
  const ok = +m[2] >= EXPECT[m[1]];
  console.log((ok ? 'PASS ' : 'FAIL ') + m[1] + ' ' + m[2] + '/' + m[3] + ' (need ' + EXPECT[m[1]] + ')');
  if (ok) pass++; else fail++;
}
const seen = pass + fail;
if (seen !== Object.keys(EXPECT).length) { console.error('expected ' + Object.keys(EXPECT).length + ' families, saw ' + seen); process.exit(1); }
console.log(pass + '/' + seen + ' concept-machine families at threshold');
if (fail) process.exit(1);
