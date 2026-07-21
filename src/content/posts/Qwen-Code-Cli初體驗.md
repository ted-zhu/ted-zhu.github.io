---
title: Qwen Code Cli初體驗
author: Ted
tags: []
categories: []
date: 2025-08-06 10:14:00
---
![upload successful](/images/pasted-6.png)

## 安裝

基於安裝使用，大家可以安裝官方教材進行

https://github.com/QwenLM/qwen-code

可能會遇到的問題, 本來NPM已經安裝了，版本過低，NPM需要升級

另外一個可能是執行qwen提示command not found: qwen

需要在本地變量添加qwen的路徑.

我的qwen安裝在
/usr/local/Cellar/node/21.6.2_1/bin/qwen

我是修改本地.zshrc文件，export相關的變量

![upload successful](/images/pasted-7.png)

## 使用

我想讓它幫忙生成一個XO的html遊戲

![upload successful](/images/pasted-8.png)


![upload successful](/images/pasted-9.png)


![upload successful](/images/pasted-11.png)


![upload successful](/images/pasted-12.png)

## 總結

雖然是魔改Gemini CLI, 但如果改成符合國情, 又問題不大, 方便使用就可以。
最後使用完後，告訴你最終使用了模型多少Token

![upload successful](/images/pasted-10.png)