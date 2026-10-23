# Sunset Coast · GTA6 风格 Blender 场景

原创海滨城市与跑车镜头演示：Art Deco 建筑、粉紫夕阳、棕榈大道、霓虹灯、沙滩和海水。包含可编辑的 Blender 工程、程序化建模脚本，以及 10 秒车辆与摄影机动画。

这是受 GTA6 海滨都市氛围启发的场景原型，不是完整游戏，也不包含 Rockstar 的模型、纹理或游戏代码。

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
| `scenes/sunset_coast.blend` | 可编辑场景、材质、三台摄影机和关键帧 |
| `previews/sunset_coast.png` | 主摄影机渲染预览 |
| `previews/hero_car.png`、`previews/coast_aerial.png` | 跑车特写与海岸航拍 |
| `previews/sunset_cruise.mp4` | 8 fps 轻量视频预览；工程本身为 24 fps |
| `previews/validation.json` | 几何、资源、摄影机与动画检查结果 |
| `scripts/build_scene.py` | 组装道路、海岸、植被、灯光和动画 |
| `scripts/city.py` | Art Deco 街区与远景建筑 |
| `scripts/vehicle.py` | 原创跑车模型 |
| `scripts/validate_scene.py` | 可重复运行的工程检查 |
| `scripts/render_previews.py` | 渲染辅助视角与巡游视频 |

所有几何和材质由本项目脚本生成，不依赖外部付费素材。代码及原创资产使用 [MIT License](LICENSE)。GTA / Grand Theft Auto 商标属于各自权利人；本项目为独立非官方作品。

**English:** An original GTA6-inspired coastal environment for Blender 4.3+, with editable procedural assets and a 240-frame sunset cruise. Open the `.blend`, or rebuild it with the command above. This is an environment and animation prototype, not a playable game or an official Rockstar product.
