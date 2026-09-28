// 包裹资料层：温区/骑手常量、包裹主数据的种子与本地存取
import type { Parcel, TempZone } from "./types";

export const TEMP_ZONES: readonly TempZone[] = ["常温", "冷藏", "冷冻"];

export const RIDERS: readonly string[] = ["骑手A", "骑手B", "骑手C"];

export const PARCEL_STORAGE_KEY = "hxwlfront-15-parcels";

const SEED_PARCELS: Array<Omit<Parcel, "updatedAt">> = [
  { code: "PKG-1001", rider: "骑手A", zone: "常温", address: "世纪大道 100 号", slot: "10:00-12:00" },
  { code: "PKG-1002", rider: "骑手A", zone: "常温", address: "张杨路 88 号", slot: "10:00-12:00" },
  { code: "PKG-1003", rider: "骑手A", zone: "常温", address: "浦电路 200 号", slot: "14:00-16:00" },
  { code: "PKG-1004", rider: "骑手A", zone: "常温", address: "商城路 618 号", slot: "14:00-16:00" },
  { code: "PKG-1005", rider: "骑手A", zone: "冷藏", address: "崂山路 300 号", slot: "10:00-12:00" },
  { code: "PKG-1006", rider: "骑手A", zone: "冷藏", address: "潍坊路 150 号", slot: "14:00-16:00" },
  { code: "PKG-1007", rider: "骑手A", zone: "冷冻", address: "蓝村路 60 号", slot: "10:00-12:00" },
  { code: "PKG-1008", rider: "骑手A", zone: "冷冻", address: "东方路 900 号", slot: "14:00-16:00" },
  { code: "PKG-2001", rider: "骑手B", zone: "常温", address: "陆家嘴环路 1000 号", slot: "10:00-12:00" },
  { code: "PKG-2002", rider: "骑手B", zone: "常温", address: "银城中路 501 号", slot: "14:00-16:00" },
  { code: "PKG-2003", rider: "骑手B", zone: "冷藏", address: "东园路 18 号", slot: "10:00-12:00" },
  { code: "PKG-2004", rider: "骑手B", zone: "冷冻", address: "富城路 33 号", slot: "14:00-16:00" },
  { code: "PKG-3001", rider: "骑手C", zone: "常温", address: "民生路 1199 号", slot: "10:00-12:00" },
  { code: "PKG-3002", rider: "骑手C", zone: "冷藏", address: "丁香路 425 号", slot: "14:00-16:00" },
  { code: "PKG-3003", rider: "骑手C", zone: "冷冻", address: "迎春路 88 号", slot: "10:00-12:00" }
];

export function seedParcels(): Parcel[] {
  return SEED_PARCELS.map((parcel, index) => ({
    ...parcel,
    updatedAt: new Date(Date.now() - index * 3600000).toISOString()
  }));
}

export function loadParcels(): Parcel[] {
  try {
    const raw = localStorage.getItem(PARCEL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Parcel[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // 留档损坏时回落到种子资料
  }
  return seedParcels();
}

export function saveParcels(parcels: Parcel[]): void {
  localStorage.setItem(PARCEL_STORAGE_KEY, JSON.stringify(parcels));
}

export function parcelByCode(parcels: Parcel[], code: string): Parcel | undefined {
  return parcels.find((parcel) => parcel.code === code);
}
