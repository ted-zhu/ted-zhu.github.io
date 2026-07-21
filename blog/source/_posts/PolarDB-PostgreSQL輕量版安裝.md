title: PolarDB PostgreSQL輕量版安裝
author: Ted
tags: []
categories: []
date: 2025-10-11 16:26:00
---
## PolarDB輕量版包括了以下組件

●	pdbcli：安裝部署的客戶端組件，作為整個PolarDB集群的管理客戶端，可進行數據庫實例部署、添加Standby節點、高可用切換、版本升級等操作.
●	PolarDB Engine：數據庫引擎。
●	PolarDB ClusterManager Controller(CM)：高可用集群管理中心，是數據庫集群的控制流入口。
●	Proxy：數據庫代理組件提供集群內的主節點和所有只讀節點組成的讀寫分離和負載均衡服務。
●	Universe：監控採集組件，會採集數據庫、Proxy、主機等組件的監控數據，提供prometheus、influxdb或者zabbix等開源監控數據存儲組件的對接能力。

![upload successful](/images/pasted-19.png)

## 安裝部署

### 硬件需求

安裝PolarDB輕量版數據庫操作系統應具備基本的硬件要求。

| 需求项 | 配置说明 |
| --- | --- |
| 服务器架构 | 支持X86和ARM架构。 |
| 硬盘 | 系统盘（/usr/local所在磁盘）预留10GB空间用于安装应用程序包。
 1个本地数据盘，容量至少256GB。 |
| CPU | 至少使用2核的CPU。 |
| 内存 | 至少使用8GB的内存。 |
| 网络要求 | 千兆以上以太网。 |

### **软件需求**

| 需求类别 | 配置说明 |
| --- | --- |
| 操作系统 | Linux CentOS 7.2或以上，以及redhat系的国产化操作系统（麒麟、统信、龙蜥等）。建议字符集设置为LANG=en_US.UTF-8 |
| 文件系统 | 本地盘文件系统为Ext4 |
| glibc版本 | glibc版本为2.15或以上。
glibc版本检查方法：执行以下命令，获取glibc版本号列表，列表中包含GLIBC_2.15或以上版本。
strings /lib64/libc.so.6 | grep "^GLIBC_2." |

這裡需要注意一點，就是字符集一定要設置正確，不然會發生報錯，可以不一定為en_US.UTF-8，可以為C，注意後面config.yaml配置文件也改成C即可

## 安装与配置集群管理工具

**集群管理工具安装**

- 获取名为polarflex-${version}-${build-date}.tar.gz的安装包，并将其发送至安装主机上。
- 登录安装主机, 以version 2.3.2.6为例, 执行以下命令创建工作目录:

version=2.3.2.6

mkdir -p polarflex-${version}

- 执行以下命令，解压安装文件:

tar -C polarflex-${version}/ -xf polarflex-${version}-${build-date}.tar.gz

- 进入工作目录，执行以下./scripts/install.sh命令并开始安装，该命令需要root权限

cd polarflex-${version}/

./scripts/install.sh

- 安装完成后，执行如下命令确认安装的版本，版本无误即表明安装正确

pdbcli version

![upload successful](/images/pasted-20.png)

## 安装与署数据库集群

### 预配置操作系统

首先需要检查透明大页是否已经关闭。执行：

cat /sys/kernel/mm/transparent_hugepage/enabled

显示结果为always madvise[never]，表示已关闭透明大页。若没关闭，请顺序执行如下操作关闭透明大页。

echo never > /sys/kernel/mm/transparent_hugepage/enabled

### 配置模板检查（重要）

**配置模板**

pdbcli配置文件包括主机存储、端口配置、数据库参数等，是安装数据库的重要配置文件。默认使用的配置文件为polarflex-${version}/文件夹下的config.yaml。

为了便于用户配置config.yaml，在相同目录下提供了配置文件的模板，例如一主两备集群的配置模板为config_template.yaml，一主一备的配置模板为config_master_slave.yaml，单节点的配置模板为config_single_node.yaml。

如果使用3.4.3节中的polarflex-deploy.sh一键安装脚本，搭建一主两备集群，并需要修改参数时，请修改config_template.yaml模板文件中的参数。同理，搭建单节点集群，请修改config_single_node.yaml模板文件中的参数。polarflex-deploy.sh脚本运行中会自动根据模板生成config.yaml。

**兼容模式**

PolarDB轻量版拥有两种兼容模式，分别为**Postgres兼容**与**Oracle兼容**。默认为**Postgres兼容模式**，如果需要使用**Oracle兼容模式**，必须在配置文件模板最后设置compatibility_mode: ora，创建实例后不得修改！

**文件目录**

数据库文件目录默认在/var/lib/thirdDB目录下，可以通过配置文件中polardb_data_root_dir参数修改。由于默认目录磁盘空间可能较小，**强烈建议请根据主机磁盘大小和预计数据库文件量选择合适的目录，创建实例后不得修改！只能卸载重新安装。**

请结合实际部署环境的情况，修改配置文件中的内容。修改完成后，可执行 pdbcli validat 验证配置是否有问题。

配置文件需要符合yaml格式，不能包含=（等号）或者⇥（tab）等

以下配置文件示例展示了如何搭建單節點，主机IP分别为10.XX.XX.1、请您根据实际情况进行配置。

###安装并创建实例

本节介绍一键部署模式，polarflex目录下提供了一键安装脚本polarflex-deploy.sh。根据需要创建的数据库节点数量执行以下命令：

单节点，默认使用config_single_node.yaml参数模板

bash polarflex-deploy.sh -m "10.XX.XX.1" -p 'password'

如果添加-w参数可一键部署prometheus和grafana, 访问执行polarflex-deploy.sh所在机器的3000端口即可查看集群监控.

额外添加-w参数, 可一键部署prometheus和grafana, 通过浏览器访问运行如下命令所在机器的3000端口, 即可通过grafana查看集群监控.

sh polarflex-deploy.sh -m "10.XX.XX.1" -p 'password'  -w

该脚本运行时会完成以下几个步骤：

1. 根据指定安装机器IP与机器root密码打通ssh免密
2. 根据配置模板（如yaml等）生成配置文件config.yaml
3. 执行pdbcli install cluster安装集群依赖
4. 执行pdbcli create cluster创建数据库集群

**注：**建议password两侧使用单引号'，避免在密码中存在!等特殊符号时安装失败。

## 部署后检查

安装和部署数据库后，需要进行安装后检查，确认集群状态健康。

### 集群状态检查

执行以下命令，通过pdbcli工具检查集群状态。

pdbcli status

返回cluster_manager、master、standby、proxy各节点状态为RUNNING即为安装成功，且work_path为数据库文件目录。

![upload successful](/images/pasted-21.png)

### 数据库检查

集群部署成功，并且在数据库启动之后，您可以通过PolarDB轻量版内核二进制包中自带的psql客户端进行连通测试。在创建时已经默认创建了一个用户admin，密码为postgres，还创建了一个数据库admin_db，数据库默认端口为1523。执行以下命令可以检查

PGPASSWORD=postgres /u01/polardb_pg/bin/psql -h localhost -p1523 -U admin -d admin_db -c 'show polardb_version'


![upload successful](/images/pasted-22.png)

如果返回polardb版本号，如PolarDB V2.0.14.15.30.0，则说明数据库安装成功，且数据库内核版本检查正常。

### 兼容性模式检查

您可以通过PolarDB轻量版内核二进制包中自带的psql客户端，执行以下命令，查询当前使用的PolarDB引擎兼容模式

PGPASSWORD=postgres /u01/polardb_pg/bin/psql -h localhost -p1523 -U admin -d admin_db -c 'show polar_compatibility_mode'

如果返回结果为pg，则说明为postgres兼容模式，如果返回ora，说明为oracle兼容模式。

### 进程检查

PolarDB轻量版引擎数据库启动成功之后，会在数据库目录下生成一个postmaster.pid，其中文件第一行内容是PolarDB引擎守护进程pid，您可以通过ps -ef | grep *** （其中***为守护进程pid）命令，得到所有的PolarDB轻量版数据库进程，其中有如下几类常见辅助进程。

- postgres: logger为PolarDB引擎的打印日志进程。
- postgres: checkpointer为PolarDB引擎的周期性检查点进程。
- postgres: background writer为PolarDB引擎的周期性刷脏进程。
- postgres: walwriter为PolarDB引擎的定期WAL 日志刷盘进程。
- postgres: autovacuum launcher为PolarDB引擎的自动清理调度进程。
- postgres: stats collector为PolarDB引擎的统计信息收集进程。

## 数据库集群卸载

如果3.4节安装中有报错，需要删除残留重新安装，请先执行以下命令删除集群并卸载软件栈，然后从3.4节重新开始安装。

pdbcli delete cluster && pdbcli uninstall cluster

- 完整的pdbcli使用帮助, 可见文档pdbcli使用指南

# 数据库访问

数据库提供代理节点Proxy, 其作为建议的接入层, 可实现对数据库failover自动恢复的能力、以及提供负载均衡的能力。用户可选择通过代理连接数据库，也可以选择直连数据库节点。

### 连接方式

使用JDBC驱动可以使用如下连接串, 可将多个Proxy的endpoint均配置其中, 确保单个Proxy挂掉客户端访问不受影响:

jdbc:postgresql://proxy1_host:proxy1_port,proxy2_host:proxy2_port/database

### 代理路由方式

Proxy在提供读写分离能力的基础上, 提供了两种不同的一致性:

- 强一致性: 所有请求均路由到数据库RW节点
- 会话一致性: 支持读路由到Standby节点, 单个连接内根据位点保证一致性, 不同连接不作保证, 可充分利用Standby的资源提供只读的能力

两种不同的一致性需求分别对应两个端口。强一致性端口默认为12369端口，会话一致性端口默认为12370端口