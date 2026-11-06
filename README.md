# MyGo Subsonic

[English](README.en.md) · 简体中文

[MyGo Music](https://github.com/egoist/mygo-music) 的开源 Subsonic 音源插件。连接已有的 Subsonic / OpenSubsonic 服务器，在 MyGo 中浏览、搜索和播放音乐库。**这是客户端插件，不是 Subsonic 服务端。**

面向**未修改的官方 MyGo Music**。使用分模块 TypeScript 开发，发布为自包含的 `index.js`，安装不需要 Node.js、npm 或编译。

## 安装

需要 MyGo Music **0.1.13+**，服务器需支持 Subsonic API **1.16.1** 及所用接口。插件契约与浏览界面在未修改的官方提交 [`799ec1b`](https://github.com/egoist/mygo-music/commit/799ec1bac6d3006ac1aa29e06be9e6ae92cf0028)（0.1.13）和 [`93bf5a6`](https://github.com/egoist/mygo-music/commit/93bf5a6202119305bc36fa7b1da71402c96e6879)（0.1.18）中测试。

- [一键安装](mygo-music://install-plugin?repo=TexasOct/mygo-subsonic)，或在 **设置 → 插件 → +** 中粘贴 `https://github.com/TexasOct/mygo-subsonic`。
- 或从 [Releases](https://github.com/TexasOct/mygo-subsonic/releases) 下载 `mygo-subsonic-0.1.2.zip`，安装本地 ZIP。
- 本地开发可直接安装本项目文件夹；手动复制请保留 `plugin.json`、`index.js`、`locales/` 的相对位置。

### 第一次使用

1. 打开 **设置 → 插件 → Subsonic**。
2. 填写**服务器地址、用户名、密码**，其他选项通常可以留空。
3. 切换到 Subsonic 音源，点击**登录**。

登录窗口会显示连接进度；失败时会说明要检查什么。若需修改配置，请先关闭登录窗口，再打开上述设置。官方 MyGo 不支持在登录窗口里填写连接信息，也不支持由插件自动打开设置页。

<a id="configuration"></a>
## 配置与鉴权

当前版本只配置**一个服务器、一组账号密码**，支持同一服务器的多个入口按顺序尝试。不提供多服务器、多账号管理，不依赖 MyGo fork 或宿主界面修改。

已发布的官方 MyGo 仍将这些设置渲染为**文本框**，以下填写方式继续有效。此分支附带可选的 `password`、`boolean`、`select` 元数据，供[宿主参考实现](https://github.com/TexasOct/mygo-music/tree/feat/plugin-setting-types)显示密码遮罩、开关及登录方式下拉框；**上游尚未接受，不需要安装 fork 才能使用本插件**。

| 设置 | 填写内容 |
| --- | --- |
| 服务器地址 / Server addresses | 填写完整地址，例如 `http://192.168.1.10:4533`。同一服务器的内网、公网地址可用英文逗号分隔，常用地址放前面，最多 5 个。支持 HTTP、HTTPS、端口、子路径和末尾 `/rest`；不要在地址中附带用户名、密码、`?` 查询参数或 `#` 片段。 |
| 用户名 / Username、密码 / Password | 填写音乐服务器的用户名及密码，也可使用服务器提供的专用 Subsonic 客户端密码。密码首尾空格会保留。 |
| 登录方式 / Sign-in method | 通常留空即可，默认使用 `token`。只有服务器要求时才填写 `legacy`，插件不会自动切换。 |
| 音乐目录 ID（可不填） / Music folder ID (optional) | 留空使用所有目录。如需限制目录，填写服务器提供的目录 ID，不是目录名或磁盘路径。仅在接口支持时生效，不影响歌单。 |
| 记录播放历史 / Save listening history | 填写 `true` 开启；留空或 `false` 关闭。开启后向服务器上报 MyGo 标记为已播放的歌曲，不代表整首听完。 |

地址文本框示例，局域网优先、公网兜底：

```text
http://192.168.1.10:4533, https://music.example.com/navidrome
```

解析器也接受换行分隔（适用于配置文件或支持多行输入的环境），会去除首尾空白、规范化尾部路径并按首次出现的顺序去重。配置的所有地址都必须是**可信的同一服务器入口**；每个入口都可能收到同一组鉴权信息。

修改地址、用户名、密码或鉴权设置后重新登录。若手动换成另一台服务器或账号，请先清空旧播放队列、重新加载音乐；本版保留服务器原始资源 ID，不提供跨服务器队列隔离。

### 地址选择和失败处理

- 登录按顺序发送鉴权 `ping`，选择首个可达入口。选择缓存 30 秒；到期后的下一次请求重新从第一个地址探测，不在后台定时轮询。
- 连接失败、超时以及 HTTP `404/408/429/500/502/503/504` 可以尝试下一地址；元数据读取可重试。鉴权、权限、无效 JSON 或协议错误立即停止，不会悄悄更换鉴权模式。
- 多地址探测每个入口最多等待 1.5 秒；单地址探测最多 20 秒。单次协议请求含探测与重试总预算 25 秒，为官方宿主的调用时限留出余量。高延迟入口可能需要重新安排优先级。
- 歌单、收藏、播放记录等写操作**不自动重放**，避免响应丢失后重复提交。
- 封面和音频 URL 使用所选入口。每次新请求播放地址都会重新检查可达性，不必等待元数据缓存到期；URL 交给播放器后，插件不能在流中断时原地替换，**不承诺无缝切流**。

### 鉴权与安全

默认 token + salt：每次请求发送 `u`、`t = MD5(password + salt)`、`s`、`v=1.16.1`、`c=mygo-subsonic`。MD5 是协议要求，不是密码存储加密。显式 `legacy` 使用 `p=enc:<UTF-8 十六进制密码>`，防止字面 `enc:` 前缀被误解释；十六进制也不是加密。

元数据和修改操作使用 POST 表单，拒绝重定向。音频和封面由宿主下载，鉴权参数在 URL 中。通过 `ping` 后才保存本地登录标记；退出或修改连接会使标记失效，匹配配置的标记可以跨运行时重启恢复。

**局域网 HTTP 可直接使用，不强制 HTTPS。** HTTP 流量不加密，公网建议 HTTPS。**设置（包括密码）仍以明文保存；官方版本也会明文显示密码。参考实现的密码遮罩不等于加密。** 请使用专用低权限账号，保护应用数据目录，不要上传配置、截图或带鉴权参数的媒体 URL。详见 [SECURITY.md](SECURITY.md)。

## 功能

| 功能 | 协议映射 |
| --- | --- |
| 首页、专辑列表、歌手索引 | `getAlbumList2`、`getArtists` |
| 歌曲 / 专辑 / 歌手 / 歌单搜索 | `search3`；歌单按账号列表本地过滤 |
| 专辑、歌手详情 | `getAlbum`、`getArtist` |
| 喜欢的歌曲、收藏专辑、关注歌手 | `getStarred2`、`star`、`unstar` |
| 歌单列表、创建、重命名、删除、增删歌曲、排序 | `getPlaylists`、`getPlaylist`、`createPlaylist`、`updatePlaylist`、`deletePlaylist` |
| 带鉴权封面与播放地址 | `getCoverArt`、`stream` |
| 歌词 | `getLyrics`；OpenSubsonic 优先尝试 `getLyricsBySongId` |
| 可选播放记录 | `scrobble` |

### 列表如何加载

| 页面 | 滚动与加载方式 |
| --- | --- |
| 专辑列表、首页“最近添加 / 最近播放”的查看全部 | 自动分批读取专辑，汇总到同一页连续滚动，不再每 200 张手动翻页。按名称、歌手、添加时间、播放时间和播放频率排列时使用同一套逻辑。 |
| 歌手索引 | 一次返回完整索引，在同一页滚动，不人为拆页。 |
| 搜索歌曲 / 专辑 / 歌手 / 歌单、喜欢的歌曲、收藏专辑 | 保留 MyGo 的自动续载，每批 50 项，接近底部时继续加载。 |
| 歌手详情、专辑详情、歌单详情、歌单列表 | 返回接口提供的完整列表，不按 50 或 200 项截断；歌单中的重复歌曲会保留。 |

专辑浏览每次最多收集 **5,000 张，或用时 8 秒**。正常大小的库只有一页；超过上限或后续批次遇到网络故障时，保留已加载内容，并在底部显示“其余专辑”，点击右侧 MyGo 原生“查看全部”继续。标题下的数量会区分完整列表和已加载数量。登录失效、权限或协议错误仍会正常报错，不伪装成加载完成。

MyGo 的专辑浏览和歌手索引使用虚拟列表，只渲染可见行；歌曲列表也由宿主处理虚拟滚动。**并非所有网格都有虚拟化**：搜索中的专辑 / 歌手、收藏专辑及歌手详情等布局仍由官方 MyGo 决定。插件不修改宿主，也不宣称修复这些布局的渲染性能。

官方 `browse()` 不能在滚动时追加远程页面，所以这里是先收集有上限的列表再显示，不是真正的网络无限滚动。没有分页接口的歌手索引、收藏和歌单仍需完整获取；收藏及歌单搜索的每次续载也可能重新读取全量列表。大库因此仍有网络与内存开销。时长与歌词时间使用毫秒。

### 音质与限制

- **standard**：请求 MP3 转码，最大 128 kbps；**high**：MP3，最大 320 kbps。
- **lossless**：FLAC 原样播放；MP3 / Ogg Vorbis 原样播放但不标记无损；AAC / ALAC / WAV / Opus 等回退到 high MP3。
- 服务端需配置转码器与权限；插件不转码，`maxBitRate` 只是请求上限。Ogg Opus 依赖服务端元数据识别，MyGo 的 Ogg 解码器仅支持 Vorbis。
- 歌单写入仅允许 `owner` 与用户名精确匹配。按歌曲 ID 删除会删除全部重复条目；排序保留重复歌曲。运行时内串行修改同一歌单，但协议没有条件更新，无法避免外部客户端并发冲突。
- 不导出远程播放、推荐电台、视频等未实现能力。歌词回退不吞掉鉴权或权限错误。
- 尚未逐一验证真实 Navidrome / Gonic / 原版 Subsonic 部署及实际音频解码、转码，不宣称产品兼容认证。

## 开发与验证

需要 Node.js 22+；打包需要 `zip`。

```sh
npm ci
npm run check       # 严格类型检查 + 本地 HTTP 集成测试
npm run build       # src/index.ts -> 根目录 index.js
npm run package     # 可安装 ZIP，含源码和许可证
npm run test:upstream
# 可选：以本地仓库作为克隆源，仍检出干净的官方固定提交
MYGO_MUSIC_DIR=/path/to/mygo-music npm run test:upstream
# 同时测试官方 ZIP 安装器
MYGO_SUBSONIC_ZIP="$PWD/dist/mygo-subsonic-0.1.2.zip" npm run test:upstream
# 验证另一官方固定提交；也会用真实插件响应检查宿主虚拟列表与续页按钮
MYGO_MUSIC_REVISION=93bf5a6202119305bc36fa7b1da71402c96e6879 npm run test:upstream
```

`src/index.ts` 只公开上游能力；地址解析、配置、鉴权、路由、HTTP、模型映射和业务功能分模块维护。不要手改生成的根目录 `index.js`。

**为什么还要打包？** 官方支持单文件 TS 入口，但当前加载器不解析跨文件 `import` / re-export，JS 转接入口也不能解决。构建时将模块化 TS 合并为自包含 JS，用户安装时无需构建；真实运行时测试覆盖这三种入口情况。

上游测试需要 Git、官方 `go.mod` 指定的 Go 工具链及依赖网络；只测试未修改宿主，不使用 fork。普通测试只连接临时本地 HTTP 服务。CI 检查提交的构建产物并生成 ZIP。发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[AGPL-3.0-only](LICENSE)，与 MyGo Music 保持一致。本项目不是 MyGo Music 官方维护的插件。
