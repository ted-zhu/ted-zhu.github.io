---
title: 阿里雲 Higress AI Gateway 實戰：把企業 LLM 調用當 API 流量治理
author: Ted
date: 2026-10-12
tags:
  - 阿里雲
  - Higress
  - AI Gateway
  - 百煉
  - MCP
summary: 以開源 AI 網關 Higress 在企業邊界統一接管 LLM 調用：ai-proxy 統一 OpenAI 契約與多 Key 池、ai-token-ratelimit 按消費者配額、ai-cache 語義緩存降本、ai-data-masking 合規脫敏、ai-statistics token 級計量審計；給出組件架構圖、一次請求的完整內外調用 Flow、MCP 托管銜接與生產避坑清單。
---

# 阿里雲 Higress AI Gateway 實戰：把企業 LLM 調用當 API 流量治理

> 關鍵詞：阿里雲 Higress、AI Gateway、ai-proxy、token 限流、語義緩存、MCP、百煉

## 一、背景：LLM 進企業後的第一筆技術債

把大模型接進業務系統很容易——幾十行 SDK 代碼就能跑通對話。但當調用方從一個 demo 變成十個業務系統時，混亂會按固定劇本出現：

- **Key 散落**：每個應用各自保管 API Key，離職與輪換時無人知道總共有幾把；
- **無配額無審計**：某個循環 bug 一夜燒掉整月 token 預算，事後無從追查是誰；
- **供應商鎖定**：模型名與 SDK 寫死在業務代碼裡，換模型等於改代碼發版；
- **成本黑盒**：只知道總賬單，不知道哪個部門、哪個場景在花錢。

這些問題的本質是：**模型調用是一種流量，而流量就該用網關工程來治理**。這篇記錄我們用開源 AI 網關 **Higress** 在企業邊界上統一接管 LLM 調用的實踐：統一協議、按人配額、語義緩存降本、脫敏合規、token 級可觀測，以及多供應商容災。

## 二、為什麼是 Higress

選型時對比過「自研代理層」與「通用 API 網關 + 自寫插件」，最終選 Higress，理由有四：

1. **AI 原生而非事後補丁**：Higress 自定位即 AI Gateway，內建一整族 AI 插件（見下節），不是把 LLM 當普通 HTTP 流量硬套；
2. **出身與生態**：基於 Istio 與 Envoy 的云原生網關，誕生於阿里內部大規模長連接場景，現為 **CNCF Sandbox 項目**；對阿里系模型（通義/百煉）的支持是一等公民；
3. **小團隊友好**：一條 Docker 命令即可拉起，自帶控制台；業務長大後可無縫遷到 Kubernetes Helm 部署；想要託管形態，阿里雲 **MSE 云原生網關**與開源 Higress 同源，官方有兩者對比文檔可循；
4. **MCP 托管**：可通過插件機制托管 MCP（Model Context Protocol）Server，為後續 Agent 工具調用留好統一入口。

落地後的整體組件架構如下——業務系統與 Agent 只面對網關一個入口；網關內部以插件鏈按序完成認證、脫敏、限流、緩存、代理與統計；下游則是百煉、備用供應商與托管的 MCP Server，控制台與可觀測體系掛在旁路：

![阿里雲 Higress AI Gateway 組件架構](/images/higress-ai-gateway-arch.png)

## 三、能力地圖：一族 AI 插件

Higress 的 AI 能力以插件形式組織，實戰中我們按四層使用：

| 層 | 插件 | 作用 |
|----|------|------|
| 接入 | `ai-proxy` | 統一 OpenAI API 契約代理多供應商（qwen/openai/azure/deepseek 等），協議轉換、多 Key 負載與 failover |
| 接入 | `ai-transformer` / `ai-search` / `ai-rag` | 請求/響應改寫、聯網檢索增強、知識庫增強 |
| 治理 | `ai-token-ratelimit` / `ai-quota` | 按 token 的限流與多维度配額 |
| 治理 | `ai-data-masking` / `ai-security-guard` | 請求/響應脫敏（手機號、證件號等）、對接內容安全檢測 |
| 成本 | `ai-cache` | 語義/字符串匹配的響應緩存，直接降 token 賬單 |
| 體驗與觀測 | `ai-statistics` / `ai-history` / `ai-prompt-decorator` / `ai-prompt-template` / `ai-json-response` / `ai-intent` / `ai-agent` | token 與延遲指標、多輪歷史管理、system prompt 注入、模板化、強制 JSON 輸出、意圖路由、Agent 編排 |

不需要一次全上。我們的上線順序是：`ai-proxy` → `ai-token-ratelimit` → `ai-statistics` → `ai-cache` → `ai-data-masking`，每一步都單獨驗收。

## 四、一個請求的生命週期：內外調用的統一 Flow

組件講完，再看一次真實請求如何穿過這條插件鏈。下圖是業務系統（內網客服系統、內部工具、Agent）經網關訪問百煉與備用供應商的完整時序：

![一次完整 LLM 請求 Flow（內外調用統一入口）](/images/higress-ai-gateway-flow.png)

幾個值得展開的設計點：

- **入口只有一個契約**：①業務系統以 OpenAI SDK 呼叫 `POST /v1/chat/completions`，帶的是網關頒發的 consumer key，而非供應商 Key——供應商 Key 從此只存在於網關配置中；
- **治理發生在回源之前**：②–④全部在網關內完成：識別消費者與脫敏、token 配額檢查、語義緩存查詢。④a 命中時請求根本不出網關、不計模型 token——這是緩存降本的物理含義；
- **回源與容災**：⑤–⑦由 `ai-proxy` 做協議轉換與 Key 池選取後轉發上游，SSE 逐塊回傳；⑩超時或 5xx 時按 fallback 規則切備用供應商或備用模型，重走 ⑥–⑨，業務側無感；
- **計量在流尾**：⑧`ai-statistics` 在流式響應結束後匯總 token 與延遲，寫指標與審計——限流是「事前」控制，計量是「事後」歸因，兩者互不替代。

這條時序同時回答了「內外調用」的問題：對內，網關是唯一的模型入口與工具入口（MCP）；對外，網關是唯一的出口與合規檢查點。業務系統不需要知道背後是百煉還是備用供應商，也不需要為切換供應商改一行代碼。

## 五、動手：從一條 Docker 命令到統一入口

### 5.1 部署與入口

本地或內網機器一條命令拉起（生產建議 Helm 進 K8s）：

```bash
curl -sS https://higress.cn/ai-gateway/install.sh | bash
```

起來後有兩個關鍵面：**控制台**（默認 `http://localhost:8001/`，路由、插件、AI 服務均可視化配置）與**統一推理入口**（默認 `http://localhost:8080/v1/chat/completions`）。對業務系統而言，從此只有一個 base_url——就是網關自己。

### 5.2 接入百煉：ai-proxy 與多 Key 池

`ai-proxy` 實現基於 OpenAI API 契約的代理：業務側繼續用 OpenAI SDK，只需把 base_url 指向網關。接入通義/百煉的配置核心：

```yaml
provider:
  type: qwen                # 通義千問/百煉；另有 openai、azure 等
  apiTokens:
    - 'sk-xxxx-1'           # 多 Key：隨機選取，分散限流與配額
    - 'sk-xxxx-2'
  modelMapping:
    '*': 'qwen-plus'        # 客戶端傳任意模型名都映射到 qwen-plus
  timeout: 60000
```

三個實戰要點：

- **多 Key 不是為了炫技**：單 Key 的 QPM/TPM 限流是硬約束，多 Key 池 + 隨機選取是最簡單的擴容手段；配合 Key 級 failover 開關，某 Key 失效自動切換；
- **`modelMapping` 是治理槓桿**：`'*'` 全映射適合「網關決定模型」階段；放開部分映射（如 `qwen-max` 直通）適合給高級場景留口子——但務必白名單化，否則客戶端隨意傳名會繞過分層路由；
- **protocol 默認 `openai`**：即對外永遠 OpenAI 契約；設 `original` 則透傳供應商原生協議，僅在需要供應商私有參數時用。

控制台裡還可直接配置 **AI 路由的 fallback**：主供應商異常（超時/5xx）時切備用供應商或備用模型，這是「不被單一供應商綁架」的落地形態。

### 5.3 按人配額：ai-token-ratelimit

限流單位是 **token 而非 QPS**——這才是 LLM 的成本與容量單位。插件基於 Redis 計數：

```yaml
rule_name: llm-consumer-limit
global_threshold:
  token_per_minute: 200000   # 全路由每分鐘 token 上限
redis:
  service_name: redis.static
  service_port: 6379
```

在全局閾值之外，用 `rule_items` 可按 consumer（配合 key-auth 的消費者體系）、按 header、按 cookie 等维度細分 `limit_keys`，實現「客服系統每分鐘 10 萬 token、內部工具 2 萬」這類差異化配額。兩條教訓：限流鍵一定要綁到**消費者身份**而不是 IP（辦公網出口 IP 全員共享）；Redis 不可用時的降級行為（放行還是拒絕）要提前決策並演練，別等故障當晚才討論。

### 5.4 降本：ai-cache 語義緩存

客服場景大量問題是重複的（營業時間、退改政策）。`ai-cache` 支持語義相似度匹配命中歷史響應，命中即不回源：純知識類意圖的命中率實測可观，直接反映在 token 賬單上。使用邊界要劃清：**帶個人上下文與多輪狀態的請求不進緩存**；我們用 `ai-intent` 先分意圖，知識類走緩存鏈路、事務類走實時鏈路。緩存鍵還應帶上知識庫版本號，知識更新後整體失效，避免「舊答案正確地過期」。

### 5.5 合規：ai-data-masking 與審計計量

澳門《個人資料保護法》背景下，我們要求**個人資料不出企業邊界進入模型**：`ai-data-masking` 在請求離開網關前對手機號、證件號等做攔截或替換，響應側同理回填。配合 `ai-statistics` 按 consumer 維度採集 token 用量與延遲指標：對內做部門計量與異常告警（某 consumer token 環比突增 3 倍即告警），對外滿足審計要求。這組合把「AI 合規」從口號變成網關上的兩行配置加一張報表。

### 5.6 觀測與體驗層插件

`ai-statistics` 之外，三個小插件性價比極高：`ai-prompt-decorator` 在網關層統一注入 system prompt（語言約束、術語表、合規聲明——多語場景實踐中的 prompt 紀律落到這裡，業務代碼不再各自維護）；`ai-json-response` 強制結構化輸出，下游解析不再賭運氣；`ai-history` 托管多輪歷史與上下文窗口裁剪，無狀態業務系統直接獲得對話能力。

## 六、與 MCP 和 Agent 的銜接

Higress 可通過插件机制托管 MCP Server：企業內部的工具（查訂單、查庫存、開工單）以 MCP 形式掛到網關，Agent 的工具調用與模型調用走同一套認證、限流與審計。這意味著**工具治理能力復用模型治理能力**——不需要為 Agent 再建一套體系。我們目前把只讀查詢類工具先行掛入，寫操作工具仍走人工審批鏈路。

## 七、生產檢查單與避坑

| 坑 | 說明與對策 |
|----|-----------|
| 流式（SSE）被緩衝 | 確認網關對 streaming 響應不 buffering、超時窗口足夠長；首字延遲劣化先查這裡 |
| 流式下 token 統計 | 用量在流尾回傳，確認 `ai-statistics` 對 stream 的解析與超時截斷行為 |
| 緩存命中個人化請求 | 用意圖分流劃定緩存邊界；緩存鍵帶知識版本 |
| Redis 單點 | 限流/配額/緩存都依賴 Redis：高可用部署 + 降級預案演練 |
| Key 安全 | apiTokens 在網關配置中：配置加密、最小權限、定期輪換；consumer 側 key-auth 必開，入口不對公網裸奔 |
| modelMapping 誤傷 | 白名單化映射，監控「被改寫模型名」的請求占比 |
| fallback 語義不清 | 明確觸發條件（超時/5xx/特定 4xx）與備用鏈路，定期演練切換 |
| 插件順序 | 脫敏應在代理之前、統計在最後；調整順序後回歸測試 |
| 版本升級 | 控制台/引擎/插件版本配套升級，staging 先驗；關注上游 release notes |
| 把網關當銀彈 | 網關治理調用，不治理 prompt 質量：評測集與回歸（見多語篇）仍不可少 |

## 八、總結

Higress 給我們的最大價值，是把「調用大模型」從各業務系統的私事，變成企業邊界上的一件公事：協議統一在 `ai-proxy`，配額統一在 `ai-token-ratelimit`，成本優化統一在 `ai-cache`，合規統一在 `ai-data-masking`，計量審計統一在 `ai-statistics`，而業務代碼始終只面對一個 OpenAI 契約的 base_url。小團隊用一條 Docker 命令起步，長大後進 K8s 或遷阿里雲 MSE 託管——治理體系不變，變的只是承載形態。

模型會繼續迭代，供應商會繼續變動；把變化擋在網關後面，業務系統才能睡得安穩。
