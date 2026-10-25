---
title: 澳門多語場景下的 Qwen 與百煉實戰
author: Ted
date: 2026-10-12
tags:
  - 阿里雲
  - 百煉
  - Qwen
  - 多語
  - RAG
summary: 面向澳門「粵語口語＋繁中書面＋葡語＋英語」的混合業務語言環境，記錄以百煉國際站（新加坡地域）＋ Qwen 模型族落地多語智能客服的實踐：OpenAI 兼容端點遷移、分層模型路由、zh-Hant 與 pt-PT 約束、qwen-mt 術語/翻譯記憶/領域三開關、分語言 RAG 知識庫與三語評測閉環，附參考架構圖與避坑清單。
---

# 澳門多語場景下的 Qwen 與百煉實戰

> 關鍵詞：阿里雲、百煉、Qwen、OpenAI 兼容、多語、RAG、qwen-mt

## 一、澳門的多語現實：一個客服問題，三種語言

澳門的日常業務語言是**粵語口語 + 繁體書面中文 + 葡萄牙語 + 英語**的混合體：政府與法律文件繁中、葡語並行，旅遊與零售面對國際旅客，內部系統與供應商文檔又多是英文或簡體。對企業來說，這意味著同一份知識要服務三種以上語言的用戶，而雙語人才貴且難招——「把 AI 用進多語場景」在澳門不是錦上添花，是剛需。

典型場景包括：旅遊與度假區的旅客諮詢、零售與電商的多語商品與售後、公共機構與企業的繁葡雙語文件服務、內部知識庫的多語問答。這篇記錄我們用**阿里雲百煉（Model Studio）國際站 + Qwen 模型族**落地這類需求的實踐與踩坑。

## 二、為什麼選百煉國際站

三個決定性理由：

1. **數據合規邊界清晰**：國際站業務空間可選**新加坡地域**，對澳門企業而言是距離與法域上都較易解釋的選擇；
2. **OpenAI 兼容接口**：現有基於 OpenAI SDK 的代碼幾乎零改造遷移，團隊學習成本最低；
3. **模型矩陣完整**：從旗艦推理、長文檔、視覺、全模態到**專用翻譯模型與語音模型**，一個平台覆蓋多語應用全鏈路。

一個必須知道的現狀：**新加坡地域推出了業務空間專屬域名**，官方建議從舊域名遷移（舊域名仍可正常使用）：

```
舊：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
新：https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

`{WorkspaceId}` 為業務空間 ID，在百煉控制台的業務空間詳情頁可查看。另一個高頻坑：**北京與新加坡地域的 API Key 不通用**，跨地域復用 Key 會直接 401。

## 三、快速開始：兼容模式調用

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),   # 新加坡地域的 Key
    base_url="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
)

resp = client.chat.completions.create(
    model="qwen-plus",
    messages=[
        {"role": "system", "content":
         "你是澳門某度假村禮賓助手。一律以繁體中文（zh-Hant）回覆；"
         "若用戶以葡萄牙語或英語提問，則以對應語言回覆，"
         "葡萄牙語使用歐洲葡語（pt-PT）書寫習慣。"},
        {"role": "user", "content": "請問溫泉設施幾點開放？"},
    ],
    stream=True,
)
for chunk in resp:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### 模型選型表

| 模型 | 上下文 | 適用 |
|------|--------|------|
| `qwen3-max` | 256K | 複雜推理、投訴升級、多步驟任務 |
| `qwen-plus` | 1M | 默認客服對話、摘要、改寫（均衡之選） |
| `qwen-flash` | 1M | 高頻簡單問答、意圖分類、語言識別 |
| `qwen-long` | 10M | 超長合同/章程/歷史檔案閱讀 |
| `qwen-vl-max` | 128K | 單據、告示牌、菜單等圖片理解 |
| `qwen-omni-turbo` | 32K | 語音+視覺輸入的全模態場景 |
| `qwen-mt-plus / flash` | 16K | **專用翻譯**：支持術語干預、翻譯記憶、領域提示 |
| `qwen-audio-3.0-asr / tts` 系列 | — | 語音識別 / 語音合成（語種支持以官方列表為準） |

我們的默認路由：`qwen-flash` 做語言識別與意圖分類（便宜、快），`qwen-plus` 承接主對話，置信度低或用戶情緒升級時切 `qwen3-max`。**分層路由通常能把 token 成本降一個數量級**，而用戶體驗無感。

## 四、多語質量的三道坎

### 4.1 輸出語言漂移

模型在長對話中會「漂」回簡體或混語。對策三層：system prompt 顯式聲明目標語言與書寫體系（zh-Hant / pt-PT / en）；回覆出口做**語言檢測校驗**（輕量模型或規則），不符則帶提示重試一次；關鍵對外文案（通知、電郵）不走自由生成，走模板 + 槽位填充。

### 4.2 歐洲葡語 vs 巴西葡語

澳門的葡語是**歐洲葡語（pt-PT）**，而通用語料以 pt-BR 佔優，模型默認傾向巴西寫法（詞彙、代詞 placement 都不同）。對策：prompt 與術語表雙重聲明 pt-PT；涉及正式文件時用翻譯模型並帶術語與領域提示（見下）；驗收環節請葡語母語者抽檢並沉澱成反例庫。

### 4.3 術語一致性：qwen-mt 的三個開關

專用翻譯模型 `qwen-mt` 在 `translation_options` 中提供三個實戰價值極高的參數：**`terms`（術語對干預）**、**`tm_list`（翻譯記憶句對，few-shot）**、**`domains`（領域風格描述）**。澳門場景的例子：

```python
resp = client.chat.completions.create(
    model="qwen-mt-plus",
    messages=[{"role": "user", "content": "本酒店之水療中心逢星期一暫停服務。"}],
    extra_body={"translation_options": {
        "source_lang": "Chinese",
        "target_lang": "Portuguese",
        "terms": [
            {"source": "水療中心", "target": "centro de spa"},
            {"source": "禮賓部", "target": "concierge"},
        ],
        "domains": "Hotelaria e turismo em Macau; português europeu (pt-PT), registo formal.",
    }},
)
```

對話類模型（qwen-plus 等）沒有這三個開關，但同樣的思路適用：把術語表放進 system prompt 或 RAG 檢索內容，並用 few-shot 句對錨定風格。

## 五、RAG：三語知識庫是質量下限

多語客服的質量下限不在模型，在知識庫。我們的做法：

- **知識源三語並存但分語言建庫**：繁中、葡、英文檔各自切片入庫，檢索時先用識別出的語言選對應子庫，再做混合檢索；混裝一個庫會顯著稀釋召回精度；
- **切片對齊表格與條款**：政府/法律類文檔按條款邊界切片，保留編號，回覆強制帶出處引用；
- **檢索不到就說不知道**：設定閾值與兜底話術（三語），寧可轉人工不編造——這在涉及費用、時間、法規的回答上是底線；
- 知識庫之上封裝**智能體應用**，通過應用調用接口（`/api/v1/apps/{appId}/completion`）對前端暴露單一入口，檢索策略在控制台迭代而不改代碼。

## 六、參考架構

![澳門多語智能客服參考架構](/images/macau-multilingual-ai-arch.png)

要點：語言識別與分層路由放在**自己的網關層**而不是依賴模型自述；模型層、知識庫、術語表三者解耦，可獨立迭代；所有對話落審計日誌，並持續沉澱**三語評測集**——每次換模型或改 prompt，先跑評測集再上線。

## 七、成本與穩定性

- **分層路由 + 緩存**：高頻問答命中緩存直接返回（帶 TTL 與知識庫版本號）；語言識別、意圖分類用 `qwen-flash`；
- **流式輸出**：客服體驗的體感延遲一半來自首字時間，一律 stream；
- **限流與降級**：為每類入口設 QPS 與 token 預算；模型超限時降級到下一檔並記錄，而不是直接報錯；
- **Key 與配額管理**：API Key 入配置中心加密存儲、按環境隔離；新加坡/北京 Key 分開管理，杜絕混用；
- **版本策略**：生產固定模型快照版本，評測通過才切換，避免 `latest` 類別名帶來的行為漂移。

## 八、避坑清單

| 坑 | 說明與對策 |
|----|-----------|
| API Key 地域混用 | 北京與新加坡 Key 不通用；按環境配置並標註地域 |
| 端點遷移 | 新加坡建議遷至 `{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`；舊域名仍可用但新項目直接用新域名 |
| 繁體漂移 | system 聲明 zh-Hant + 出口語言檢測 + 重試；對外文案走模板 |
| pt-BR 默認傾向 | 聲明 pt-PT + 術語表 + 母語抽檢反例庫 |
| 三語混庫召回差 | 分語言建子庫，按識別語言檢索 |
| 翻譯術語不統一 | qwen-mt 用 `terms`/`tm_list`/`domains`；對話模型用 system 術語表 |
| 模型別名行為漂移 | 生產固定快照版本，評測集回歸後再切 |
| 語音能力過承諾 | ASR/TTS 語種支持以官方語言列表為準，粵語等需求先實測再承諾 |
| 無評測就上線 | 建三語評測集（每語言數十至數百條），換模型/改 prompt 必跑 |

## 九、總結

澳門的多語 AI 落地，技術選型只佔三成：選國際站新加坡地域劃清合規邊界、用兼容模式降低遷移成本、用模型矩陣覆蓋全模態。剩下七成是**語言工程**：zh-Hant 與 pt-PT 的顯式約束、術語與翻譯記憶的干預、分語言知識庫、以及一套跑得起來的三語評測集。把這七成做扎實，多語客服才從「能對話」變成「可上線」。
