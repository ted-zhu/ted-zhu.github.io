title: '# 阿里雲APIGateway對接本地API接口'
author: Ted
date: 2024-10-22 11:20:50
tags:
---
# 阿里雲APIGateway對接本地API接口



## 背景

客戶希望加強API的安全.



## 需求

客戶希望把對外的接口使用雲上API網關，對內API接口使用本地IDC 網關，從而區分對外接口走外面網關，對內接口走內部網關，並使用雲上WAF的API保護功能，還有希望雲上可以抵擋Anti-DDoS的流量



## 分析

客戶使用阿里雲API Gateway的話, 實現需求方面有部分問題:

1. 阿里雲API Gateway官方文檔說不支持接入本地IDC的API
2. 客戶希望阿里雲上API Gateway對外是非標準接口
3. WAF實例不支持非標準接口



## 方案

對應的問題，需要逐個分析，看可不可以組成一個整體方案給客戶.



Q1.阿里雲API Gateway官方文檔不支持接入本地IDC的API

![image-20241022105201653](https://p.ipic.vip/bvdxo5.png)

A1: 實際上可以通過後台加白名單，直接支持本地IDC的API， 譬如本地API是 https://1.1.2.2/api ，是可以加白名單後，直接添加



Q2: 客戶希望阿里雲上API Gateway對外是非標準接口

A2: 阿里雲API Gateway實際是不支持的，但經過跟阿里雲研發部門討論，可以使用一種方法去實現，就是ALB + API Gateway.

![image-20241022105651536](https://p.ipic.vip/4hm24d.png)

通過ALB 指定後端地址為API Gateway的VPC地址，來實現非標準端口，ALB暴露非標端口，再監聽後端API Gateway, 就可以實現。



Q3: WAF實例不支持非標準接口

A3: 使用WAF3.0實例進行的話，在之前發版的版本是不支持的，後來跟研發部門提了需求後，後續版本更改了，但在那時，通過開啟ALB的WAF防護功能，去實現了非標準端口需求，通過ALB和WAF集成實現

![image-20241022110704125](https://p.ipic.vip/z781wr.png)

最終實現的方案架構

![image-20241022111531046](https://p.ipic.vip/77uso5.png)



WAF打開API安全功能, 接著就可以在API安全頁面看到 API資產走勢，風險走勢相關的統計圖

https://www.alibabacloud.com/help/zh/waf/web-application-firewall-3-0/user-guide/api-security-1/?spm=a2c63.p38356.0.0.5aa8112eCVEg1f

![image-20241022111849902](https://p.ipic.vip/0qcgg6.png)