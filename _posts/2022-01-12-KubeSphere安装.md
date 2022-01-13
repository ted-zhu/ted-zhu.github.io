# Kubesphere安装

## 安装默认SC存储

使用openebs

```
kubectl taint nodes k8s-node1 node-role.kubernetes.io/master:NoSchedule-
kubectl apply -f https://openebs.github.io/charts/openebs-operator.yaml
```

设置openebs-hostpath为default

```
kubectl patch storageclass openebs-hostpath -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

## 安装kubesphere

```
kubectl apply -f https://github.com/kubesphere/ks-installer/releases/download/v3.1.0/kubesphere-installer.yaml
   
kubectl apply -f https://github.com/kubesphere/ks-installer/releases/download/v3.1.0/cluster-configuration.yaml

```

## 查看安装日志

```
kubectl logs -n kubesphere-system $(kubectl get pod -n kubesphere-system -l app=ks-install -o jsonpath='{.items[0].metadata.name}') -f
```

![image-20211230153228588](https://tva1.sinaimg.cn/large/008i3skNgy1gybw5r3hfcj30cu0fa0u5.jpg)