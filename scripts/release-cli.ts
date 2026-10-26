/**
 * Cầu nối dòng lệnh để scripts/release-prod.sh gọi các hàm thuần ở scripts/release-lib.ts (bash không có JSON/sha256 cây).
 * Chỉ được gọi bởi release-prod.sh, trong worktree phát hành đã `npm ci` (`npx tsx <đường-dẫn>/release-cli.ts …`).
 * Mã thoát: 0 đạt · 1 có vấn đề (in ra stderr) · 64 dùng sai.
 *
 *   scan-bundle <outDir>
 *   typecheck <baselineFile> <tscOutputFile> <tscExitCode>
 *   build-id-write <dir> <sha>                     ghi out/build-id.txt (TRƯỚC dry-run: dry-run chép out/ sang .pages-dist)
 *   build-info-write <dir> <sha> <ref> <allowRef 0|1> <firstShip 0|1> <prodSha|->   bước CUỐI của prepare
 *   build-info-check <dir> <headSha>
 *   build-info-get <dir> <field>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  BUILD_ID_REL,
  BUILD_INFO_REL,
  checkBuildInfo,
  compareTypecheck,
  isSha40,
  makeBuildInfo,
  parseBaseline,
  parseTscErrors,
  readBuildInfo,
  scanBundle,
} from './release-lib';

function fail(lines: string[]): never {
  for (const l of lines) console.error(`  ✗ ${l}`);
  process.exit(1);
}

function usage(): never {
  console.error('release-cli: dùng sai — xem chú thích đầu tệp scripts/release-cli.ts');
  process.exit(64);
}

const [cmd, ...a] = process.argv.slice(2);

switch (cmd) {
  case 'scan-bundle': {
    if (a.length !== 1) usage();
    const problems = scanBundle(a[0]);
    if (problems.length) fail(problems);
    console.log('  ✓ bundle trỏ API PROD, không có dấu vết DEV');
    break;
  }
  case 'typecheck': {
    if (a.length !== 3) usage();
    const baseline = parseBaseline(fs.readFileSync(a[0], 'utf8'));
    const current = parseTscErrors(fs.readFileSync(a[1], 'utf8'));
    // tsc đỏ mà không đọc được dòng lỗi nào (tsc không chạy được, định dạng đổi…) ⇒ KHÔNG coi là đạt.
    if (a[2] !== '0' && current.length === 0) fail([`typecheck thoát mã ${a[2]} nhưng không có dòng lỗi TS nào đọc được — xem ${a[1]}`]);
    const { added, fixed } = compareTypecheck(baseline, current);
    if (fixed.length) console.log(`  ℹ ${fixed.length} lỗi baseline đã hết (nên gỡ khỏi ${a[0]}): ${fixed.join(', ')}`);
    if (added.length) fail([`${added.length} lỗi typecheck MỚI so với baseline: ${added.join(', ')}`]);
    console.log(`  ✓ typecheck: ${current.length} lỗi, đều nằm trong baseline (${baseline.length})`);
    break;
  }
  case 'build-id-write': {
    if (a.length !== 2) usage();
    if (!isSha40(a[1])) fail([`sha không hợp lệ: ${a[1]}`]);
    fs.writeFileSync(path.join(a[0], BUILD_ID_REL), `${a[1]}\n`);
    console.log(`  ✓ ghi ${BUILD_ID_REL}`);
    break;
  }
  case 'build-info-write': {
    // Bước CUỐI của prepare (sau dry-run): build-info.json là "vé" cho ship — prepare chết giữa chừng thì không có vé.
    if (a.length !== 6) usage();
    const [dir, sha, ref, allowRef, firstShip, prodSha] = a;
    const idPath = path.join(dir, BUILD_ID_REL);
    const id = fs.existsSync(idPath) ? fs.readFileSync(idPath, 'utf8').trim() : null;
    if (id !== sha) fail([`${BUILD_ID_REL} (${id ?? 'thiếu'}) ≠ ${sha} — chạy build-id-write trước`]);
    const info = makeBuildInfo(dir, {
      sha,
      ref,
      allowRef: allowRef === '1',
      firstShip: firstShip === '1',
      prodSha: prodSha === '-' ? null : prodSha,
      now: new Date(),
      node: process.version,
    });
    fs.mkdirSync(path.join(dir, path.dirname(BUILD_INFO_REL)), { recursive: true });
    fs.writeFileSync(path.join(dir, BUILD_INFO_REL), `${JSON.stringify(info, null, 2)}\n`);
    console.log(`  ✓ ghi ${BUILD_INFO_REL} (out/ băm ${info.outTreeSha256.slice(0, 12)})`);
    break;
  }
  case 'build-info-check': {
    if (a.length !== 2) usage();
    const problems = checkBuildInfo(a[0], a[1]);
    if (problems.length) fail(problems);
    console.log('  ✓ build-info khớp HEAD, out/ không đổi từ lúc prepare');
    break;
  }
  case 'build-info-get': {
    if (a.length !== 2) usage();
    const info = readBuildInfo(a[0]);
    if (!info) fail([`thiếu ${BUILD_INFO_REL}`]);
    const v = (info as unknown as Record<string, unknown>)[a[1]];
    if (v === undefined) fail([`build-info không có trường ${a[1]}`]);
    console.log(String(v));
    break;
  }
  default:
    usage();
}
