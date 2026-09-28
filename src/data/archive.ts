import type { AuditLog, PackageInfo, Wave } from "../domain/types";
import { SEED_PACKAGES, SEED_WAVES } from "../domain/seed";

// 本地留档层：包裹资料 / 波次核验记录 / 操作日志分 key 存放。
// 波次记录整体覆盖写（内含逐件扫件与封解封留痕）；日志只追加。
// 如需改为服务端归档，只替换本文件即可。

const KEY_PACKAGES = "dispatch-check:packages:v1";
const KEY_WAVES = "dispatch-check:waves:v1";
const KEY_LOGS = "dispatch-check:logs:v1";
const KEY_OPERATOR = "dispatch-check:operator:v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadPackages(): PackageInfo[] {
  return read<PackageInfo[]>(KEY_PACKAGES, SEED_PACKAGES);
}

export function savePackages(packages: PackageInfo[]) {
  write(KEY_PACKAGES, packages);
}

export function loadWaves(): Wave[] {
  return read<Wave[]>(KEY_WAVES, SEED_WAVES);
}

export function saveWaves(waves: Wave[]) {
  write(KEY_WAVES, waves);
}

export function loadLogs(): AuditLog[] {
  return read<AuditLog[]>(KEY_LOGS, []);
}

export function appendLogs(logs: AuditLog[]) {
  const all = loadLogs().concat(logs);
  write(KEY_LOGS, all);
}

export function loadOperator(): string {
  return read<string>(KEY_OPERATOR, "");
}

export function saveOperator(name: string) {
  write(KEY_OPERATOR, name);
}

/** 导出整份留档（包裹资料 + 波次 + 日志），用于站点交接留底 */
export function exportArchive(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      packages: loadPackages(),
      waves: loadWaves(),
      logs: loadLogs()
    },
    null,
    2
  );
}

/** 清空本地留档并恢复演示数据 */
export function resetArchive() {
  localStorage.removeItem(KEY_PACKAGES);
  localStorage.removeItem(KEY_WAVES);
  localStorage.removeItem(KEY_LOGS);
}
