# Checkin

GitHub Actions 实现 [GLaDOS][glados] 自动签到

([GLaDOS][glados] 可用邀请码: `MW4DK-O0RSF-C7AOU-EN1MP`, 双方都有奖励天数)

## 使用说明

1. Fork 这个仓库

1. 登录 [GLaDOS][glados] 获取 Cookie

1. 添加 Cookie 到 Secret `GLADOS`,cookie格式 gld:sess.sig=对应的值; gld:sess=对应的值; koa:sess.sig=对应的值; koa:sess=对应的值
   
1. cookie获取，浏览器按f12存储里面就是，四个都要带上

1. 添加同一浏览器的浏览器代理到 Secret `GLADOS_UA` (浏览器控制台执行 `navigator.userAgent` 获取)

    - GLaDOS 签到会校验当前浏览器是否与登录时一致, UA 不一致会返回 `没有权限`
    - 浏览器大版本更新后 UA 会变化, 如再次报错需重新登录并同时更新 `GLADOS` 与 `GLADOS_UA`

1. 启用 Actions, 每天北京时间 00:10 自动签到
1. 日志和通知展示每个账号当前积分及汇总；识别今日已签到，保留成功/失败统计。签到或通知失败以非零状态退出。
1. 自动兑换**默认关闭**。当前工作流固定传入 `AUTO_EXCHANGE=false`，已有仓库变量无法开启兑换。如未来需要开启，先将 `run.yml` 的该值改为 `${{ vars.AUTO_EXCHANGE || 'false' }}`，再在 Settings → Secrets and variables → Actions → Variables 添加以下仓库变量（不是 Secrets）：

| 变量 | 默认值 | 说明 |
| ---- | ---- | ---- |
| AUTO_EXCHANGE | false | 仅显式设置 `true` 才开启自动兑换 |
| EXCHANGE_THRESHOLD | 500 | 触发阈值，必须至少为 500；每次仍消耗 500 积分兑换 100 天 |

兑换后会重新查询积分和剩余天数；刷新失败会明确提示，不展示兑换前的余额。兑换失败或结果未确认不重试，签到成功计数不受影响，但任务会以非零状态退出。积分查询失败不会触发兑换，也不会冒充 0 积分。

推送仅在 `main` 分支触发签到；新分支推送不会执行签到。定时和手动触发保留。

## 高级功能

1. 如有多个帐号, 可以写为多行 Secret `GLADOS`, 每行写一个 Cookie; `GLADOS_UA` 可同样按行对应, 只写一行则所有帐号共用

1. 如需修改时间, 可以修改文件 [run.yml](.github/workflows/run.yml#L7) 中的 `cron` 参数, 格式可参考 [crontab]

1. 如需其他域名, 可配置 Secret `DOMAIN`, 可填写: `railgun.info`

1. 如需推送通知, 可配置 Secret `NOTIFY`, 已支持:
    1. [WxPusher][wxpusher]: 格式 `wxpusher:{token}:{uid}`
    1. [PushPlus][pushplus]: 格式 `pushplus:{token}`
    1. [Bark][finbbark]: 格式 `bark:{key}`
    1. [企业微信][qyweixin]: 格式 `qyweixin:{key}`
    1. Console: 格式 `console:log`, 作为日志输出, 一般用于调试
    1. 如需配置多个, 可以写为多行, 每行写一个

1. 注意: Cookie 以及接口输出数据, 包含帐号敏感信息, 因此不要随意公开

---

[glados]: https://github.com/glados-network/GLaDOS
[crontab]: https://crontab.guru/
[pushplus]: https://www.pushplus.plus/
[wxpusher]: https://wxpusher.zjiecode.com/
[finbbark]: https://github.com/Finb/Bark
[qyweixin]: https://developer.work.weixin.qq.com/document/path/91770
