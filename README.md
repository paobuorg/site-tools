# 跑起来工具站 · site-tools

[English](README.en.md) · 中文

`tools.paobu.org` 的网站工程：配速、分段、跑走结合、比赛预测、补给、碳水加载、热适应、爬坡等效配速、出汗率、训练负荷、受伤风险自查、鞋里程、比赛清单、轨迹查看/转换/简化、高程分析与路线比较。工具说明、公式、假设和算例来自 `running-handbook/tools/`；共享布局与地理计算来自 `@paobu/core`；计算与文件处理代码在本仓库。

## 当前状态

- **2026-11-25 本地结构调整完成**：内容源从旧 `running-tools` 改为 `running-handbook`，核心从 `site-www/packages/core` 改为独立 `paobu-core` 制品。
- 本站内容门禁通过：工具实体 **18**，工具算例 **43**，来源 **959**（三站共用同一内容门禁口径），claim **5,389**。
- 本地生产构建：静态 HTML **43**，发布清单 **40** 页，Pagefind **36** 条，sitemap **40** 个 URL；`check:production` 通过（tool=18）。
- 本地 QA 通过：360 页整站抓取、Chromium UI 矩阵、性能预算、8 项故障、11 项轨迹、11 项跨站、18 项 PWA。
- **线上 `https://tools.paobu.org/` 已发布 2026-11-25 新版**：由本仓 `main` 的 `afa1daf` 构建并部署；中文与英文首页、配速计算器等工具页和 40 个 sitemap URL 线上均返回 200。
- 共享核心 `@paobu/core@0.3.3`，制品 SHA-256 `8fdc28f59aab3bdabf908a4b83a405f2c39d7130df0afbc1eca5fd15e94968ae`。

## 技术基线

- Node.js `>=22.23.4 <25`，pnpm 10.18.3，Astro 7.4.2，TypeScript 5.9.3。
- `output: 'static'`、尾斜杠目录输出，规范域名 `https://tools.paobu.org`。
- 计算不依赖后端：纯算术在客户端函数中执行；GPX/GeoJSON 解析、测地距离与简化在 Web Worker 中执行。
- `fast-xml-parser` 5.11.2，Pagefind 1.5.2。
- `@paobu/core` 0.3.3，来自 `vendor/paobu-core.tgz`；`core.lock.json` 记录同一 SHA-256。

## 工具与代码位置

| 工具 | 主要实现 |
|---|---|
| 配速 `pace` | `src/lib/calculators.ts`，三模式与单位换算 |
| 分段 `splits` | `src/lib/calculators.ts`，等配速/负分段与最大余数分配 |
| 跑走结合 `run-walk` | `src/lib/calculators.ts`，循环与总时长排程 |
| 比赛预测 `race-predict` | `src/lib/calculators.ts`，Riegel 1.06，距离 5000–42195 米 |
| 补给计划 `fueling-planner` | `src/lib/fueling.ts`，按小时 30–60g 范围与产品份数换算 |
| 碳水加载 `carb-load-planner` | `src/lib/carb-load-planner.ts`，按体重与天数估算 |
| 热适应 `heat-adjust` | `src/lib/heat-adjust.ts`，温度与湿度修正 |
| 爬坡等效配速 `grade-adjusted-pace` | `src/lib/grade-adjusted-pace.ts`，坡度换算 |
| 出汗率 `sweat-rate` | `src/lib/fueling.ts`，称重差与补液 |
| 训练负荷 `training-load` | `src/lib/training-load.ts`，时长与强度系数 |
| 受伤风险自查 `injury-risk-check` | `src/lib/injury-risk-check.ts`，问卷式风险提示 |
| 鞋里程 `shoe-mileage` | `src/lib/shoe-mileage.ts`，初始里程、累计里程与用户自设提醒 |
| 比赛清单 `race-checklist` | `src/lib/race-checklist.ts`，按天气、地形、时长和旅行条件生成条目 |
| 轨迹查看 `track-view` | `src/lib/parse-track.ts`、`src/lib/track.ts`、`src/workers/track.worker.ts` |
| 格式转换 `track-convert` | `src/lib/parse-track.ts`、`src/lib/serialize-track.ts`、`src/workers/transform.worker.ts` |
| 轨迹简化 `track-simplify` | `src/lib/simplify-track.ts`、`src/workers/transform.worker.ts` |
| 高程分析 `route-elevation` | `src/lib/elevation.ts`、`src/workers/elevation.worker.ts`，累计升降与坡度 |
| 路线比较 `route-compare` | `src/lib/route-compare.ts`，只读取已发布路线字段 |

`src/client/` 负责表单、错误提示、进度、取消、下载和结果渲染；`src/pages/[...locale]/tools/[slug].astro` 负责工具页结构与双语文案。公式描述、假设、舍入和算例在内容仓库，不在本仓库重复维护。

## 目录

```text
src/pages/                [...locale] 首页、工具详情、搜索与 404
src/lib/                  计算、轨迹解析、序列化、简化、高程与路线比较
src/client/               表单、错误、进度、取消、下载与结果渲染
src/workers/              GPX/GeoJSON 解析、变换与高程 Worker
scripts/sync-core.mjs     从 ../paobu-core/core-dist 校验并同步核心 tgz
scripts/postbuild.mjs     Pagefind 索引与静态输出检查
vendor/paobu-core.tgz     锁定的核心制品（gitignore，安装前由 core:sync 重建）
core.lock.json            核心制品版本与 SHA-256
content.lock.json         两内容仓库的本地树摘要锁
```

## 本地运行

六个工程位于同一父目录。先确保 `paobu-core` 已生成 `core-dist/paobu-core-0.3.3.tgz`：

```bash
cd paobu-core
node scripts/pack-core.mjs

cd ../site-tools
node scripts/sync-core.mjs
pnpm install
pnpm test:content
pnpm check
pnpm test
pnpm build
pnpm dev
```

- 开发：`http://localhost:4323`。
- 预览构建：`pnpm preview`，`http://localhost:4423`。
- 内容校验：`pnpm test:content`。
- 类型检查：`pnpm check`。
- 单元测试：`pnpm test`，覆盖计算器、轨迹解析/序列化/简化、高程、路线比较与工具契约。

生产构建需显式设置三站来源与审阅开关：

```bash
PUBLIC_ROUTES_ORIGIN=https://paobu.org \
PUBLIC_KNOWLEDGE_ORIGIN=https://learn.paobu.org \
PUBLIC_TOOLS_ORIGIN=https://tools.paobu.org \
PREVIEW_UNREVIEWED=0 pnpm build
pnpm check:production
```

## 共享核心与内容锁

核心源码只在 `paobu-core` 维护。修改后在该仓运行 `node scripts/pack-core.mjs`，再在本仓运行 `node scripts/sync-core.mjs && pnpm install`。三站必须使用同一版本与 SHA-256；旧 tgz 保留用于回滚。

内容锁由交接包根目录的 `node scripts/content-lock.mjs` 生成，覆盖 `marathon-trail-running-races` 的 `content/`、`data/`、`assets/` 与 `running-handbook` 的 `knowledge/{content,data,assets}`、`tools/{content,data,assets}`。当前锁到路线仓 `7cc63ab7…`、handbook `1e008e39…`。

## 计算与隐私边界

- 所有计算在浏览器本地完成，不上传 GPX/GeoJSON 或输入数据；轨迹文件只在当前会话与 Worker 中处理，不写入服务器。
- 工具结果只是估算，不构成医疗、训练或比赛指挥建议；页面显示适用条件、舍入与失败边界。
- 受伤风险自查不提供诊断；出现急症信号应就医。
- 预览构建可显示未审阅横幅；生产构建必须 `PREVIEW_UNREVIEWED=0`。
- 线上已发布；六个仓库已在 `paobuorg` 建仓或改名并推送，Pages 从本仓 `main` 的 workflow 构建。

## 许可

- 网站代码：MIT。
- 工具内容：`running-handbook` 仓库许可，新写正文为 CC BY 4.0。
- 第三方依赖与字体保留各自许可。

最后核对日期：2026-11-25。
