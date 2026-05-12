# 学习播放器设计说明

本文档描述 `player` 项目中「日语视频 + 分段字幕」学习播放器的产品形态、数据契约、交互与视觉规范，便于维护与扩展。

---

## 1. 目标与范围

- **目标**：在桌面浏览器中以「手机竖屏内容区」形式呈现：上方视频、下方可滚动字幕；支持假名、罗马音开关、时间轴同步高亮。
- **技术栈**：React 19 + Vite 8 + TypeScript；无额外 UI 库。
- **范围**：核心 UI 在 `SubtitleLearningPlayer`；字幕数据默认从 `public/transcript_segments.json` 拉取并解析；视频默认 `public/v.mp4`。

---

## 2. 信息架构与布局

### 2.1 整体结构（竖屏 / 手机栏）

| 区域 | 说明 |
|------|------|
| 外层 `.jlp` | 最大宽度 **440px** 居中，模拟手机内容宽度；纵向 flex；高度约 **视口 − 48px**（与 `App` 上下留白对齐），避免整页与字幕区双滚动失控。 |
| `.jlp-main` | 上方块：仅含 **视频容器**（控制条叠在视频内，见 2.2）。 |
| `.jlp-side` | 下方块：**字幕列表**，`flex: 1` + `min-height: 0`，内部 `.jlp-list` 独立滚动。 |

### 2.2 视频与控制条

- **视频**：固定高度变量 `--jlp-video-h: min(360px, 44vh)`，宽 100%，`object-fit: contain`，深色底 `#1a1c16`、圆角与轻阴影。
- **控制条**：绝对定位在 **视频底部内侧**，半透明 **上暗下透明** 渐变，默认 **不可见**（`opacity: 0` + `pointer-events: none`）。
  - **桌面**（`hover: hover` 且 `pointer: fine`）：鼠标悬停 `.jlp-video-wrap` 时显示控制条。
  - **触摸 / 笔**：在容器上 `pointerdown` 且非 `mouse` 时进入 **`--force-ui`** 约 3.2s 内显示；与控件交互会 `bumpTouchUi` 刷新计时；打开「设置」会清计时并保持显示，关闭设置后约 2.2s 再收起。
- **控件密度**：进度条槽 **3px**、拖点 **9px**；时间 **11px**；按钮小 padding、浅色描边，适配「寸土寸金」。

### 2.3 字幕列表

- 每条为 **按钮**（可点击跳转 `start`）；当前播放段 `pickActiveSegment(segments, currentTime)` 高亮为 **卡片底**（见 4 色板）。
- 行内结构（自上而下）：**时间戳** → **日文（parts + ruby/mark）** → **罗马音（可选）** → **中文翻译**。
- 时间戳格式：`formatSegmentTc` 支持十分位（如 `0:05.5`），范围用 `–` 连接。

---

## 3. 数据模型

### 3.1 运行时类型（`src/components/types.ts`）

```ts
SubtitleMark = 'marker' | 'underline-yellow' | 'underline-blue'

SubtitlePart = {
  text: string
  ruby?: string      // 振假名（有则渲染 <ruby>）
  mark?: SubtitleMark // 荧光笔 / 下划线样式
}

SubtitleSegment = {
  id: string
  start: number   // 秒
  end: number
  parts: SubtitlePart[]
  romaji: string
  translationZh: string
}
```

### 3.2 原始 JSON（`public/transcript_segments.json`）

数组元素类型 **`TranscriptJsonRow`**（见 `demoSegments.ts`）：

| 字段 | 必填 | 说明 |
|------|------|------|
| `start` | 是 | 段起始（秒） |
| `end` | 是 | 段结束（秒） |
| `ja` | 是 | 整段日文纯文本（回退用） |
| `zh` | 是 | 中文翻译 |
| `ja_ruby_html` | 否 | 含 `<ruby>…<rt>…</rt></ruby>` 的 **片段 HTML**；有则解析为 `parts`，无则用 `[{ text: ja }]` |
| `romaji` | 否 | 罗马音行；空则 UI 不展示该行（避免空白） |

### 3.3 `ja_ruby_html` 解析（`parseJaRubyHtml`）

- 使用 **`DOMParser`** 包在 `<div id="jlp-ruby-root">` 内解析，避免裸片段丢失结构。
- **`<ruby>`**：去掉 `rt`/`rp` 后取 **基底汉字**；`rt` 为假名 → `SubtitlePart { text, ruby }`。
- **高亮（mark）**：
  - `data-jlp-mark="marker" | "underline-yellow" | "underline-blue"`
  - 或 `class` 含 `jlp-mark--marker` / `marker`、`jlp-mark--underline-yellow` / `underline-yellow`、`jlp-mark--underline-blue` / `underline-blue`
  - 可标在 **`<ruby>`** 或包裹用的 **`<span>`** 等上；子树继承「外层 mark」，**元素自身 mark 优先于继承**。
- 忽略 `SCRIPT` / `STYLE`。
- 无 `DOMParser`（极少环境）时退化为整串 `{ text: html }`。

### 3.4 加载流程

- **`fetchTranscriptSegments(url?)`**：`fetch` → JSON 数组 → **`mapTranscriptRows`**。
- **`SubtitleLearningPlayer`**：若未传入 `segments`，挂载后请求 **`transcriptUrl`**（默认 **`TRANSCRIPT_SEGMENTS_URL`** = `'/transcript_segments.json'`）。
- 加载中 / 错误：在 `.jlp-list` 顶部展示简短状态文案。

### 3.5 与 `auto/` 目录的关系

- 仓库内 **`auto/`** 可放离线生成脚本与样例输出（如 `auto/transcript_segments.json`、`auto/small.mp4`）。
- **线上播放默认仍读 `public/`**：部署时需将产物拷到 `public/transcript_segments.json`（及 `v.mp4`）或改 `transcriptUrl` / `videoSrc` props。

---

## 4. 视觉与色板（Miraa 参考）

色值曾按参考截图对像素采样对齐（见 `SubtitleLearningPlayer.css` 注释）。

| 语义 | CSS 变量 / 值 | 用途 |
|------|----------------|------|
| 页面底 | `--jlp-bg` `#EEF0E5` | `.jlp` 背景；与 `App.css` `.app-root` 一致 |
| 字幕栏底 | `--jlp-paper` `#F0F2E5` | `.jlp-side` |
| 当前段卡片 | `--jlp-row-active` `#F8FAEF` | `.jlp-row--active` |
| 主文字 | `--jlp-ink` | 正文 |
| 次要文字 | `--jlp-muted` | 假名小字、侧栏标题等 |
| 橄榄 / 鼠尾草 | `--jlp-olive` / `--jlp-sage*` | 进度、按钮强调等 |
| 行悬停 | `#F4F5ED` | `.jlp-row:hover` |

### 4.1 日文强调（`mark` + 默认 ruby 线）

- **`marker`**：荧光笔式渐变底（`.jlp-mark--marker`）。
- **`underline-yellow` / `underline-blue`**：粗下划线，金 / 青色调。
- **无 `mark` 的 `<ruby>`**：渲染时带 class **`jlp-jp-ruby`**，CSS **`:not(.jlp-mark)`** 下增加 **默认暖色细下划线**，使仅有假名标注的 JSON 也有「字下颜色」。

---

## 5. 设置与持久化

- **入口**：控制条右侧「设置」；浮层在按钮 **上方** 弹出（`absolute` + `z-index`）。
- **项**：「罗马音标注」「汉字假名标注」checkbox。
- **存储**：`localStorage` 键 **`jlp-display-settings`**，JSON `{ showRomaji, showFurigana }`；默认均为 `true`。
- **罗马音行**：仅当 `showRomaji && seg.romaji?.trim()` 时渲染，避免空串占位。

---

## 6. 播放与同步

- **倍速**：`0.75× / 1× / 1.25× / 1.5×` 循环，写回 `video.playbackRate`。
- **进度**：指针拖拽/点击，`seekTo`  clamp 在 `[0, duration]`。
- **当前段**：`currentTime ∈ [start, end)`；变化时 `scrollIntoView` 当前行（`block: 'nearest'`）。

---

## 7. 组件 API（摘要）

### `SubtitleLearningPlayerProps`

| Prop | 说明 |
|------|------|
| `segments?` | 若传入，**不 fetch**，直接使用 |
| `transcriptUrl?` | 字幕 JSON URL，默认 `TRANSCRIPT_SEGMENTS_URL` |
| `videoSrc?` | 视频 URL，默认 `'/v.mp4'` |

### `src/components/index.ts` 导出

- 组件：`SubtitleLearningPlayer` + 其 Props 类型。
- 字幕工具：`TRANSCRIPT_SEGMENTS_URL`、`fetchTranscriptSegments`、`mapTranscriptRows`、`parseJaRubyHtml`、`TranscriptJsonRow`。
- 类型：`SubtitleMark`、`SubtitlePart`、`SubtitleSegment`。

---

## 8. 文件索引

| 路径 | 职责 |
|------|------|
| `src/components/SubtitleLearningPlayer.tsx` | 播放器逻辑、设置、触摸/悬停 UI 状态 |
| `src/components/SubtitleLearningPlayer.css` | 全部 `.jlp-*` 样式 |
| `src/components/demoSegments.ts` | 字幕 URL、JSON 类型、解析与 fetch |
| `src/components/types.ts` | 字幕数据结构 |
| `src/components/index.ts` | 对外 barrel |
| `public/transcript_segments.json` | 默认字幕数据 |
| `public/v.mp4` | 默认视频 |
| `src/App.tsx` / `src/App.css` | 根布局与页面底色 |
| `doc/design.md` | 本文档 |

---

## 9. 后续可扩展方向（非承诺）

- JSON 内嵌更多 HTML 标签的安全策略（白名单）。
- 触摸设备下「点按视频中央」与「显示控件」手势拆分。
- 从 `auto/main.py` 流水线一键同步到 `public/` 的 npm script。

---

*文档版本随代码迭代维护；若实现与本文冲突，以源码为准。*
