---
title: Reseller 對賬自動化實戰：用阿里雲 Agency API 把月度對賬從「人工下載」變成一條流水線
author: Ted
date: 2026-10-08
tags:
  - 阿里雲
  - ACPN
  - Agency API
  - Reseller
  - 對賬自動化
summary: 以真實 202607 賬期樣本（53 個 End User、2238 行）為依據，拆解 ACPN 專屬 Agency OpenAPI 的三條數據路徑選型、賬單勾稽規則與三類特殊行處理，並給出 FastAPI + SQLite 單容器對賬系統的工程實現與避坑清單。
---

# Reseller 對賬自動化實戰：用阿里雲 Agency API 把月度對賬從「人工下載」變成一條流水線

> 系列：澳門企業上雲實戰 · 第 2 篇
> 關鍵詞：阿里雲、ACPN、Agency OpenAPI、Reseller、對賬自動化、GetMonthlyBill、SubscriptionBill

## 一、背景：Reseller 的兩層對賬痛點

我們是阿里雲國際站（alibabacloud.com）的 **Reseller**。Reseller 的計費鏈條是「阿里雲按月開票給我司 → 我司再開票給 End User」，因此每月的對賬天然是**兩層**：

- **上游對賬（成本端）**：核對阿里雲開給我司的夥伴賬單（Partner Statement / Invoice）；
- **下游對賬（收入端）**：核對每個 End User 的消費明細與應收（Customer Statement / End User Monthly Statement）。

過去這件事完全靠人工：每月登錄 ACPN 控制台（acpn.alibabacloud.com），在 Finance Center 裡篩選賬期、點導出、等異步任務、下載 Excel，再由物流部和採購部人手核對 cost / unit price / discount / special discount。五十多個 End User、兩千多行明細，耗時大且容易錯。

這篇文章記錄我們把這條鏈路徹底自動化的過程：從**發現 ACPN 其實有一套專屬 OpenAPI**，到解剖真實賬單樣本、設計對賬系統、落地工程實現。所有 API 信息來自官方一手來源（API Explorer 元數據 + 官方文檔），並用**真實的 202607 賬期樣本（53 個 End User、127 個產品、2238 行）**做了字段級驗證。

## 二、關鍵發現：ACPN 有專屬 OpenAPI——Agency 產品

這是整個項目最重要的結論，也是很多合作夥伴不知道的事：**阿里雲為生態夥伴提供了專屬 OpenAPI 產品，產品代碼 `Agency`**（名稱「阿里雲生態夥伴」，國際站文檔標題為 PartnerCenter）。控制台能做的事，基本都有對應 API。

- **API Explorer 門戶**：`api.alibabacloud.com/product/Agency`
- **服務端點**：`agency.ap-southeast-1.aliyuncs.com`（國際站，新加坡）
- **兩個版本**：`2022-12-16`（43 個 API，主版本）、`2025-02-27`（11 個 API，新增佣金/訂單/續費率/客戶小記）
- **認證**：標準 AK/SK 簽名；RAM 權限前綴 `agency:`，操作級授權（如 `agency:GetMonthlyBill`）；**必須用具備 Reseller/Distributor 資質的夥伴主賬號憑證**

對賬直接相關的三個 API：

### 2.1 GetMonthlyBill —— 手工下載的 API 版

僅限 Reseller / Distributor。三個必填參數：

| 參數 | 說明 |
|------|------|
| `Month` | 賬期，格式 `YYYY-MM` |
| `BillOwner` | `1`=主賬號（夥伴自身，對應 Partner Statement）；`2`=子賬號（End User） |
| `BillType` | 枚舉見下 |

`BillType` 枚舉中与對賬最相關的：

| 值 | 含義 |
|----|------|
| `MonthlyInvoice` | 月度發票/對賬單（主體） |
| `MonthlyInstanceConsumeV2` | **實例消費賬單 V2**——文件名與手工下載的「End User Monthly Instance StatementV2」的 V2 後綴完全對應，即現有手工文件的 API 入口 |
| `MonthRefundInvoice` / `MonthlyInstanceRefundBill` | 退款發票 / 實例退款賬單 |
| `MarginReportV2` | 毛利報告 V2（折扣/毛利結構的補充視角） |

返回體直接給出 `InvoiceLink`（PDF）、**`BillLinkCSV`、`BillLinkXLSX`**（結構化文件的簽名下載鏈接）。一次調用即可程序化下載，**完全繞開控制台登錄與異步導出任務**。

### 2.2 SubscriptionBill —— 賬單訂閱推送到自有 OSS（長期首選）

把多級賬單文件**主動推送到夥伴自有 OSS Bucket**：

- `SubscribeType` 枚舉：`PartnerBillingItemDetailForBillingPeriod`（**計費項級明細，最細粒度，單價最可能在此**）、`PartnerBillingItemDetailMonthly`、`PartnerInstanceDetailForBillingPeriod`、`PartnerInstanceDetailMonthly`
- `BeginBillingCycle` 最多回溯 6 個月；`BillFormat` 支持 `csv` / `parquet`；超過 `SubscribeSegmentSize` 自動拆文件
- 推送機制：訂閱次日開始每日推上一日文件；**每月 5 號推上月整賬期全量**；延遲文件次日補推
- 需給訂閱賬號授予 `AliyunConsumeDump2OSSRole` 角色
- ⚠️ 文檔措辭為「請確保調用者是國際阿里雲**總經銷商**夥伴」——普通 Reseller 是否可訂閱需實測確認

### 2.3 BssOpenApi —— 第二條路徑（單價級交叉核對）

通用賬務 API，端點 `business.ap-southeast-1.aliyuncs.com`，面向**賬號自身**賬單。與 Agency 的區別：BssOpenApi 是「賬務中心視角」，Agency 是「渠道夥伴視角」；我們對賬單的口徑（含夥伴折扣、Coupon、Rounding-Down）以 Agency 側為準。

其中 `DescribeInstanceBill` 在 `IsBillingItem=true` 時會返回 **`ListPrice` / `ListPriceUnit` / `Usage`**——這是拿到**單價**的關鍵開關。注意時效：**最終賬单次月第 3 天 12:00 後可用**；分頁為 NextToken 模式，`MaxResults` 上限 300；限流約 10 QPS。

### 2.4 三條路徑怎麼選

| 路徑 | 粒度 | 獲取方式 | 時效 | 定位 |
|------|------|----------|------|------|
| A. Agency `SubscriptionBill` | 計費項級 | 自動推 OSS | 每日增量 + 5 號全量 | 長期首選 |
| B. Agency `GetMonthlyBill` | 實例級（=現有對賬單） | 按需調用拿鏈接下載 | 賬單生成後即可 | **起步最快，一期採用** |
| C. BssOpenApi `DescribeInstanceBill` | 計費項級（含單價） | 按賬期翻頁拉取 | 次月 3 日 12:00 後終版 | 單價級交叉核對 |

我們的路線：**一期用 B 快速替掉人工下載**（1–2 天即可上線），**二期切 A** 拿計費項級明細，C 作為單價核對的備援。

## 三、解剖真實賬單：202607 樣本告訴我們的五件事

樣本：`End User Monthly Instance StatementV2 202607.xlsx`，單 sheet、2238 行、**24 列**（Consume Time、Billing Cycle、User ID/Name/Account、Bill Source、Order Type、Charge Type、Billing Type、Product Code/Name、Instance ID/Name/Configuration/Tag、Region、Original Cost、SPN Deducted Price、SPN ID、Discount、Discount(%)、Coupon Deduct、Pretax Cost(Before Round Down Discount)、Currency）。

全月匯總（USD）：原價 331,370.99 / 折扣 24,574.40 / 優惠券 6,472.52 / 應付 300,321.65。

**1. 沒有單價列。** 實例級對賬單是匯總視角，無 unit price / usage。要核單價必須走計費項級數據（SubscriptionBill 或 `IsBillingItem=true`）。

**2. Special discount 沒有獨立字段。** 所有折扣合併進 `Discount(%)`（樣本折扣率 0.01~0.6992，即各客戶的協議折扣）。正確做法是商務側維護「客戶×產品×協議折扣率」基準表，與賬單 `Discount(%)` 逐行比對。

**3. 三類特殊行必須分別處理：**

| 行類型 | 行數 | 特徵 |
|--------|------|------|
| Consume | 1992 | 正常消費，逐行滿足 `Pretax = Original − Discount − Coupon − SPN` |
| Rounding-Down | 235 | Order Type=OTHERS；Original/Discount 均為 0；Pretax 為小數尾差負值，**精度最高 10 位小數**（如 −0.3955929096）；全月合計 ≈ −2.43 |
| Refund / DOWNGRADE | 11 | Original 為負、Discount=0、Pretax=Original；**退款不回填原折扣結構**，直接淨額紅沖 |

**4. 勾稽公式嚴格成立：**

```
Pretax(消費行) = Original − Discount − Coupon − SPN
全表應付 = Σ消費行Pretax + ΣRounding-Down尾差 + Σ退款行(負值)
```

樣本中 `Σ(Original−Discount−Coupon−SPN) = 300,324.08`，`Σ(Pretax) = 300,321.65`，差額 2.43 完全由尾差行解釋。這條公式就是入庫校驗的依據。

**5. 解析器必須容忍：** 10 位小數、負值金額、空配置列、用戶名脫敏（如 `edp@lusobank.******`）。以及**一個客戶多個 UID** 是常態（樣本中 Wynn 3 個、AMCM 3 個、MGM 2 個），需要「客戶 ↔ UID」歸組表。

## 四、對賬系統設計：從賬單到「客戶應付金額清單」

![對賬自動化架構圖](/images/reseller-reconciliation-arch.png)

> 配圖說明：上圖為數據管線與角色分工（2160×1040）；向量版見 `/images/reseller-reconciliation-arch.svg`。

澳門沒有發票概念，平台不出發票、不管收款，產出物是**經物流部確認的金額清單**（頁面查看 + Excel 導出）。確認後的核心流程：

```
① 自動：每月 8 號起定時從 Agency API 拉取賬單 → 解析 → 勾稽校驗 → 入庫（失敗重試）
② 銷售：登錄系統，為名下客戶錄入 SO number + Ratio（可選 AI 錄入產品級費率）
③ 物流：點「生成金額草稿」→ 系統按客戶匯總賬單淨額 × ratio → 草稿清單
④ 物流：核對後直接確認（無審批）→ 最終金額清單，可選匯率換算 HKD/MOP
⑤ 物流：導出 Excel，沿用現有方式向客戶收費
```

### 4.1 金額計算引擎（核心邏輯）

```
客戶成本(USD) = Σ[該客戶全部 UID 的賬單行 Pretax Cost]
              （含消費行、退款負數行、Rounding-Down 尾差行）

無產品級費率：  應付 = 客戶成本 × (1 + ratio)      # ratio 可正(加成)可負(折扣)
有產品級費率：  應付 = Σ[例外產品淨額 × (1+產品ratio)] + [其餘淨額 × (1+客戶ratio)]
可選換算：      應付(HKD/MOP) = 應付(USD) × 當月手工維護匯率
```

兩個已確認的業務規則值得強調：**優惠券是淨額加成**——ratio 套用在扣券後的淨額（即 `Pretax Cost`）上，而 `Pretax = Original − Discount − Coupon − SPN` 本身就是淨額，因此無需額外處理優惠券；**退款當月直接抵減**——負數行直接計入客戶當月匯總，不做結轉。

### 4.2 鎖定與冪等：無審批流程下的底線控制

- **草稿可重算**：確認前同一賬期可反覆重新生成（覆蓋草稿），便於訂單補錄後重算；
- **確認即鎖定**：記錄確認人 / 時間 / 所用匯率 / 訂單版本；鎖定後再生成需管理員解鎖並留痕；
- **金額可追溯**：清單中任一客戶金額可下鑽到賬單明細行、所用訂單（SO）與版本、匯率。

### 4.3 生成草稿時的自動異常檢查

| 異常 | 處理 |
|------|------|
| 賬單出現未歸組的新 UID | 阻止生成，提示先掛到客戶下 |
| 客戶無生效訂單（沒錄 ratio） | 標紅列示、不出金額，提示銷售補錄 |
| 客戶當月淨額為負 | 照常顯示負數並醒目標記（已確認當月抵減） |
| 賬單勾稽不平 | 入庫時校驗勾稽公式，不平則告警 |
| 環比突變（如 ±50%） | 提示物流覆核，不阻止 |

### 4.4 角色與審計

三角色：管理員（配置/匯率/解鎖/審計）、物流（生成/確認/導出）、銷售（僅本人名下客戶的訂單與數據）。審計為**只追加**三類事件：用戶行為（所有登錄含失敗、訂單修改含 ratio 前後值、確認/解鎖/導出、匯率修改）、數據拉取（每一次同步與拉取的成功/失敗/重試/行數/耗時）、數據生成（每一次草稿生成的觸發人/賬期/客戶數/是否覆蓋）。

## 五、工程實現

技術棧：**Python 3.12 + uv / FastAPI / SQLAlchemy 2 + Alembic / SQLite(WAL) / APScheduler / openpyxl / cryptography / Vue 3 + Element Plus**，前後端打包進**單容器**（Docker 多階段：node 構建前端 → uv python 運行後端，uvicorn 8000）。選 SQLite(WAL) + 單容器是為了讓物流部在內網一台機器上就能跑，運維成本最低。

### 5.1 調用 GetMonthlyBill 並下載

```python
from alibabacloud_agency20221216.client import Client as AgencyClient
from alibabacloud_tea_openapi.models import Config
import httpx

cfg = Config(
    access_key_id=ak, access_key_secret=sk,
    endpoint="agency.ap-southeast-1.aliyuncs.com",
)
client = AgencyClient(cfg)

resp = client.get_monthly_bill(GetMonthlyBillRequest(
    month="2026-07", bill_owner="2", bill_type="MonthlyInstanceConsumeV2",
))
xlsx_url = resp.body.bill_link_xlsx          # 簽名下載鏈接
with httpx.Client() as http:
    data = http.get(xlsx_url).content        # 程序化下載，無需登錄控制台
```

### 5.2 解析與勾稽校驗：金額一律 Decimal

```python
from decimal import Decimal
import openpyxl

ZERO = Decimal("0")
rows = list(openpyxl.load_workbook(io.BytesIO(data)).active.iter_rows(values=True))
header, body = rows[0], rows[1:]

tot_orig = tot_disc = tot_coupon = tot_spn = tot_pretax = ZERO
for r in body:
    d = dict(zip(header, r))
    orig   = Decimal(str(d["Original Cost"] or 0))
    disc   = Decimal(str(d["Discount"] or 0))
    coupon = Decimal(str(d["Coupon Deduct"] or 0))
    spn    = Decimal(str(d["SPN Deducted Price"] or 0))
    pretax = Decimal(str(d["Pretax Cost(Before Round Down Discount)"] or 0))
    # 消費行逐行勾稽；尾差行/退款行單獨歸集
    if d["Order Type"] != "OTHERS" and orig != 0:
        assert abs((orig - disc - coupon - spn) - pretax) <= Decimal("0.01")
    tot_orig += orig; tot_disc += disc; tot_coupon += coupon
    tot_spn += spn;   tot_pretax += pretax

# 月級勾稽：差額應等於尾差行合計
diff = (tot_orig - tot_disc - tot_coupon - tot_spn) - tot_pretax
```

**金額全鏈路禁用 float**：入庫保留全精度（樣本最高 10 位小數），展示/導出才按 2 位小數四捨五入。用 float 累加兩千行尾差，誤差會直接吃掉對賬的可信度。

### 5.3 憑證安全：配置中心 AES-256-GCM 加密入庫

AK/SK 與 AI 服務配置不落地明文：以應用主密鑰（`APP_SECRET` 派生）做 **AES-256-GCM** 加密後入庫，頁面僅脫敏展示，並提供「連接測試」按鈕驗證憑證有效性；所有配置變更寫審計。

## 六、避坑清單

| 坑 | 說明與對策 |
|----|-----------|
| **時效三口徑不一致** | 控制台月度數據次月 6 日後精確；SubscriptionBill 5 號推全量但可能補推；BssOpenApi 3 號 12:00 後終版。我們將調度定在**每月 8 號起**並失敗重試 |
| **控制台導出 10 小時限制** | 同一查詢條件 10 小時內不可重複導出——API 化後此限制不再相關 |
| **10 位小數 + 負值** | 全鏈路 Decimal；容差建議 ±0.01/行、±0.1/月 |
| **無單價列** | 實例級沒有；核單價走 SubscriptionBill 計費項明細或 `IsBillingItem=true` |
| **special discount 無獨立字段** | 維護合同折扣基準表，與 `Discount(%)` 逐行比對 |
| **BillOwner / BillType 枚舉易錯** | `BillOwner=2` 才是 End User；`MonthlyInstanceConsumeV2` 才對應現有對賬單 |
| **SubscriptionBill 資質措辭** | 文檔寫「總經銷商」，普通 Reseller 需實測確認 |
| **新版 SDK 命名不一致** | `alibabacloud_*` 新 SDK 的方法名與響應屬性命名不統一（如方法 `describe_vswitches` 但屬性為 `v_switch_id`），以各產品元數據為準，不要憑慣例猜 |
| **一客戶多 UID** | 歸組表必做；新 UID 自動標「待歸組」並阻止生成草稿 |
| **退款行不回填折扣** | 單獨紅沖歸集，不參與折扣率比對 |

## 七、效果與總結

一期驗收的硬指標很樸素：**8 號賬單入庫後，物流點一次「生成草稿」即得到全部客戶的金額清單；每個金額可追溯到賬單行與訂單版本；全程無需手工處理 Excel。** 上線後，月度對賬從「多人多天的人肉下載核對」變成「定時任務 + 一次點擊 + 一次確認」。

回看這個項目，對合作夥伴同行有三點可復用的經驗：

1. **先找 API 再談自動化**：ACPN 的 Agency 產品覆蓋了控制台絕大多數能力，很多人不知道它的存在；
2. **用真實樣本定義規則**：勾稽公式、三類特殊行、精度要求，全部來自對真實賬單的逐行驗證，而非文檔推測；
3. **把合規與留痕做進底層**：無審批流程不等於無控制——鎖定、解鎖留痕、只追加審計，就是財務數據的底線。

---

*下一篇預告：《澳門中小企上雲成本優化實戰》——RI / Saving Plan 怎麼買、多幣種計費怎麼管，把對賬工具沉澱的成本可視化能力變成省錢動作。*
