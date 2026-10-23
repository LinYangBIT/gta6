# Sunset Coast — 在线海岸驾驶

从 [GTA6 风格 Blender 工程](https://github.com/LinYangBIT/gta6) 导出的原创城市与跑车，使用 Three.js 呈现浏览器驾驶体验。无需后端或第三方 CDN，所有模型、依赖和视频均随站点发布。

## 本地运行

```bash
python -m http.server 8080 --directory dist
```

打开 `http://localhost:8080`。模型需要通过 HTTP 加载，不能直接双击 HTML。

- W / ↑：加速；S / ↓：刹车与倒车。
- A D / ← →：转向；空格：手刹。
- C：切换追车、车头和海岸镜头；R：回到起点。
- M：开关引擎声；Esc：返回菜单。
- 手机使用屏幕两侧按钮，可同时转向与加速。
- 自动巡游沿海岸循环行驶，手动输入即可接管。
- 六个路线光圈按顺序计时；最佳成绩仅存储在本机。

这是独立的场景与驾驶原型，包含道路边界和停放车辆碰撞，不是完整的 GTA 游戏。

## 检查

```bash
node tests/driving.test.mjs
node tests/assets.test.mjs
node tests/ui-contract.test.mjs
```

检查驾驶稳定性、巡游循环、实际 GLB 加载与几何、四轮结构、页面资源和控件。发布前还检查 JS 语法。当前执行环境未提供浏览器自动化工具，未进行浏览器实机测试。

## 资源与许可

- 场景、车辆、材质和界面为本项目原创，沿用主仓库 MIT 许可证。
- 导出器：主仓库 `scripts/export_web.py`，原始工程 `scenes/sunset_coast.blend`。
- `dist/assets/scene-data.json` 包含资源大小、坐标与几何统计。
- Three.js 0.173.0 使用 MIT，许可在 `dist/vendor/LICENSE.three.txt`。
- 音频由 Web Audio 实时合成；没有外部音轨和追踪脚本。

已部署体验：https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site （当前为创建者私有访问）。GitHub 副本不包含站点身份配置，可将 `dist/` 部署到任意静态托管服务。
