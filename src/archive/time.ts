// 本地留档层：时间格式化与生成工具
export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nowText(): string {
  return formatDateTime(new Date());
}

export function hoursFromNow(hours: number): string {
  return formatDateTime(new Date(Date.now() + hours * 3600000));
}

export function formatIso(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDateTime(date);
}

export function newId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${uuid}`;
}
