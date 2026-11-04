import { test, expect } from 'bun:test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
// Structural guard accompanies full-dist browser behavior tests; it is not acceptance alone.
test('controller constructors survive while only the legacy mount is removed', () => {
 const output=process.env.LEGACY_VARIANT==='broken' ? execFileSync('git',['show','b1f024a8d9914ceecce26fe65cddcc4bad38fb0e:dist/Koppy.user.js'],{maxBuffer:8e6}).toString() : fs.readFileSync(new URL('../../dist/Koppy.user.js',import.meta.url),'utf8');
 expect(output.split('floatBar = new FloatBarC();').length-1).toBe(3);
 expect(output).toContain("container.id='pv-float-bar-container'; // KOPPY_DETACHED_LEGACY_FLOATBAR");
 expect(output).not.toContain("container.id='pv-float-bar-container';\n                getBody(document).appendChild(container);");
});
