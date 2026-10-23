# Sunset Coast — 在线海岸驾驶

[公开体验链接](https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site)。

从 [GTA6 风格 Blender 工程](https://github.com/LinYangBIT/gta6) 导出的原创城市与跑车，使用 Three.js 呈现浏览器驾驶体验。无需后端或第三方 CDN，所有模型、依赖和视频均随站点发布。

## 本地运行

```bash
python -m http.server 8080 --directory dist
```

打开 `http://localhost:8080`。模型需要通过 HTTP 加载，不能直接双击 HTML。

- W / ↑：加速；S / ↓：刹车与倒车。
- A D / ← →：转向；空格：手刹。
- C：切换追车、环绕看车、车头、俯瞰四种镜头；V：镜头回正；R：回到起点。
- 拖动画面可以自由环绕，双指捏合或滚轮缩放，也可双击回正。
- M：暂停/播放电台；N：下一首；引擎声可独立开关；Esc：返回菜单。
- 手机竖屏：左手拖动方向盘，右手踩油门；独立刹车、倒车与手刹。支持多指同时操作。
- 点击开始后播放原创合成器电台，两首曲目可切换；菜单、弹窗和后台自动静音。
- 自动巡游沿海岸循环行驶，手动输入即可接管。
- 六个路线光圈按顺序计时；最佳成绩仅存储在本机。

这是独立的场景与驾驶原型，包含道路边界和停放车辆碰撞，不是完整的 GTA 游戏。

## 检查

```bash
node tests/driving.test.mjs
node tests/assets.test.mjs
node tests/ui-contract.test.mjs
node tests/camera.test.mjs
node tests/radio.test.mjs
```

检查左右转向、倒车与刹停、巡游循环、实际 GLB 加载与几何、四轮结构、页面控件、镜头手势及电台调度。发布前还检查 JS 语法。当前执行环境未提供浏览器自动化工具，未进行浏览器实机测试。

## 资源与许可

- 场景、车辆、材质和界面为本项目原创，沿用主仓库 MIT 许可证。
- 导出器：主仓库 `scripts/export_web.py`，原始工程 `scenes/sunset_coast.blend`。
- `dist/assets/scene-data.json` 包含资源大小、坐标与几何统计。
- Three.js 0.173.0 使用 MIT，许可在 `dist/vendor/LICENSE.three.txt`。
- 音频由 Web Audio 实时合成；没有外部音轨和追踪脚本。

托管配置在 `.openai/hosting.json`。部署归档仅包含此配置和 `dist/`，不含测试与开发文件。
