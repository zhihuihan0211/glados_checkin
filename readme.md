# Checkin

GitHub Actions 实现 [GLaDOS][glados] 自动签到

([GLaDOS][glados] 可用邀请码: `MW4DK-O0RSF-C7AOU-EN1MP`, 双方都有奖励天数)

## 使用说明

1. Fork 这个仓库

1. 登录 [GLaDOS][glados] 获取 Cookie

1. 将登录浏览器中的完整 Cookie 添加到 Actions Secret `GLADOS`。当前需要包含 `gld:sess.sig`、`gld:sess`、`koa:sess.sig` 和 `koa:sess` 四项；不要把 Cookie 发到聊天或提交到仓库。

1. 在**同一个登录浏览器**的开发者工具控制台运行 `navigator.userAgent`，将结果添加到 Actions Secret `GLADOS_UA`。GLaDOS 会校验签到请求的 User-Agent；未配置或与登录时不一致可能返回“没有权限”。

1. 启用 Actions，计划每天北京时间 00:10 签到；GitHub 的定时运行可能延迟。

## 高级功能

1. 如有多个帐号，可以在 Secret `GLADOS` 中每行写一个 Cookie；`GLADOS_UA` 可只写一行供所有帐号共用，或每行写一个并与 Cookie 顺序对应。

1. 如需修改时间, 可以修改文件 [run.yml](.github/workflows/run.yml#L7) 中的 `cron` 参数, 格式可参考 [crontab]

1. 如需推送通知, 可配置 Secret `NOTIFY`, 已支持:
    1. [WxPusher][wxpusher]: 格式 `wxpusher:{token}:{uid}`
    1. [PushPlus][pushplus]: 格式 `pushplus:{token}`
    1. [Bark][bark]: 格式 `bark:{key}`
    1. [企业微信][qyweixin]: 格式 `qyweixin:{key}`
    1. Console: 格式 `console:log`, 作为日志输出, 一般用于调试
    1. 如需配置多个, 可以写为多行, 每行写一个

1. 注意: Cookie 以及接口输出数据, 包含帐号敏感信息, 因此不要随意公开

---

[glados]: https://github.com/glados-network/GLaDOS
[crontab]: https://crontab.guru/
[pushplus]: https://www.pushplus.plus/
[wxpusher]: https://wxpusher.zjiecode.com/
[bark]: https://github.com/Finb/Bark
[qyweixin]: https://developer.work.weixin.qq.com/document/path/91770
