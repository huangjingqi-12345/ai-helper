# AI Helper Python 脚本迁移 TS TODO

目标：线上运行时不再依赖 Python 环境，尤其避免 PPT 生成因为 `Pillow/python-pptx/CairoSVG` 等 Python 包缺失而失败。

## 范围判断

本次优先迁移“产品运行主链路”中由 Node 后端主动调用的 Python 脚本，不迁移离线工具、模板导入、图片搜索、语音、反向转换等非主链路脚本。

## P0：PPT 生成/导出主链路

当前调用点：`server/src/ai-helper/skillExecutor.ts`

1. [x] `project_manager.py init`
   - 用途：创建 PPT 项目目录。
   - TS 替代：在 `pptMasterBootstrap()` 内直接创建目录和 README。
   - 状态：已迁移，不再调用 Python；同时新增 `scripts/project_manager.ts` CLI 入口。

2. [x] `total_md_split.py`
   - 用途：把 `notes/total.md` 按页拆成单页讲稿，导出 PPTX 前修复缺失 notes。
   - 迁移策略：新增 TS helper，解析 `# / ## / ###` 页标题和 `NN_*.svg` 文件，生成每页 notes。
   - 状态：已迁移为 `splitPptTotalNotesSync()`，导出前不再调用该 Python 脚本；同时新增 `scripts/total_md_split.ts` CLI 入口。

3. [x] `svg_text_wrap.py`
   - 用途：导出前对手写 SVG 做文本换行/尺寸修正。
   - 迁移策略：只覆盖当前模型生成 SVG 的常见 `<text>/<tspan>` 场景；复杂场景保留校验失败提示。
   - 状态：已迁移为 `wrapPptSvgTextSync()`；导出前不再调用该 Python 脚本；同时新增 `scripts/svg_text_wrap.ts` CLI 入口。

4. [x] `finalize_svg.py` 及其主链路依赖
   - 用途：把 `svg_output/` 处理成可导出的 `svg_final/`。
   - 依赖模块：`svg_finalize/align_embed_images.py`、`embed_images.py`、`embed_icons.py`、`crop_images.py`、`flatten_tspan.py` 等。
   - 迁移策略：先实现“无外链图片/无复杂滤镜”的 TS finalize；当前 PX PPT 页面多数是可编辑 SVG primitives，应优先支持这条路径。
   - 状态：已迁移为 `finalizePptSvgSync()`；当前先复制 `svg_output/` 到 `svg_final/`，运行时不再调用 `finalize_svg.py`；同时新增 `scripts/finalize_svg.ts` CLI 入口。
   - 后续：如再次启用 `<use data-icon>` / 复杂外链图片，需要继续补 TS icon expansion / image align/embed。

5. [x] `svg_to_pptx.py` 及 `svg_to_pptx/` 包
   - 用途：把 SVG 转成原生可编辑 PPTX。
   - 迁移策略：
     - 采用直接生成 OOXML/PPTX zip 的方式，避免新增运行时依赖。
     - 先支持当前 renderer 输出的 primitives：rect/circle/ellipse/line/polyline/polygon/path/text/tspan/image。
     - 再补 notes、主题、媒体、动画等非必要功能。
   - 状态：已迁移为 `exportPptProjectToPptxSync()`，直接用 TS 生成 OOXML/PPTX zip；支持当前主链路常见 primitives：rect/circle/ellipse/line/polyline/polygon/path/text/tspan/image；同时新增 `scripts/svg_to_pptx.ts` CLI 入口。
   - 后续：动画、演讲者备注、完整 SVG 滤镜/渐变/marker/复杂 path fidelity 仍未补齐。

6. [x] `validate_editable_pptx.py`
   - 用途：旧链路校验 PPTX 是否可编辑。
   - 迁移策略：TS 读取 zip/OOXML 检查 `ppt/slides/*.xml` 是否存在形状元素。
   - 状态：已迁移为 `validateEditablePptxSync()`；导出后检查 PPTX 内是否存在 DrawingML 可编辑形状；同时新增 `scripts/validate_editable_pptx.ts` CLI 入口。

## 部署清理

- [x] Docker runtime 已移除 PPT 导出相关 Python/Pillow/pip requirements 安装；构建阶段仍保留 `python3 make g++` 用于 native npm 包编译。
- [x] `server/src/ai-helper/pptMaster.ts` 已移除旧 Python runner 残留。

## P1：其他 AI Helper Python 依赖

1. [ ] `md-to-pdf`：已是 TS，暂不需要迁移。
2. [ ] `patient-education-data-overview`：核心渲染脚本是 TS，暂不需要迁移。
3. [ ] `html-to-png`：如线上仍调用 Python 版截图脚本，再单独迁移为 Playwright TS。

## 暂不迁移

- `image_gen.py` / `image_search.py` / `notes_to_audio.py`
- `pptx_to_svg.py` / `pptx_template_import.py`
- `source_to_md/*`
- `svg_editor/server.py`
- 各类 docs/demo/diagnostic 工具

这些不在当前 PX AI 助手“生成 PPT 快速版/精美版/局部编辑”的主路径上，后续按实际使用再迁移。
