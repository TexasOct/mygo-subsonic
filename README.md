# MyGo Subsonic

[English](README.en.md) · 简体中文

在 [MyGo Music](https://github.com/egoist/mygo-music) 中收听自己的 Subsonic 音乐库。你需要已有的音乐服务器和账号；插件本身不提供音乐资源或服务端。

## 支持什么

| 项目 | 支持范围 |
| --- | --- |
| 播放器 | 官方 MyGo Music **0.1.13+** |
| 音乐服务器 | 兼容 Subsonic / OpenSubsonic 的服务器，需支持 API 1.16.1 及所用接口 |
| 音乐库 | 浏览、搜索歌曲 / 专辑 / 歌手 / 歌单，显示封面和歌词 |
| 收藏与歌单 | 喜欢歌曲、收藏专辑、关注歌手；创建、编辑、排序和删除自己的歌单 |
| 播放 | 原音优先、FLAC 无损直放，可选向服务器记录播放历史 |

Navidrome、Gonic、原版 Subsonic 属于这类服务器，但尚未逐一实机验证，具体功能取决于服务端支持。

## 安装

[一键安装](mygo-music://install-plugin?repo=TexasOct/mygo-subsonic)

如果链接无法打开，在 MyGo 的 **设置 → 插件 → +** 中粘贴：

```text
https://github.com/TexasOct/mygo-subsonic
```

也可以从 [Releases](https://github.com/TexasOct/mygo-subsonic/releases) 下载插件 ZIP 后本地安装。无需安装 Node.js 或编译。

### 第一次使用

1. 打开 **设置 → 插件 → Subsonic**。
2. 填写服务器地址（例如 `http://192.168.1.10:4533`）、用户名和密码，其他选项通常留空即可。
3. 切换到 Subsonic 音源，点击**登录**。

连接信息需要在插件设置中填写。登录失败时，先关闭登录窗口，再返回设置检查地址和账号；修改后重新登录。

<a id="configuration"></a>
<a id="配置与鉴权"></a>
## 常用设置

同一服务器有内网和公网地址时，用英文逗号分隔，优先使用的放前面，最多 5 个。例如：

```text
http://192.168.1.10:4533, https://music.example.com/navidrome
```

支持 HTTP、HTTPS、端口和子路径。只填写可信的**同一服务器**入口，不要在地址中附带账号、密码或查询参数；每个入口都可能收到该账号的鉴权信息。

| 选项 | 怎么填 |
| --- | --- |
| 登录方式 | 通常留空；仅在服务器要求时填写 `legacy` |
| 音乐目录 ID（可不填） | 留空使用所有目录；如需限制，填写服务器提供的目录 ID，不是目录名或磁盘路径，且不影响歌单 |
| 记录播放历史 | 填写 `true` 开启，留空或 `false` 关闭；按 MyGo 的已播放事件上报，不代表整首听完 |

## 使用注意

- 当前只支持一个服务器、一组账号。更换服务器或账号前，请清空旧播放队列并重新加载音乐。
- MP3、FLAC 和 Ogg Vorbis 均直接播放原文件，不因选择标准 / 高音质而转码；FLAC 保持无损。
- 官方 MyGo 暂无 WAV、AAC、ALAC、Opus 等格式的解码器，这些格式才请求服务端转成 MP3（标准最高 128 kbps，其他最高 320 kbps），需要服务端配置和权限。格式信息不明或冲突时会报错，不会自动有损转码。
- 内网 / 公网地址可自动回退，但不保证正在播放的歌曲无缝切换。
- 大音乐库可能分批显示；看到“其余专辑”时，点击“查看全部”继续。
- 只能修改自己的歌单；从歌单删除一首歌会移除其中该歌曲的所有重复项。
- **MyGo 会明文显示和保存密码。** 建议使用专用低权限账号，公网连接使用 HTTPS。不要分享配置截图或带鉴权参数的音频、封面链接。详见[安全说明](SECURITY.md)。

## 反馈与开发

遇到问题请[提交 Issue](https://github.com/TexasOct/mygo-subsonic/issues)，说明 MyGo、插件和服务端版本，以及复现步骤，不要附上密码或其他敏感信息。

开发、测试和技术细节见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[AGPL-3.0-only](LICENSE)。本项目不是 MyGo Music 官方维护的插件。
