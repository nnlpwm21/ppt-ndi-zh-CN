# PPT NDI（简体中文版）

[![Github All Releases](https://img.shields.io/github/downloads/ykhwong/ppt-ndi/total.svg?style=flat-square)]()
[![GitHub release](https://img.shields.io/github/release/ykhwong/ppt-ndi.svg?style=flat-square)](https://GitHub.com/ykhwong/ppt-ndi/releases/)

## 简介

PPT NDI 可以通过 NewTek NDI 传输带透明背景的 PowerPoint 演示文稿。无需额外显示器，即可运行、共享、采集并推送 PowerPoint 幻灯片。无需使用 Chroma/Luma 抠像。

本仓库为社区汉化版本，界面已完整中文化，并保留英文 / 韩文切换能力。

> 上游项目：https://github.com/ykhwong/ppt-ndi
> 详细文档：https://ykhwong.github.io/ppt-ndi

## 安装

访问[下载页面](https://github.com/ykhwong/ppt-ndi/releases)获取安装包，最新版本位于页面顶部，在 Assets 中下载安装程序或压缩包。

## 运行模式

PPT NDI 提供以下两种模式：

* **PowerPoint 幻灯片放映模式** — 直接嵌入 Microsoft PowerPoint 的 NDI 插件，适合熟悉该软件的用户使用。
* **经典模式** — 独立界面，功能更丰富，切换效果更快。

### PowerPoint 幻灯片放映模式

![PPT NDI Mode: SlideShow](https://raw.githubusercontent.com/ykhwong/ppt-ndi/master/resources/ppt_ndi_slideshow_integration.png)

### 经典模式

![PPT NDI Screenshot](https://raw.githubusercontent.com/ykhwong/ppt-ndi/master/resources/ppt_ndi_sshot.png)

## 示例

另请下载并打开 [sample.pptx](https://github.com/ykhwong/ppt-ndi/raw/master/resources/sample.pptx) 查看下三分之一字幕（lower thirds）的示例：

## 语言切换

在「设置 → 语言」中可选择界面语言，支持：

* 简体中文（本仓库默认）
* English
* 한국어

## 从源码构建

```bash
npm install
npm run build
```

构建产物位于 `tmp/` 目录。

## 许可证

遵循原项目许可证，详见 [LICENSE](LICENSE)。
