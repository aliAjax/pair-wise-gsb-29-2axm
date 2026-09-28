<script setup lang="ts">
import { reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "../stores/dispatch";
import { ZONE_LABELS, type TempZone } from "../domain/types";
import { fmtDateTime, zoneLabel } from "../utils/format";

const store = useDispatchStore();
const { packages } = storeToRefs(store);

const zones = Object.entries(ZONE_LABELS) as [TempZone, string][];
const keyword = ref("");
const zoneFilter = ref<"ALL" | TempZone>("ALL");
const showAdd = ref(false);
const error = ref("");

const form = reactive({ code: "", customer: "", zone: "AMBIENT" as TempZone });

const filtered = () =>
  packages.value.filter((pkg) => {
    if (zoneFilter.value !== "ALL" && pkg.zone !== zoneFilter.value) return false;
    const kw = keyword.value.trim().toUpperCase();
    if (kw && !pkg.code.toUpperCase().includes(kw) && !pkg.customer.includes(kw.trim())) {
      return false;
    }
    return true;
  });

function addPackage() {
  error.value = "";
  try {
    store.addPackage({
      code: form.code.trim().toUpperCase(),
      customer: form.customer.trim(),
      zone: form.zone
    });
    form.code = "";
    form.customer = "";
    showAdd.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>包裹资料库</h2>
      <button type="button" class="secondary small" @click="showAdd = !showAdd">
        录入包裹
      </button>
    </div>
    <p class="dim hint">
      包裹资料由分单系统维护，核验台只读引用；波次清单保存分单时刻的温区快照，
      资料变更不影响已建波次。
    </p>

    <form v-if="showAdd" class="inline-form horizontal" @submit.prevent="addPackage">
      <label>
        包裹编号
        <input v-model="form.code" placeholder="如 YD100009" required />
      </label>
      <label>
        收件地址
        <input v-model="form.customer" placeholder="收件地址 / 客户" required />
      </label>
      <label>
        要求温区
        <select v-model="form.zone">
          <option v-for="[value, label] in zones" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <button type="submit">保存资料</button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </form>

    <div class="filter-row">
      <input v-model="keyword" placeholder="按编号或地址搜索" />
      <select v-model="zoneFilter">
        <option value="ALL">全部温区</option>
        <option v-for="[value, label] in zones" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
    </div>

    <div class="manifest">
      <div class="manifest-row manifest-head">
        <span>包裹编号</span>
        <span>收件地址</span>
        <span>要求温区</span>
        <span>录入时间</span>
      </div>
      <div v-for="pkg in filtered()" :key="pkg.code" class="manifest-row">
        <span class="mono">{{ pkg.code }}</span>
        <span>{{ pkg.customer }}</span>
        <span>
          <span class="zone-tag" :data-zone="pkg.zone">{{ zoneLabel(pkg.zone) }}</span>
        </span>
        <span class="dim">{{ fmtDateTime(pkg.createdAt) }}</span>
      </div>
      <div v-if="filtered().length === 0" class="empty">暂无匹配包裹</div>
    </div>
  </section>
</template>
