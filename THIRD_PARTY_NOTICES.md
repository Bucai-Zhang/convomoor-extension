# 第三方依赖与名称

Chrome 直接加载的 `src/` 使用浏览器 API，不打包额外 npm 运行时依赖。测试使用 jsdom 26.1.0（MIT）及其锁定的传递依赖，完整依赖树和各自 license 元数据见 `package-lock.json`；安装后以依赖包自身的 LICENSE/NOTICE 为准。不要将本项目的 MIT 协议替代依赖的许可条款。

- [jsdom 源项目](https://github.com/jsdom/jsdom)
- [jsdom 的 MIT 许可证](https://github.com/jsdom/jsdom/blob/main/LICENSE.txt)

浏览器、ChatGPT、模型服务和 GPT Master 的代码、名称与素材不因本项目 MIT 而获得再许可。原参考软件未作为依赖打包。开发过程见 `ORIGIN.md`。
