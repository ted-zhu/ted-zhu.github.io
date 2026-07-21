---
title: PolarDB PostgreSQL輕量版安裝遇到問題總結
author: Ted
date: 2025-10-11 16:46:03
tags:
---
問題1.執行安裝的時候，報錯error: get http://XXXX connect: connection refused


![upload successful](/images/pasted-23.png)

回答: 防火牆已經關閉, config.yaml文件配置錯誤，以下圖中兩個括號中的不需要填ip，改完null，config文件只需要把ansible_host的ip改正確即可。


![upload successful](/images/pasted-24.png)


![upload successful](/images/pasted-25.png)

問題2: 安裝報錯，提示紅色字體


![upload successful](/images/pasted-26.png)

回答: 安裝是需要確認本地是否為en_US.UTF8，不然改系統默認改為en_US.UTF8，要不然把config文件裡 的這個字段更改為 lc_ctype: C ，一般系統會帶C


![upload successful](/images/pasted-27.png)

問題3: 在安裝過程中，可能會一直出現錯誤，需要執行delete cluster的命令，會出現這個情況


![upload successful](/images/pasted-28.png)

回答：需要確認config文件是否正確，config文件不需要修改，會根據bash [polarflex-deploy.sh](http://polarflex-deploy.sh/) -m "10.XX.XX.1" -p 'password' 來對應執行哪種安裝模式，出現此問題的話，再執行bash [polarflex-deploy.sh](http://polarflex-deploy.sh/) -m "10.XX.XX.1" -p 'password' 即可

問題4: 安裝完,不授權能使用多久？

回答: 一个月内没有任何使用限制的，一个月之后会自动限制最大连接数为20