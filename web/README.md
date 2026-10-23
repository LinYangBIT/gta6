# Sunset Coast — 街头生活

[公开体验](https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site) · [Blender 与 GitHub 工程](https://github.com/LinYangBIT/gta6)

横屏优先的原创开放城市原型。从人物步行开始，可领取委托、驾驶场景中的任意车辆、下车交付包裹，或自由探索持续生成的街区。城市、角色和车辆在浏览器中本地运行；无需后端或第三方 CDN。

## 操作

- 步行：WASD / 方向键移动，Shift 奔跑，E 与联络人交谈或上下车。
- 驾驶：W 加速，S 减速与倒车，A / D 转向，空格手刹；停稳后 E 下车。
- 镜头：拖动画面自由环视，C 切换跟随、侧面、第一人称和俯瞰，V 回正；滚轮 / 双指缩放。
- 电台：M 开关，N 切歌；引擎声可独立开关。Esc 打开菜单，R 回到起点并重新开始委托。
- 手机横屏：左侧摇杆移动或转向，右侧奔跑 / 油门等动作键，中间右侧交互按钮上下车和领取任务。右侧空白画面可拖动环视。竖屏提供旋转提示，也可选择继续。

开始任务后的流程是步行到联络人领取摄影器材，任选一辆车前往黄色停车标记，停稳后下车交付，获得 $300。之后可继续接取按城市种子生成的委托；换车不丢失包裹。自由探索模式暂时隐藏任务指引。进度和车辆位置为当前会话状态；菜单可继续，重新加载或重置会重新开始。

## 城市与视觉

保留无限区块路网与五类街区，增加棕榈大道、奶油白 Art Deco 建筑、珊瑚色雨棚、可读原创店招、路面纹理、冷暖光影和人行道细节。车辆包含跑车、轿车、SUV；所有显示的汽车均可驾驶。角色有步行 / 奔跑动作，任务联络人和街边行人。

本轮先在网络找到并查看 [Rockstar 官方 GTA VI 截图](https://www.rockstargames.com/VI/media/screenshots) 中的 Vice City 02、03、06，以及 [Trailer 2 酒店街景画面](https://www.gtaboom.com/rockstar-confirms-using-in-game-ps5-footage-for-gta-6-trailer-2-e749)，参考街道尺度、热带植被、粉彩建筑和日光色彩。参考图不作为网页纹理或随项目分发；模型、店名、音轨均为原创。本项目是轻量浏览器原型，画面精度与完整 GTA VI 不同。

城市以128米区块加载；手机最多25块、桌面49块，碰撞缓存48块。建筑按距离减少细节，使用实例批量绘制；浮动原点保持远距离精度。汽车保留附近3×3街区，最多记忆64辆改动过的车辆，超出历史上限的久远车辆可重新生成。没有固定地图边界，也不会一次创建无限物体。

## 本地运行与检查

```bash
python -m http.server 8080 --directory dist
# 打开 http://localhost:8080
node --test tests/*.test.mjs
```

检查覆盖实际 GLB 加载、走路与驾驶碰撞、所有车型上车、停车安全下车、车辆回收和位置保留、任务顺序与奖励、完整首单流程、地图生成与内存上限、镜头手势、多点触控、电台调度和 JS 语法。当前执行环境没有浏览器自动化工具；没有进行手机实机或浏览器画面验收。Blender 离线预览用于检查几何和构图，光照与网页实时渲染会有差异。

## 源码与许可

- `dist/gameplay.js`：人物步行、车辆生成、上下车与碰撞。
- `dist/missions.js`：委托流程、现金奖励和后续任务。
- `dist/actors.js` / `human-model.js`：角色动画与多车型渲染。
- `dist/world-layout.js` / `infinite-city.js`：确定性布局与流式城市。
- `dist/street-signs.js`：本地生成原创店招图集。
- Blender 原创跑车来自主仓库 `scenes/sunset_coast.blend`；最新可编辑人物街景快照为 `scenes/street_life.blend`，旧固定海岸场景仍保留。
- Three.js 0.173.0 使用 MIT，许可在 `dist/vendor/LICENSE.three.txt`。原创代码和资产沿用主仓库 MIT 许可。
- Web Audio 实时合成原创双曲目电台，不含第三方音轨。

托管配置在 `.openai/hosting.json`。部署只包含配置和 `dist/`。
