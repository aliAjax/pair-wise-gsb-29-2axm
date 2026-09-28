// 本地留档层：波次全过程数据的本地存取与演示种子
// 清单快照、已扫记录、问题处理、封车/解封审计一律保留，重开页面不丢失
import type { AuditEntry, IssueRecord, ScanEntry, Wave } from "../packages/types";
import { hoursFromNow, newId } from "./time";

export const WAVE_STORAGE_KEY = "hxwlfront-15-waves";

const MINUTES = 60000;

function scan(code: string, minutesAgo: number): ScanEntry {
  return {
    id: newId("scan"),
    code,
    at: new Date(Date.now() - minutesAgo * MINUTES).toISOString(),
    active: true
  };
}

function audit(action: AuditEntry["action"], minutesAgo: number, detail?: string, by?: string): AuditEntry {
  return {
    id: newId("audit"),
    at: new Date(Date.now() - minutesAgo * MINUTES).toISOString(),
    action,
    ...(by ? { by } : {}),
    ...(detail ? { detail } : {})
  };
}

function issue(round: number, type: IssueRecord["type"], code: string, message: string, minutesAgo: number): IssueRecord {
  return {
    id: newId("issue"),
    round,
    type,
    code,
    message,
    at: new Date(Date.now() - minutesAgo * MINUTES).toISOString(),
    resolved: false
  };
}

export function seedWaves(): Wave[] {
  const created = (minutesAgo: number) => new Date(Date.now() - minutesAgo * MINUTES).toISOString();

  // 波次一：骑手A 常温车，已核验封车
  const waveA: Wave = {
    id: newId("wave"),
    waveNo: "W20260928-A01",
    rider: "骑手A",
    vehicleZone: "常温",
    plannedSealAt: hoursFromNow(2),
    manifest: [
      { code: "PKG-1001", rider: "骑手A", zone: "常温" },
      { code: "PKG-1002", rider: "骑手A", zone: "常温" },
      { code: "PKG-1003", rider: "骑手A", zone: "常温" },
      { code: "PKG-1004", rider: "骑手A", zone: "常温" }
    ],
    scans: [scan("PKG-1001", 40), scan("PKG-1002", 38), scan("PKG-1003", 35), scan("PKG-1004", 33)],
    issues: [],
    audit: [
      audit("创建波次", 45, "清单 4 件，常温车"),
      audit("执行核验", 30, "逐件比对一致，允许封车"),
      audit("封车", 28, "按计划封车出车", "站长 周敏")
    ],
    status: "sealed",
    round: 1,
    verifiedAt: new Date(Date.now() - 30 * MINUTES).toISOString(),
    seal: { sealedAt: new Date(Date.now() - 28 * MINUTES).toISOString(), sealedBy: "站长 周敏" },
    createdAt: created(45)
  };

  // 波次二：骑手B 常温车，存在多件和冻品上常温车，退回待处理
  const waveB: Wave = {
    id: newId("wave"),
    waveNo: "W20260928-B01",
    rider: "骑手B",
    vehicleZone: "常温",
    plannedSealAt: hoursFromNow(1),
    manifest: [
      { code: "PKG-2001", rider: "骑手B", zone: "常温" },
      { code: "PKG-2002", rider: "骑手B", zone: "常温" },
      { code: "PKG-2003", rider: "骑手B", zone: "冷藏" }
    ],
    scans: [
      scan("PKG-2001", 25),
      scan("PKG-2002", 23),
      scan("PKG-2003", 20),
      scan("PKG-2004", 18)
    ],
    issues: [
      issue(1, "zone", "PKG-2003", "PKG-2003 要求冷藏温区，不能装进常温车", 15),
      issue(1, "extra", "PKG-2004", "PKG-2004 不在本波次清单（分单骑手：骑手B），多件", 15)
    ],
    audit: [
      audit("创建波次", 30, "清单 3 件，常温车"),
      audit("执行核验", 15, "发现 2 处问题"),
      audit("退回待处理区", 14, "温区不符 1 件、多件 1 件")
    ],
    status: "pending",
    round: 1,
    createdAt: created(30)
  };

  // 波次三：骑手C 冷冻车，正在扫件，尚未核验
  const waveC: Wave = {
    id: newId("wave"),
    waveNo: "W20260928-C01",
    rider: "骑手C",
    vehicleZone: "冷冻",
    plannedSealAt: hoursFromNow(3),
    manifest: [
      { code: "PKG-3001", rider: "骑手C", zone: "常温" },
      { code: "PKG-3002", rider: "骑手C", zone: "冷藏" },
      { code: "PKG-3003", rider: "骑手C", zone: "冷冻" }
    ],
    scans: [scan("PKG-3001", 10), scan("PKG-3002", 6)],
    issues: [],
    audit: [audit("创建波次", 12, "清单 3 件，冷冻车（兼容冷藏/常温）")],
    status: "verifying",
    round: 0,
    createdAt: created(12)
  };

  return [waveB, waveC, waveA];
}

export function loadWaves(): Wave[] {
  try {
    const raw = localStorage.getItem(WAVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Wave[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 留档损坏时回落到演示数据
  }
  return seedWaves();
}

export function saveWaves(waves: Wave[]): void {
  localStorage.setItem(WAVE_STORAGE_KEY, JSON.stringify(waves));
}
