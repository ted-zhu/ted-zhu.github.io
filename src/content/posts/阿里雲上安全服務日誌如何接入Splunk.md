---
title: 阿里雲上安全服務日誌如何接入Splunk
author: Ted
date: 2024-10-24 16:14:32
tags:
---
# 阿里雲上安全服務日誌如何接入Splunk



## 背景

客戶本地正在使用Splunk做SOC, 希望阿里雲雲上安全日誌同時接入Splunk

## 需求

阿里雲日誌服務上的日誌投遞到Splunk

## 方案

阿里雲日誌放到本地Splunk上, 可以有兩種實現方式。

1. 通過Splunk安裝alibaba cloud插件來從日誌服務進行實時日誌消費

2. 通過日誌服務把日誌壓縮放到OSS, 從OSS下載到本地, 通過Script來壓縮日誌文件並投遞到Splunk

   

### 方案1

![image-20241024161518403](https://p.ipic.vip/k51hmw.png)

準備好AK, 權限只給到日誌服務相關的RAM account, project name改為日誌服務的project name, logstore name改為日誌服務的logstore name。

```plaintext
{
  "Version": "1",
  "Statement": [
    {
      "Action": [
        "log:ListShards",
        "log:GetCursorOrData",
        "log:GetConsumerGroupCheckPoint",
        "log:UpdateConsumerGroup",
        "log:ConsumerGroupHeartBeat",
        "log:ConsumerGroupUpdateCheckPoint",
        "log:ListConsumerGroup",
        "log:CreateConsumerGroup"
      ],
      "Resource": [
        "acs:log:*:*:project/<Project name>/logstore/<Logstore name>",
        "acs:log:*:*:project/<Project name>/logstore/<Logstore name>/*"
      ],
      "Effect": "Allow"
    }
  ]
}
```

- 在Splunk Web UI頁面中，點擊**Alibaba Cloud Log Service Add-on for Splunk**。
- 配置全局帳號，配置AK
- 创建Data Input，輸入對應的參數



## 方案2

首先創建日誌服務投遞到OSS, 因為投遞到OSS時對原始數據進行壓縮了, 再把壓縮文件下載到本地, 實際上outbound費用是減少了

![image-20241024161016216](https://p.ipic.vip/rg3q5v.png)

接著再在本地通過解壓文件，再作為數據源投遞到Splunk即可，可以當作為syslog進行。

最後通過編寫腳本，從而達到自動化。



## 總結

其實由於在投遞日誌前已進行日誌壓縮放到OSS, 實際outbound traffic所產生的費用更少，但客戶考慮到需要人為配置script，且鏈路較為複製，最後使用方案一，原生Add-on的接入方式，更加穩定

