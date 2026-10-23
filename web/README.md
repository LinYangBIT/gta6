# Sunset Coast — 在线海岸驾驶

[公开体验链接](https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site)。

由 [原创 Blender 跑车](https://github.com/LinYangBIT/gta6) 和浏览器实时生成的城市组成的驾驶体验。道路沿 X/Z 双轴持续延伸，建筑按城市编号与坐标确定性生成。无需后端或第三方 CDN。原始固定海岸 Blender 场景仍保留在主仓库。

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
- 自动巡游沿不断延伸的街道转弯探索，手动输入即可接管。
- 光圈持续指向下一个路口；面板显示总里程、到访路标和下一目标距离。
- 菜单中的「换一座城」创建新的城市编号，当前编号保存在本机。返回之前的街区会得到相同建筑。

街区包含棕榈艺廊、玻璃天际线、霓虹旧城、花园住宅区、运河湾。不同布局配有公园、水池、商铺、阳台、分层楼顶和街道设施；建筑碰撞与地图使用同一份布局。

城市以 128 米区块连续加载。手机最多保留 25 个区块，桌面最多 49 个；碰撞缓存最多 48 个，不随行驶距离增长。建筑按远近减少细节，并以共享几何批量绘制。浮动原点避免远距离后 GPU 精度下降。这里的“无限”指无固定地图边界、随行驶生成，不会在内存中一次创建无限建筑。

这是独立驾驶原型，不是完整 GTA 游戏。

## 检查

```bash
node tests/driving.test.mjs
node tests/assets.test.mjs
node tests/ui-contract.test.mjs
node tests/camera.test.mjs
node tests/radio.test.mjs
node tests/world-layout.test.mjs
node tests/infinite-city.test.mjs
node tests/origin.test.mjs
```

检查左右转向、倒车与刹停、长距离巡游、实际 GLB 加载与几何、区块接缝、种子重现、回收上限、浮动原点、页面控件、镜头手势及电台调度。发布前还检查 JS 语法。当前执行环境未提供浏览器自动化工具，未进行浏览器实机测试。

## 资源与许可

- 场景、车辆、材质和界面为本项目原创，沿用主仓库 MIT 许可证。
- 无限城市规则：`dist/world-layout.js`；按需渲染：`dist/infinite-city.js`；车辆运动：`dist/driving.js`。
- 导出器：主仓库 `scripts/export_web.py`，原始工程 `scenes/sunset_coast.blend`。
- `dist/assets/scene-data.json` 包含资源大小、坐标与几何统计。
- Three.js 0.173.0 使用 MIT，许可在 `dist/vendor/LICENSE.three.txt`。
- 音频由 Web Audio 实时合成；没有外部音轨和追踪脚本。

托管配置在 `.openai/hosting.json`。部署归档仅包含此配置和 `dist/`，不含测试与开发文件。
