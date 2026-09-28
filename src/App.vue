<script setup lang="ts">
// 城市末端配送 - 出车核验台
// 包裹资料、核验规则、本地留档、操作页面分层组织，重开页面可按骑手和波次核对
import { computed, ref } from "vue";
import ParcelManager from "./components/ParcelManager.vue";
import WaveList from "./components/WaveList.vue";
import VerifyDesk from "./components/VerifyDesk.vue";
import { useParcelStore } from "./packages/store";
import { useWaveStore } from "./archive/store";

const parcelStore = useParcelStore();
const waveStore = useWaveStore();

const parcelVisible = ref(false);

const metrics = computed(() => [
  { label: "配送波次", value: waveStore.waves.length },
  { label: "待处理波次", value: waveStore.waves.filter((wave) => wave.status === "pending").length },
  { label: "已封车波次", value: waveStore.waves.filter((wave) => wave.status === "sealed").length },
  { label: "包裹资料", value: parcelStore.parcels.length }
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业 · 末端配送出车核验</p>
          <h1>出车核验台</h1>
          <p class="subtitle">
            分单完成后逐件扫码核验：缺件、多件或温区不符立即退回待处理区，原分配与已扫记录全部保留；
            确认无误再封车，之后修改只能登记解封原因与复核人。
          </p>
        </div>
        <div class="top-actions">
          <el-button type="primary" plain @click="parcelVisible = true">包裹资料库</el-button>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <WaveList />
        <VerifyDesk />
      </section>
    </div>

    <ParcelManager v-model="parcelVisible" />
  </main>
</template>

<style scoped>
.top-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
