# VanillaSpeak 归属与修改声明 · Attribution and modification notice

[VanillaSpeak](https://github.com/Lorikein12138/VanillaSpeak) 从上游 [WebSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak) 的 [v0.3.2](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/releases/tag/v0.3.2) 导入，源提交为 [`a84f66b47d3916fb3d080d0f9b6f4cf3b4ba4ca0`](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/commit/a84f66b47d3916fb3d080d0f9b6f4cf3b4ba4ca0)。导入日期为 2026-11-25。导入调整了文档引用、项目链接、Compose 本地构建和忽略规则，沿用 VanillaSpeak 的 PR 规范，排除上游 ILLUSIA 示例及其美术，并补齐 WASM 随附许可。项目沿用 [AGPL-3.0-only](./LICENSE)。

This VanillaSpeak snapshot imports WebSpeak v0.3.2 from the commit linked above. Imported on 2026-11-25. The import updates documentation, project links and ignore rules, builds the Compose service from local source, retains VanillaSpeak’s PR conventions, omits the upstream ILLUSIA example and its artwork, and includes the WASM third-party licenses. See the [upstream release notes](./docs/README.en.md#latest-release-notes) and [AGPL-3.0-only license](./LICENSE).

## 修改记录 · Modification history

- 2026-11-25 · VanillaSpeak 更新品牌、日夜外观和 Web 工作区，并调整公开入口与管理控制台。VanillaSpeak updated branding, day and night appearance, the web workspace, the public entry and the administration console.
- 2026-11-26 · VanillaSpeak 统一公开工作区、演示、后台和宿主界面的日夜外观，调整桌面语音共享入口和面板底部的聊天输入，新增前后端与 Docker 的 PR 验证，调整测试发现，精简根 README 并迁移归属声明。VanillaSpeak updated the day and night appearance across the public workspace, demo, admin console and host controls, moved desktop screen sharing to the workspace header, anchored the chat composer within its panel, added frontend, backend and Docker PR checks, updated test discovery, and moved attribution from the shortened README to this notice.

WebSpeak 的版权及贡献归属原作者与贡献者。VanillaSpeak 的修改由其贡献者保有相应版权。第三方材料随附的许可与归属继续适用。Copyright in WebSpeak and its contributions remains with the original authors and contributors. VanillaSpeak contributors retain their respective copyright in their changes. Third-party materials retain their accompanying licenses and attribution.

## 贡献者 · Contributors

感谢协议 SDK 作者、代码与文档贡献者，以及独立皮肤的原始作者。Thanks to the SDK author, code and documentation contributors, and original skin authors.

- [HoneyBBQ](https://github.com/HoneyBBQ) — 上游 [teamspeak-js（`@honeybbq/teamspeak`）](https://github.com/HoneyBBQ/teamspeak-js) SDK 的作者，为 WebSpeak 提供底层 TeamSpeak 协议客户端能力。
- [ph1gros](https://github.com/ph1gros) — 在 [PR #48](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/48) 中报告并提供公开目标 IPv6 校验、管理员认证与会话、代理限流和 PCM 上行边界的安全审查、补丁及回归测试；相关问题由项目在 `dev` 分支重新实现并修复。[PR #46](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/46) 提供 TS3 版本识别修复及兼容性文档建议。Security findings, proposed fixes and regression tests; reimplemented on `dev`.
- [LainHE](https://github.com/LainHE) — [已合并 PR #2、#8、#28、#31–#35、#37、#38、#40](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pulls?q=is%3Apr+is%3Amerged+author%3ALainHE)，涉及浏览器报错翻译、缩放与首页布局、屏幕共享码率与观看者头像、中继目标校验与异常重连、可信代理校验、连接失败传递、音频故障报告及 WebRTC 失败时的资源清理。
- [TimmySheep](https://github.com/TimmySheep) — [已合并 PR #13、#15–#24](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pulls?q=is%3Apr+is%3Amerged+author%3ATimmySheep)，涉及 TS6 既有屏幕共享发现、屏幕比例、移动端语音/常亮/皮肤菜单、身份频道选项、PWA/主题、聊天历史、成员音频状态和麦克风权限等改进。
- [yichen11818](https://github.com/yichen11818) — [PR #25](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/25) 支持 TeamSpeak 注册昵称连接并保留昵称目标；[PR #51](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/51) 改进 KAAK 首次连接后的工作区保留与重连；[PR #27](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/27) 和 [PR #52](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/52) 提供 Discord 皮肤的原始设计与实现（提交署名 **yumi**），后由 WebSpeak 项目移植为[独立分发的 `.wskin` 皮肤](https://github.com/Huddle-Up-Forge/webspeak-skin-discord-voice)。

- [Jh_Harry](https://github.com/JhHarry) — [Persona 3](https://github.com/JhHarry/webspeak-skin-persona3)、[Persona 4](https://github.com/JhHarry/webspeak-skin-persona4) 和 [Persona 5](https://github.com/JhHarry/webspeak-skin-persona5) 的皮肤样式、构建脚本与打包。Theme styles, build scripts, and packaging for the three Persona skins.
- [OddTurtleHead](https://github.com/OddTurtleHead) — [PR #57](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/57) 为皮肤开放宿主装饰的定制接口，完善独立皮肤恢复入口，并提供两套示例皮肤。Host chrome theming, a protected skin recovery control, and two example skins.


## 许可证 · License

WebSpeak 使用 [AGPL-3.0-only](./LICENSE) 发布。第三方依赖的许可与归属见各自项目。

WebSpeak is distributed under [AGPL-3.0-only](./LICENSE). Third-party dependencies retain their respective licenses and attribution.
