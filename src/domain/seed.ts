import type { PackageInfo, TempZone, Wave } from "./types";

// 分单系统侧的包裹资料（演示数据）。核验台只读引用这些资料，
// 波次清单里存的是分单时刻的快照，包裹资料后续变更不影响已分单结果。
export const SEED_PACKAGES: PackageInfo[] = [
  { code: "YD100001", customer: "世纪大道 88 号", zone: "AMBIENT", createdAt: "2026-09-28T08:20" },
  { code: "YD100002", customer: "世纪大道 120 号", zone: "AMBIENT", createdAt: "2026-09-28T08:21" },
  { code: "YD100003", customer: "张杨路 500 号", zone: "AMBIENT", createdAt: "2026-09-28T08:25" },
  { code: "YD200001", customer: "陆家嘴环路 1000 号", zone: "CHILLED", createdAt: "2026-09-28T08:30" },
  { code: "YD200002", customer: "花园石桥路 33 号", zone: "CHILLED", createdAt: "2026-09-28T08:32" },
  { code: "YD200003", customer: "花木路 1588 号", zone: "CHILLED", createdAt: "2026-09-28T08:35" },
  { code: "YD300001", customer: "迎春路 1199 号", zone: "FROZEN", createdAt: "2026-09-28T08:40" },
  { code: "YD300002", customer: "芳甸路 3000 号", zone: "FROZEN", createdAt: "2026-09-28T08:42" },
  { code: "YD100004", customer: "乳山路 200 号", zone: "AMBIENT", createdAt: "2026-09-28T08:46" }
];

export const SEED_RIDERS = ["骑手A", "骑手B", "骑手C"];

export const SEED_WAVES: Wave[] = [
  makeWave({
    id: "seed-wave-1",
    waveNo: "W20260928-AM-01",
    rider: "骑手A",
    zone: "AMBIENT",
    plannedSealAt: "2026-09-28T09:30",
    codes: ["YD100001", "YD100002", "YD100003"]
  }),
  makeWave({
    id: "seed-wave-2",
    waveNo: "W20260928-AM-02",
    rider: "骑手B",
    zone: "CHILLED",
    plannedSealAt: "2026-09-28T09:45",
    codes: ["YD200001", "YD200002", "YD200003"]
  }),
  makeWave({
    id: "seed-wave-3",
    waveNo: "W20260928-AM-03",
    rider: "骑手C",
    zone: "FROZEN",
    plannedSealAt: "2026-09-28T10:00",
    codes: ["YD300001", "YD300002"]
  })
];

function makeWave(init: {
  id: string;
  waveNo: string;
  rider: string;
  zone: TempZone;
  plannedSealAt: string;
  codes: string[];
}): Wave {
  const now = "2026-09-28T09:00";
  return {
    id: init.id,
    waveNo: init.waveNo,
    rider: init.rider,
    zone: init.zone,
    plannedSealAt: init.plannedSealAt,
    status: "PENDING",
    manifest: init.codes.map((code) => ({
      packageCode: code,
      zone: init.zone
    })),
    scans: [],
    roundStartedAt: now,
    seals: [],
    createdAt: now
  };
}
