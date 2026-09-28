<script setup lang="ts">
import { ref, watch } from "vue";
import { useDispatchStore } from "./stores/dispatch";
import WaveList from "./components/WaveList.vue";
import CheckPanel from "./components/CheckPanel.vue";
import PackageRegistry from "./components/PackageRegistry.vue";
import ArchiveLedger from "./components/ArchiveLedger.vue";

type Tab = "check" | "packages" | "ledger";

const store = useDispatchStore();

const tab = ref<Tab>(
  (localStorage.getItem("dispatch-check:tab") as Tab | null) ?? "check"
);
const rememberedWave = localStorage.getItem("dispatch-check:selectedWave");
const selectedWaveId = ref<string>(
  rememberedWave && store.waves.some((w) => w.id === rememberedWave)
    ? rememberedWave
    : store.waves[0]?.id ?? ""
);

watch(tab, (value) => localStorage.setItem("dispatch-check:tab", value));
watch(selectedWaveId, (value) => {
  if (value) localStorage.setItem("dispatch-check:selectedWave", value);
});

function openWave(id: string) {
  selectedWaveId.value = id;
  tab.value = "check";
}

const operatorDraft = ref(store.operator);
function saveOperator() {
  store.setOperator(operatorDraft.value);
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">末端配送 · 出车前最后一道关</p>
          <h1>出车核验台</h1>
          <p class="subtitle">
            分单结果逐件扫核：缺件、多件、温区不符一律回待处理区；
            清单与扫件记录全程留痕，确认无误才能封车，封后改动必须登记解封原因与复核人。
          </p>
        </div>
        <div class="operator-box">
          <label>
            当班操作人
            <input
              v-model="operatorDraft"
              placeholder="扫码枪账号 / 姓名"
              @change="saveOperator"
              @blur="saveOperator"
            />
          </label>
        </div>
      </header>

      <nav class="nav-tabs">
        <button type="button" :class="{ on: tab === 'check' }" @click="tab = 'check'">
          核验作业
        </button>
        <button type="button" :class="{ on: tab === 'packages' }" @click="tab = 'packages'">
          包裹资料
        </button>
        <button type="button" :class="{ on: tab === 'ledger' }" @click="tab = 'ledger'">
          本地留档
        </button>
      </nav>

      <section v-if="tab === 'check'" class="workspace">
        <WaveList :selected-id="selectedWaveId" @open="openWave" />
        <CheckPanel :wave-id="selectedWaveId" />
      </section>

      <section v-else-if="tab === 'packages'" class="single">
        <PackageRegistry />
      </section>

      <section v-else class="single">
        <ArchiveLedger @reset="openWave" />
      </section>

      <footer class="foot">
        数据仅保存在本站点浏览器（localStorage），可在“本地留档”导出 JSON 交接。
      </footer>
    </div>
  </main>
</template>
