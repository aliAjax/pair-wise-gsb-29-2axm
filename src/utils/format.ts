import { ZONE_LABELS, type AuditLog, type TempZone } from "../domain/types";

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

export function fmtMinute(value: string): string {
  return value ? value.replace("T", " ") : "—";
}

export function zoneLabel(zone: TempZone): string {
  return ZONE_LABELS[zone];
}

/** datetime-local 默认值：当前时刻 +30 分钟，取整到分钟 */
export function defaultPlannedSeal(): string {
  const d = new Date(Date.now() + 30 * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export const ACTION_LABELS: Record<AuditLog["action"], string> = {
  WAVE_CREATE: "建波",
  SCAN: "扫件",
  RETURN: "退回待处理",
  SEAL: "封车",
  UNSEAL: "解封",
  PACKAGE_ADD: "新增包裹"
};

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
