// 包裹资料状态：主数据的增删与持久化（操作动作由页面触发）
import { ref } from "vue";
import { defineStore } from "pinia";
import { loadParcels, saveParcels } from "../packages/catalog";
import type { Parcel, TempZone } from "../packages/types";

export interface ParcelInput {
  code: string;
  rider: string;
  zone: TempZone;
  address: string;
  slot: string;
}

export const useParcelStore = defineStore("parcels", () => {
  const parcels = ref<Parcel[]>(loadParcels());

  function persist() {
    saveParcels(parcels.value);
  }

  function find(code: string): Parcel | undefined {
    return parcels.value.find((parcel) => parcel.code === code);
  }

  /** 返回错误文案，null 表示成功 */
  function addParcel(input: ParcelInput): string | null {
    const code = input.code.trim();
    if (!code) return "包裹编号不能为空";
    if (find(code)) return `包裹编号 ${code} 已存在`;
    parcels.value.unshift({ ...input, code, updatedAt: new Date().toISOString() });
    persist();
    return null;
  }

  function removeParcel(code: string): void {
    parcels.value = parcels.value.filter((parcel) => parcel.code !== code);
    persist();
  }

  return { parcels, find, addParcel, removeParcel };
});
