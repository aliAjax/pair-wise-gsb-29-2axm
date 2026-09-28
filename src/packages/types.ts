// 出车核验领域模型：包裹资料、波次清单、扫码留痕、问题与审计记录

export type TempZone = "常温" | "冷藏" | "冷冻";

/** 包裹资料（资料库维护，分单时的主数据） */
export interface Parcel {
  code: string; // 包裹编号
  rider: string; // 分单骑手
  zone: TempZone; // 要求温区
  address: string;
  slot: string; // 配送时段
  updatedAt: string;
}

/** 波次清单项：建波次时对原分配的不可变快照 */
export interface ManifestItem {
  code: string;
  rider: string;
  zone: TempZone;
}

/** 扫码记录：移出车厢只置 active=false，记录永不删除 */
export interface ScanEntry {
  id: string;
  code: string;
  at: string;
  active: boolean;
  deactivatedAt?: string;
}

export type IssueType = "missing" | "extra" | "zone" | "unknown";

/** 每一轮核验发现的问题及处理结果 */
export interface IssueRecord {
  id: string;
  round: number;
  type: IssueType;
  code: string;
  message: string;
  at: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: "创建波次" | "执行核验" | "退回待处理区" | "封车" | "解封";
  by?: string;
  detail?: string;
}

export type WaveStatus = "verifying" | "pending" | "sealed";

export interface SealInfo {
  sealedAt: string;
  sealedBy: string;
  unsealedAt?: string;
  unsealReason?: string;
  reviewer?: string;
}

/** 一个波次 = 骑手 + 车辆温区 + 清单 + 计划封车时刻 + 全过程留痕 */
export interface Wave {
  id: string;
  waveNo: string;
  rider: string;
  vehicleZone: TempZone;
  plannedSealAt: string; // YYYY-MM-DD HH:mm
  manifest: ManifestItem[];
  scans: ScanEntry[];
  issues: IssueRecord[];
  audit: AuditEntry[];
  status: WaveStatus;
  round: number;
  verifiedAt?: string;
  seal?: SealInfo;
  createdAt: string;
}

export const WAVE_STATUS_META: Record<WaveStatus, { label: string; type: "success" | "warning" | "info" }> = {
  verifying: { label: "待核验", type: "info" },
  pending: { label: "待处理", type: "warning" },
  sealed: { label: "已封车", type: "success" }
};

export const ISSUE_TYPE_META: Record<IssueType, { label: string; type: "danger" | "warning" | "info" }> = {
  missing: { label: "缺件", type: "danger" },
  extra: { label: "多件", type: "warning" },
  zone: { label: "温区不符", type: "danger" },
  unknown: { label: "无资料", type: "info" }
};
