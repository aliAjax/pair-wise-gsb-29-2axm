import { assert } from "console";
import { checkWave, evaluateScan, sealBlockReason } from "../src/domain/rules";
import { SEED_WAVES, SEED_PACKAGES } from "../src/domain/seed";
import type { ScanEvent, TempZone, Wave } from "../src/domain/types";

let clock = Date.parse("2026-09-28T09:05:00");
function tick() {
  clock += 60000;
  return new Date(clock).toISOString();
}
const wave: Wave = structuredClone(SEED_WAVES[0]); // 常温车，3 件
wave.roundStartedAt = new Date(clock).toISOString();

function pkg(code: string) {
  return SEED_PACKAGES.find((p) => p.code === code)!;
}

function scan(code: string, zone: TempZone = "AMBIENT") {
  const at = tick();
  const outcome = evaluateScan(wave, pkg(code), zone);
  const event: ScanEvent = { at, code, zone, result: outcome.result, detail: outcome.detail };
  wave.scans.push(event);
  if (outcome.result === "OK") {
    wave.manifest.find((m) => m.packageCode === code)!.matchedAt = at;
  }
  return outcome.result;
}

// 正常扫 2 件
assert(scan("YD100001") === "OK");
assert(scan("YD100002") === "OK");
// 重复扫
assert(scan("YD100001") === "DUP");
// 冻品塞进常温车 → 温区不符
assert(scan("YD300001", "FROZEN") === "ZONE_MISMATCH");
// 别波次的常温件扫进来 → 多件
assert(scan("YD100004") === "EXTRA");
// 未知编号
assert(evaluateScan(wave, undefined, "AMBIENT").result === "UNKNOWN");

let c = checkWave(wave);
assert(c.total === 3 && c.matched === 2, "matched should be 2");
assert(c.missing.length === 1 && c.missing[0].packageCode === "YD100003", "missing YD100003");
assert(c.zoneMismatch.length === 1 && c.extra.length === 1, "problems flagged");
assert(!c.pass, "must not pass");
assert(sealBlockReason(wave)?.includes("缺件"), "seal blocked");

// 问题件回待处理区，开新一轮：历史扫件保留，重新逐件扫齐
wave.roundStartedAt = "2026-09-28T09:12:00";
clock = Date.parse("2026-09-28T09:12:00");
wave.manifest.forEach((m) => (m.matchedAt = undefined));
for (const code of ["YD100001", "YD100002", "YD100003"]) {
  assert(scan(code) === "OK", `rescan ${code}`);
}
c = checkWave(wave);
assert(c.pass, "fresh round with full match passes");
assert(sealBlockReason(wave) === null, "seal allowed");
// 历史问题记录仍可追溯
assert(wave.scans.filter((s) => s.result === "ZONE_MISMATCH").length === 1, "history kept");

// 缺件场景：只扫 2 件不能封车
const missing: Wave = structuredClone(SEED_WAVES[0]);
const r1 = evaluateScan(missing, pkg("YD100001"), "AMBIENT");
const r2 = evaluateScan(missing, pkg("YD100002"), "AMBIENT");
missing.scans.push(
  { at: tick(), code: "YD100001", zone: "AMBIENT", result: r1.result, detail: r1.detail },
  { at: tick(), code: "YD100002", zone: "AMBIENT", result: r2.result, detail: r2.detail }
);
assert(sealBlockReason(missing)?.includes("YD100003"), "missing blocks seal");

// 干净波次：全部对上即可封车
const clean: Wave = structuredClone(SEED_WAVES[2]); // 冷冻车 2 件
for (const code of ["YD300001", "YD300002"]) {
  const o = evaluateScan(clean, pkg(code), "FROZEN");
  assert(o.result === "OK", `frozen pkg ok: ${o.detail}`);
  clean.scans.push({ at: tick(), code, zone: "FROZEN", result: "OK", detail: o.detail });
}
assert(checkWave(clean).pass, "clean wave passes");
assert(sealBlockReason(clean) === null);

// 冷藏件扫进冷冻车
const chilled = pkg("YD200001");
assert(evaluateScan(clean, chilled, "FROZEN").result === "ZONE_MISMATCH");

console.log("rules: all assertions passed");
