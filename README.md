# Sunset Coast · GTA6 风格 Blender 场景

原创海滨城市与跑车镜头演示：赛博朋克蓝紫暮景、Art Deco 建筑、霓虹店招、棕榈大道、沙滩和海水。包含可编辑的 Blender 工程、程序化建模脚本，并保留原始 10 秒车辆与摄影机动画。

这是受 GTA6 海滨都市氛围启发的场景原型，不是完整游戏，也不包含 Rockstar 的模型、纹理或游戏代码。

## 在线城市体验

地图加入货运堆场与起重机、航空站、架空交通广场、运动公园、山麓住宅和集市，海边增加篮球、排球和健身设施；外围仍持续生成。

新增自行车、六轮卡车和可升降的直升机；车辆按质量传递碰撞冲量，停放车辆会被撞动，伴随火花、尘土与撞击声。任务有高亮光柱、方向箭头、阶段横幅和默认英文语音。直升机使用 Space 上升、Ctrl 下降，手机提供升降键，降落停稳后才能下机。

[打开 Sunset Coast](https://sunset-coast-drive-linyang.yanglinchasel.chatgpt.site)（公开访问）。

网页版已升级为横屏开放城市：**人物步行开局、任意车辆上下车、连续委托和现金奖励**。WASD 移动 / 驾驶，Shift 奔跑，E 交谈 / 上下车，C 切镜头，拖动自由环视。手机横屏左侧摇杆、右侧动作键。加入弯曲滨海大道、环岛、斜向连接路、酒店后巷和跨湾连接路；保留按需生成的无限街区。点击“进入城市”即播放 PULSE FM 英文人声舞曲，默认只显示顶部音乐与播放 / 暂停两个小按钮，收起设置保持播放。可切换 Spotify 官方原声、COAST FM 或本机音频。网页版源码及完整说明在 [`web/`](web/README.md)。

海洋大道重建实际参考了 [Vice City 海洋大道截图](https://www.videogameschronicle.com/files/2021/11/GTA-The-Trilogy-The-Definitive-Edition-Vice-City-Screen-9-1440x810.jpg)、[GTA VI Dominion 酒店](https://s1.cdn.autoevolution.com/images/news/gallery/gta-6-trailer-2-did-you-spot-all-the-major-vehicles_19.jpg) 与 [Dixon 酒店画面](https://media.gtaboom.com/variants/1920/media/images/9f/8e/Hotel_Dixon.jpg)，重新制作四类地标酒店的可见外观，并细化窗框、窗台、圆角立面、阳台、入口、咖啡座、屋顶设备和海滨植被。参考图片不随仓库分发，网页使用自行制作的几何与材质。这是有限街区的参考重建，外围连接原创无限城市；并非完整 GTA 地图。

最新网页版把海滨陆侧从 **19 栋增加到 133 栋**，外围每个街区从 4–6 栋增加到 **16–22 栋**。连续沿街商铺、围合庭院、住宅区与办公楼群保留服务通道；远景采用同一套地图数据，走近后变成可探索的详细街区，持续生成并回收远处数据。

最新可编辑快照是 [`scenes/metro_city.blend`](scenes/metro_city.blend)：货运堆场、起重机、架空交通设施、运动场、航空站和山麓地标，包含实际生成的六类载具；保留青蓝／洋红霓虹暮景。以下为 **1920×1080 Blender 离线预览**，使用网页同源几何，实时光照会有差异：

![城市扩展港区近景](previews/metro_city.png)

[新版城区俯瞰](previews/metro_city_aerial.png) · [赛博朋克海滨旧版](previews/cyberpunk_city_aerial.png) · [明亮暮色旧版](previews/vivid_city_aerial.png) · [密集城区旧版](previews/dense_city_aerial.png)

```bash
node scripts/export_infinite_preview.mjs --metro --seed 610 --output /tmp/metro-city.json
blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- --input /tmp/metro-city.json --output previews/metro_city.png --overview-output previews/metro_city_aerial.png --blend scenes/metro_city.blend --resolution 1920 --samples 48
```

游戏封面使用 [Rockstar 官方发布的完整壁纸](https://www.rockstargames.com/VI/media/artwork-wallpapers)：4K 横版与1080×1920竖版，保留原画面和色彩。它不是游戏截图；本站明确标识为非官方可玩场景。官方封面和 Logo 的版权属于 Rockstar / Take-Two，来源与文件哈希记录于 [`web/dist/assets/gta6-cover-attribution.json`](web/dist/assets/gta6-cover-attribution.json)，不适用本仓库 MIT 许可。

背景音乐默认 **PULSE FM 英文人声舞曲**：**On My Way**（Alex / AlexBeroza feat. Donnie Ozone，140 BPM）和 **Road Back To You**（Allerlei von Nicolai feat. Admiral Bob，128 BPM）。点击进入直接播放自托管 MP3，自动轮播，关闭面板仍继续；英文任务语音播报时压低音乐。两首歌曲均采用 **CC BY 3.0**，完整来源、署名、修改记录和哈希在 [`web/dist/assets/music-attribution.json`](web/dist/assets/music-attribution.json)，不适用 MIT。Spotify 官方 GTA V 原声、原创合成电台和本机文件仍可选择。

引擎声默认开启：进入时解锁音频，上车后随速度平滑变化，卡车低沉、直升机有旋翼节奏，自行车、步行、CG、菜单和后台不发出引擎声。右上角声音按钮可独立关闭；本次会话中返回菜单再进入仍保留手动关闭状态。

首次进城新增约 8 秒的实时 CG，由海滨全景、酒店街景过渡到步行人物；可以跳过，返回菜单后继续只作短过渡。驾驶默认转向比前版更灵活；右上角操控设置提供转向幅度60%–200%和响应速度60%–180%，默认130% / 115%，即时生效并在本机保存。保留渐进输入、高速稳定限制和快速回正；横屏摇杆为128px，油门72×150px，镜头按钮44px。

操作指南中提供自动、高清、均衡、流畅四档画质，默认高清优先。桌面最高约4K像素预算、手机约420万像素；抗锯齿始终开启。网页近景窗口为手机25 / 桌面49个区块，远景为17×17 / 23×23个区块（扣除近景）；Blender只保存有限快照，网页随行进持续生成。当前环境未进行浏览器或手机实机验收。

V2 模型增加轮拱、车身接缝、轮胎和制动细节，以及沿线建筑立面。补充建模脚本 `scripts/detail_scene.py` 可在基础工程上运行。

网页无限城市通过 `web/dist/world-layout.js` 与 `infinite-city.js` 在运行时生成，原始 `sunset_coast.blend` 保留固定海岸场景；不会把无限地图存成一个无限大的 Blender 文件。

可编辑的邻近街区快照保存在 `scenes/endless_city_preview.blend`；预览图由同一批网页实例几何生成，窗户在离线渲染时烘焙近似材质。重新生成快照：

```bash
node scripts/export_infinite_preview.mjs --seed 610 --output /tmp/endless-city.json
blender -b --python-exit-code 1 --python scripts/render_infinite_preview.py -- --input /tmp/endless-city.json --output previews/endless_city.png --blend scenes/endless_city_preview.blend
```

![无限城市街区预览](previews/endless_city.png)

重新导出网页模型：

```bash
blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/export_web.py -- --output-dir web/dist/assets
```

![Sunset Coast 场景预览](previews/sunset_coast.png)

![原创跑车特写](previews/hero_car.png)

[海岸航拍](previews/coast_aerial.png) · [10 秒巡游视频](previews/sunset_cruise.mp4)

## 打开工程

使用 **Blender 4.3 或更新版本**打开 [`scenes/sunset_coast.blend`](scenes/sunset_coast.blend)。

- `小键盘 0`：进入主摄影机视图。没有小键盘时，使用「视图 → 摄影机 → 活动摄影机」。
- `空格`：播放时间轴；范围为第 1–240 帧，24 fps。
- `F12`：用 Cycles 渲染当前帧。
- 工程含主跟拍、跑车特写、海岸航拍三台摄影机；在大纲视图中选中摄影机，再按 `Ctrl + 小键盘 0` 切换。

打开工程不需要安装插件或执行脚本。模型、材质、灯光和关键帧都可以直接编辑。

## 从脚本重建

在仓库根目录执行，确保 `blender` 已加入系统 PATH：

```bash
# 生成工程，并渲染主预览图（默认 1600 × 1000，48 samples）
blender -b --python-exit-code 1 --python scripts/build_scene.py -- --render

# 快速预览
blender -b --python-exit-code 1 --python scripts/build_scene.py -- --render --resolution 800 --samples 16

# 仅生成工程
blender -b --python-exit-code 1 --python scripts/build_scene.py

# 在基础工程上加入 V2 细节（可重复运行）
blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/detail_scene.py

# 检查保存的场景；结果写入 previews/validation.json
blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/validate_scene.py

# 渲染跑车特写与海岸航拍
blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/render_previews.py

# 输出轻量动画预览，需安装 FFmpeg（640 × 400，8 fps，10 秒）
blender -b scenes/sunset_coast.blend --python-exit-code 1 --python scripts/render_previews.py -- --mode animation --resolution 640 --samples 16
```

`--resolution` 设置宽度，高度为宽度的 62.5%；`--samples` 设置 Cycles 采样数。构建脚本仅在当前 Blender 支持 OpenImageDenoise 时自动启用降噪。`--output 路径.blend` 可指定工程输出位置。重新运行生成脚本会替换输出工程和同名预览，请先另存手动修改的版本。

动画预览可直接在 Blender 时间轴中播放。导出视频时，建议在「输出属性」设置输出目录与 FFmpeg 视频格式，再使用「渲染 → 渲染动画」。CPU 渲染整段动画耗时较长，可先降低分辨率和采样数。

## 文件

| 路径 | 内容 |
| --- | --- |
| `scenes/metro_city.blend` | 新城区设施与六类载具的最新可编辑快照 |
| `previews/metro_city.png`、`previews/metro_city_aerial.png` | 1920×1080 港区近景与城市俯瞰 |
| `previews/metro_city.json` | 真实导出源码、脚本和成品哈希及重建说明 |
| `scenes/cyberpunk_city.blend` | 霓虹建筑、车辆灯条和蓝紫暮景的最新可编辑快照 |
| `previews/cyberpunk_city.png`、`previews/cyberpunk_city_aerial.png` | 1920×1080 同源几何的赛博朋克街景与城区俯瞰 |
| `scenes/vivid_city.blend` | 细化车辆、建筑和鲜明配色的可编辑同源快照 |
| `previews/vivid_city.png`、`previews/vivid_city_aerial.png` | 1920×1080 高清街景和城区俯瞰 |
| `scenes/dense_city.blend` | 密集城区与有限远景的可编辑同源快照 |
| `previews/dense_city.png`、`previews/dense_city_aerial.png` | 新版街景与连续城市俯瞰 |
| `scenes/coastal_district.blend` | 海洋大道酒店、曲线路网与海滩的可编辑快照 |
| `previews/coastal_district.png`、`previews/coast_network.png` | 同源几何的街景与路网离线预览 |
| `scenes/street_life.blend` | 人物、可驾驶车辆与街头场景的可编辑快照 |
| `previews/street_life.png` | 横版人物街景预览 |
| `scenes/endless_city_preview.blend` | 无限城市的有限邻域快照，可编辑 |
| `previews/endless_city.png` | 程序化城市离线预览 |
| `scenes/sunset_coast.blend` | 可编辑场景、材质、三台摄影机和关键帧 |
| `previews/sunset_coast.png` | 主摄影机渲染预览 |
| `previews/hero_car.png`、`previews/coast_aerial.png` | 跑车特写与海岸航拍 |
| `previews/sunset_cruise.mp4` | 8 fps 轻量视频预览；工程本身为 24 fps |
| `previews/validation.json` | 几何、资源、摄影机与动画检查结果 |
| `scripts/build_scene.py` | 组装道路、海岸、植被、灯光和动画 |
| `scripts/city.py` | Art Deco 街区与远景建筑 |
| `scripts/vehicle.py` | 原创跑车模型 |
| `scripts/detail_scene.py` | V2 轮拱、内饰、车身接缝及沿线店铺细化 |
| `scripts/validate_scene.py` | 可重复运行的工程检查 |
| `scripts/render_previews.py` | 渲染辅助视角与巡游视频 |

所有几何和材质由本项目脚本生成，不依赖外部付费素材。两首 PULSE FM 歌曲按 CC BY 3.0 单独署名，官方封面另有版权。代码及原创资产使用 [MIT License](LICENSE)。GTA / Grand Theft Auto 商标属于各自权利人；本项目为独立非官方作品。

**English:** An original GTA6-inspired coastal environment for Blender 4.3+, with editable procedural assets and a 240-frame sunset cruise. Open the `.blend`, or rebuild it with the command above. Includes a public browser driving prototype; this is an independent project, not an official Rockstar product.
