---
title: Grafana監控阿里雲相關資源
author: Ted
date: 2024-10-17 16:29:40
tags:
---


# Grafana監控阿里雲相關資源

## 背景

------

目前幫很多客戶在託管並運維阿里雲上的相關資源，在此基礎上，需要監控上面所有產品的狀態及一些Security的事件。

## 需求

------

在公司的運維團隊當中，可以通過大屏第一時間看到相關客戶的重點產品的狀態或圖，並且當出現異常情況下，可以通過各種可用方式進行告警通知

## 方案

------

在尋找方案中，挑選不同類型產品以滿足公司內部需求。

1. 阿里雲雲監控
2. 雲運維平台SAAS版
3. Grafana + 阿里雲Open api監控插件👍

## 阿里雲雲監控

由於雲監控是基於每個帳號去配置監控規則，無法做到多個帳號同時顯示，對應監控可以通過钉钉群, 郵件 或 webhook的形式進行告警. 現階段使用的監控告警係基於此方法做，但大量客戶需要整合監控，所以此方案繼續升級.

## 雲運維平台SAAS版

國內這部分平台相對比較成熟，但由於公司所在地有法律法規要求，數據不能離境，假設通過通過國內平台調用阿里雲Open API的話(睿象雲)，有可能會產生數據離境問題，所以此方案都排除。

## Grafana + 阿里雲Open api監控插件👍

通過本地服務器搭建Grafana，再安裝阿里雲的插件，可以實現對應多帳號多產品的監控

![image-20241022095524162](https://p.ipic.vip/opk0hm.png)


![img](https://p.ipic.vip/qwqaps.png)



![img](https://p.ipic.vip/992sdp.png)









## 部署

------

### Grafana安裝包

https://grafana.com/oss/grafana/

#### Grafana安裝教程

https://grafana.com/docs/grafana/latest/setup-grafana/installation/

### aliyun-cms-grafana 2.0 服务端数据源安装使用说明文档

#### 安装依赖

```plain
2.0 服务端版本需要 Grafana 版本 7+ 
如果是旧版本 Grafana，只能安装 1.0 版本 https://github.com/aliyun/aliyun-cms-grafana/tree/v1.0
```

#### 1、直接安装云监控grafana数据源

```plain
a. 直接 从release 页面 https://github.com/aliyun/aliyun-cms-grafana/releases 里面下载 aliyun_cms_grafana_datasource_v2.0.tar.gz
b. 下载到 grafan的plugin目录中，解压缩 tar -xzf aliyun_cms_grafana_datasource_v2.0.tar.gz
c. 修改 conf/defaults.ini 允许未签名插件运行
    allow_loading_unsigned_plugins = aliyun_cms_grafana_datasource
d. 重启grafana
```

#### 2、源代码安装

```plain
a. 前端编译
    进入aliyun-cms-grafana目录下,执行grunt命令(需要安装nodejs和npm),则会按照Gruntfile.js里面的配置将项目里面的文件打包到指定的目录,
    当前配置是将项目文件打包到dist目录下,发布的时候打包发布整个插件目录下的文件,dist目录下一定是经源文件编译后的。
b. 服务端编译
需要安装   
    go 1.14   
    mage
    之后在目录中运行 mage -v， 会自动在 dist目录下生成 相应的二进制包。之后跟随前端代码统一发布

c. 部署
    1）按照上面顺序编译完成后，代码都会到dist下面。包括前端文件和二进制可执行文件 cms-datasource*。
    2）保证 cms-datasource* 都具有可执行权限。chmod +x cms-datasource*
    3) 在grafana 的plugin目录中，创建 aliyun_cms_grafana_datasource 目录，把编译出来的dist目录拷贝到此
    4) 修改 conf/defaults.ini 允许未签名插件运行
        allow_loading_unsigned_plugins = aliyun_cms_grafana_datasource
    5) 重启grafana
```

#### 3、配置云监控grafana数据源

```plain
a.进入grafana的数据源配置页面(Data Sources),点击Add data source进入配置表单页面,填入数据源名称(Name),
    在数据源类型(Type)对应的下拉列表中选择CMS Grafana Service。
b. 配置你的AK 和阿里云ID
    如果显示Success Data source is working,说明数据源配置成功,可以开始在grafana中访问阿里云监控的数据了。
    具体可参考:https://help.aliyun.com/document_detail/109434.html?spm=a2c4g.11186623.6.565.70d048adQpRZsT
```