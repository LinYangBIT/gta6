# Sunset Coast — 海洋大道

[公开体验](https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site) · [Blender 与 GitHub 工程](https://github.com/LinYangBIT/gta6)

横屏优先的原创开放城市原型。从人物步行开始，可领取委托、驾驶场景中的任意车辆、下车交付包裹，或自由探索持续生成的街区。城市、角色和车辆在浏览器中本地运行；游戏资源本地托管，GTA V 原声通过可见的 Spotify 播放器加载。

## 操作

- 步行：WASD / 方向键移动，Shift 奔跑，E 与联络人交谈或上下车。
- 驾驶：W 加速，S 减速与倒车，A / D 转向，空格手刹；停稳后 E 下车。
- 镜头：拖动画面自由环视，C 切换跟随、侧面、第一人称和俯瞰，V 回正；滚轮 / 双指缩放。
- 电台：M 打开音乐面板，点击 Spotify 播放键播放 GTA V 原声；可选“只显示播放器”缩小面板。N 在 COAST FM 下切歌，其余来源打开播放器。引擎声可独立开关。Esc 打开菜单，R 回到起点并重新开始委托。
- 手机横屏：左侧摇杆移动或转向，右侧奔跑 / 油门等动作键，中间右侧交互按钮上下车和领取任务。右侧空白画面可拖动环视。竖屏提供旋转提示，也可选择继续。

开始任务后的流程是步行到联络人领取摄影器材，任选一辆车前往黄色停车标记，停稳后下车交付，获得 $300。之后可继续接取按城市种子生成的委托；换车不丢失包裹。自由探索模式暂时隐藏任务指引。进度和车辆位置为当前会话状态；菜单可继续，重新加载或重置会重新开始。

## 城市与视觉

起点改为按网络截图重建可见建筑外观的海洋大道街区：弯曲的滨海主路、带中央绿岛的环岛、斜向连接路、酒店后巷、停车带和跨湾连接路。路网、车辆停放、碰撞、自动驾驶与小地图共用真实道路数据；离开海滨街区后继续进入无限生成的五类城区。

Colony、Dominion、Dixon 和 Coral 酒店采用分别制作的外观，加入圆角墙体、立体窗框与窗台、玻璃分格、阳台栏杆、入口、咖啡座、竖向招牌及屋顶设备。海边有棕榈公园、步道、沙滩遮阳伞和救生亭。车辆包含跑车、轿车、SUV；所有显示的汽车均可驾驶。角色有步行 / 奔跑动作，任务联系人和街边行人。

本轮在网络找到并实际查看了这些参考图：

- [Vice City 海洋大道官方公开画面（VGC 收录）](https://www.videogameschronicle.com/files/2021/11/GTA-The-Trilogy-The-Definitive-Edition-Vice-City-Screen-9-1440x810.jpg)：酒店连续立面、道路曲线与海滨公园。
- [GTA VI Dominion 酒店画面（Autoevolution 收录）](https://s1.cdn.autoevolution.com/images/news/gallery/gta-6-trailer-2-did-you-spot-all-the-major-vehicles_19.jpg)：圆角外墙、奶油色装饰与咖啡座。
- [GTA VI Dixon 酒店画面（GTABoom 收录）](https://media.gtaboom.com/variants/1920/media/images/9f/8e/Hotel_Dixon.jpg)：酒店竖向霓虹招牌。
- [Rockstar 官方 GTA VI 截图库](https://www.rockstargames.com/VI/media/screenshots)。

参考图片不作为网页纹理或随工程分发；模型和材质为自行制作。这是根据可见街景重建的有限海滨区域，外围连接原创程序化城市，并非整张 GTA 地图或游戏的完整复刻。

## 音乐

默认音乐来源是 [The Music of Grand Theft Auto V, Vol. 2: The Score](https://open.spotify.com/album/5EJAJsaHhQYLwVbynpcGkD)，通过 Spotify 官方嵌入播放器由用户点击播放。可播放范围由 Spotify 的地区、账号和平台规则决定；网页不保存、下载或分发商业音轨。播放器保持可见，关闭面板、进入菜单或切至后台会停止外部音乐；再次打开需重新点击播放。

也可选择两首原创 Web Audio 合成音乐的 COAST FM，或选择本机音频。所选文件只在本机播放，不上传；替换文件或退出时释放媒体资源。

城市以128米区块加载；手机最多25块、桌面49块，碰撞缓存48块。建筑按距离减少细节，使用实例批量绘制；浮动原点保持远距离精度。汽车保留附近3×3街区，最多记忆64辆改动过的车辆，超出历史上限的久远车辆可重新生成。没有固定地图边界，也不会一次创建无限物体。

## 本地运行与检查

```bash
python -m http.server 8080 --directory dist
# 打开 http://localhost:8080
node --test tests/*.test.mjs
```

检查覆盖实际 GLB 加载、走路与驾驶碰撞、所有车型上车、停车安全下车、车辆回收和位置保留、任务顺序与奖励、完整首单流程、海滨道路连通与跨块接缝、地图生成与内存上限、镜头手势、多点触控、原声播放器生命周期、电台调度和 JS 语法。当前执行环境没有浏览器自动化工具；没有进行手机实机或浏览器画面验收。Blender 离线预览用于检查几何和构图，光照与网页实时渲染会有差异。

## 源码与许可

- `dist/gameplay.js`：人物步行、车辆生成、上下车与碰撞。
- `dist/missions.js`：委托流程、现金奖励和后续任务。
- `dist/actors.js` / `human-model.js`：角色动画与多车型渲染。
- `dist/coast-layout.js`：共享海岸路网、地形、碰撞和路线导航。
- `dist/coast-architecture.js` / `coast-render.js`：细化酒店和海滨街景。
- `dist/world-layout.js` / `infinite-city.js`：确定性布局与流式城市。
- `dist/soundtrack.js`：Spotify、本地音频和原创电台来源选择。
- `dist/street-signs.js`：本地生成原创店招图集。
- Blender 原创跑车来自主仓库 `scenes/sunset_coast.blend`；最新可编辑海洋大道快照为 `scenes/coastal_district.blend`，人物街景快照为 `scenes/street_life.blend`，旧固定海岸场景仍保留。
- Three.js 0.173.0 使用 MIT，许可在 `dist/vendor/LICENSE.three.txt`。原创代码和资产沿用主仓库 MIT 许可。
- COAST FM 为 Web Audio 实时合成原创双曲目电台；GTA V 商业原声仅通过官方 Spotify 播放器播放，不属于项目 MIT 资产。

托管配置在 `.openai/hosting.json`。部署只包含配置和 `dist/`。
