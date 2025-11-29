# Bilibili 视频音量均衡器

本脚本旨在解决观看各式各样up主的视频时，响度忽大忽小的问题。通过 Web Audio API 实时处理音频，压缩动态范围，即可以实现不同视频间响度差距过大的问题，也可以在up主没有处理好自身视频响度时防止观众受到惊吓（）

## 效果预览

![音量均衡器开关示意图](/assets/diagram-icon.png)

## 安装方法

1.  安装浏览器插件 [**Tampermonkey** (油猴)](https://www.tampermonkey.net)，也基本支持其他同类型插件。
2.  [点击这里安装脚本](#) (替换为你的 Greasy Fork 发布链接)。
3.  打开任意 bilibili 视频页面刷新即可生效。

## 原理说明

本脚本使用浏览器原生的 `Web Audio API` 构建音频处理图：

`Source (视频源)` -> `DynamicsCompressor (动态压缩器)` -> `Gain (补偿增益)` -> `Destination (扬声器)`

**DynamicsCompressor**: 将超过阈值的大音量部分进行压缩，减小最大音量和最小音量的差距。

**Gain**: 对处理后的整体信号进行增益补偿，从而在不失真的前提下提升整体响度。

## 许可证

MIT License