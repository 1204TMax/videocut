# VideoCut

一个面向内容生产流程的网页端视频编辑工作台。

在线体验：[videocut-1du.pages.dev](https://videocut-1du.pages.dev)

完整的产品背景、需求范围和部署方式请查看：[VideoCut 项目说明](./docs/PROJECT.md)。

## 核心能力

- 视频、音频、图片与文字多轨编辑
- 素材拖入时间轴、分割、移动、变速与倒放
- 本地预览和视频导出
- 画布尺寸与背景设置
- 文本、图片、视频生成入口
- 覆盖保存当前编辑项目

编辑、预览、导出和项目存储均在浏览器本地完成，不需要业务后端。AI 生成、业务素材库和原系统覆盖回写需要接入对应服务接口。

## 本地运行

推荐使用最新版 Chrome 或 Edge。

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)，即可直接进入唯一的 VideoCut 工作台。

## 构建

```bash
npm run check
npm run build
```

构建产物位于 `dist/`。

## 开源说明

VideoCut 基于 [FreeCut](https://github.com/walterlow/freecut) 改造，并继续遵循 MIT License。原项目版权声明保留在 [LICENSE](./LICENSE) 中。
