// ========== 工具函数：敏感信息脱敏 ==========
// 只显示首尾各4位，避免日志泄露密钥
const mask = (str, startLen = 4, endLen = 4) => {
  if (!str || typeof str !== 'string') return '***'
  if (str.length <= startLen + endLen) return '*'.repeat(str.length)
  return str.slice(0, startLen) + '****' + str.slice(-endLen)
}

// ========== GLaDOS 签到核心逻辑 ==========
const glados = async () => {
  const notice = []
  let successCount = 0
  let failCount = 0
  console.log('========== GLaDOS 签到任务开始 ==========')

  // 环境变量检测
  if (!process.env.GLADOS) {
    console.error('未配置 GLADOS Secret')
    process.exitCode = 1
    return notice
  }

  const agents = String(process.env.GLADOS_UA || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  const cookies = String(process.env.GLADOS).split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  if (!agents.length || (agents.length !== 1 && agents.length !== cookies.length)) {
    console.error('GLADOS_UA Secret 缺失或与账号数量不匹配')
    process.exitCode = 1
    return notice
  }

  console.log(`📋 共检测到 ${cookies.length} 个账号`)
  console.log(`📋 自定义 UA 数量: ${agents.length}${agents.length < cookies.length ? '（不足时将使用默认UA）' : ''}`)

  for (const [index, cookie] of cookies.entries()) {
    const accountNo = index + 1
    console.log(`\n[账号 ${accountNo}] ---------- 开始处理 ----------`)

    try {
      const domain = process.env.DOMAIN || 'glados.cloud'
      const ua = agents[index] || agents[0]
      
      console.log(`[账号 ${accountNo}] 目标域名: ${domain}`)

      const common = {
        'cookie': cookie,
        'referer': `https://${domain}/console/checkin`,
        'user-agent': ua,
      }

      // 1. 执行签到（与原代码顺序完全一致）
      console.log(`[账号 ${accountNo}] 正在执行签到请求...`)
      const checkinRes = await fetch(`https://${domain}/api/user/checkin`, {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json' },
        body: JSON.stringify({ token: domain }),
      })

      // HTTP 层错误捕获（网络错误、404、500等）
      if (!checkinRes.ok) {
        throw new Error(`签到接口HTTP错误: ${checkinRes.status} ${checkinRes.statusText}`)
      }

      const action = await checkinRes.json()
      console.log(`[账号 ${accountNo}] 签到接口响应码: ${action?.code ?? '无'}`)

      const actionMessage = String(action?.message || '')
      const repeated = /checkin\s+repeats/i.test(actionMessage)
      const normal = repeated || /checkin!\s*got|today's observation logged/i.test(actionMessage)
      if (Number(action?.code) !== 0 && !normal) {
        const reason = /please checkin via/i.test(actionMessage) ? '域名被拒绝'
          : /cookie|log.?in|sign.?in|expired|unauthorized|没有权限/i.test(actionMessage) ? '登录或权限被拒绝'
          : /captcha|cloudflare|challenge/i.test(actionMessage) ? '浏览器验证'
          : '其他响应'
        const code = String(action?.code).replace(/[^0-9-]/g, '').slice(0, 8) || 'unknown'
        throw new Error(`签到接口拒绝 (code=${code}, ${reason})`)
      }

      // 2. 获取账号状态（签到后更新剩余天数）
      console.log(`[账号 ${accountNo}] 正在获取账号状态...`)
      const statusRes = await fetch(`https://${domain}/api/user/status`, {
        method: 'GET',
        headers: { ...common },
      })

      if (!statusRes.ok) {
        throw new Error(`状态接口HTTP错误: ${statusRes.status} ${statusRes.statusText}`)
      }

      const status = await statusRes.json()
      console.log(`[账号 ${accountNo}] 状态接口响应码: ${status?.code ?? '无'}`)

      if (Number(status?.code) !== 0) {
        const code = String(status?.code).replace(/[^0-9-]/g, '').slice(0, 8) || 'unknown'
        throw new Error(`登录状态异常 (code=${code})`)
      }

      // 签到成功
      const leftDays = Number(status?.data?.leftDays)
      if (!Number.isFinite(leftDays)) throw new Error('状态接口缺少有效剩余天数')
      successCount += 1
      console.log(`[账号 ${accountNo}] ${repeated ? '今日已签到' : '签到成功'}；剩余 ${leftDays} 天`)
      notice.push(`【账号${accountNo}】${repeated ? '今日已签到' : '签到成功'}；剩余 ${leftDays} 天`)

    } catch (error) {
      failCount += 1
      process.exitCode = 1
      const message = String(error?.message || '')
      const detail = /^(签到接口HTTP错误:|状态接口HTTP错误:|签到接口拒绝|登录状态异常|状态接口缺少有效剩余天数)/.test(message)
        ? message : '网络或响应解析错误'
      console.error(`[账号 ${accountNo}] 签到失败：${detail}`)
      notice.push(`【账号${accountNo}】签到失败：${detail}`)
    }
  }

  // 汇总统计
  console.log('\n========== 签到任务处理完成 ==========')
  console.log(`📊 统计结果：成功 ${successCount} 个 | 失败 ${failCount} 个`)
  notice.unshift(failCount ? 'GLaDOS 签到失败' : 'GLaDOS 签到成功')
  return notice
}

// ========== 通知推送模块 ==========
const notify = async (notice) => {
  console.log('\n========== 通知推送模块开始 ==========')

  if (!process.env.NOTIFY) {
    console.log('⚠️  未配置 NOTIFY 环境变量，跳过推送通知')
    return
  }

  if (!notice || notice.length === 0) {
    console.log('⚠️  无通知内容，跳过推送')
    return
  }

  const options = String(process.env.NOTIFY).split('\n').filter(Boolean)
  console.log(`📋 共配置 ${options.length} 个通知渠道`)

  for (const [idx, option] of options.entries()) {
    const channelNo = idx + 1
    let channelType = '默认(pushplus)'

    try {
      if (option.startsWith('console:')) {
        channelType = '控制台输出'
        console.log(`\n[通知 ${channelNo}] 正在推送至 ${channelType}`)
        console.log('———————— 通知内容 ————————')
        notice.forEach(line => console.log(line))
        console.log('————————————————————————')
        console.log(`[通知 ${channelNo}] ✅ 控制台输出完成`)

      } else if (option.startsWith('wxpusher:')) {
        channelType = 'WxPusher'
        console.log(`\n[通知 ${channelNo}] 正在推送至 ${channelType}`)
        
        const parts = option.split(':')
        const appToken = parts[1]
        const uids = parts.slice(2)
        
        console.log(`[通知 ${channelNo}] 推送UID数量: ${uids.length}`)

        const res = await fetch(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: appToken,
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: uids,
          }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.code !== 1000) {
          throw new Error(`接口返回 code=${Number(result.code)}`)
        }
        console.log(`[通知 ${channelNo}] ✅ WxPusher 推送成功`)

      } else if (option.startsWith('pushplus:')) {
        channelType = 'PushPlus'
        console.log(`\n[通知 ${channelNo}] 正在推送至 ${channelType}`)
        
        const token = option.split(':')[1]

        const res = await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: token,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.code !== 200) {
          throw new Error(`接口返回 code=${Number(result.code)}`)
        }
        console.log(`[通知 ${channelNo}] ✅ PushPlus 推送成功`)

      } else if (option.startsWith('bark:')) {
        channelType = 'Bark'
        console.log(`\n[通知 ${channelNo}] 正在推送至 ${channelType}`)
        
        const barkKey = option.split(':')[1]

        const res = await fetch(`https://api.day.app/${barkKey}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.code !== 200) {
          throw new Error(`接口返回 code=${Number(result.code)}`)
        }
        console.log(`[通知 ${channelNo}] ✅ Bark 推送成功`)

      } else if (option.startsWith('qyweixin:')) {
        channelType = '企业微信Webhook'
        console.log(`\n[通知 ${channelNo}] 正在推送至 ${channelType}`)
        
        const qyToken = option.split(':')[1]

        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyToken
        const res = await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
                content: notice.join('<br>')
            }
          }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.errcode !== 0) {
          throw new Error(`接口返回 errcode=${Number(result.errcode)}`)
        }
        console.log(`[通知 ${channelNo}] ✅ 企业微信推送成功`)

      } else {
        // 兼容旧格式：无前缀默认走 pushplus
        channelType = '默认PushPlus(兼容旧格式)'
        console.log(`\n[通知 ${channelNo}] 未识别渠道前缀，使用 ${channelType}`)

        const res = await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()

        if (result.code !== 200) {
          throw new Error(`接口返回 code=${Number(result.code)}`)
        }
        console.log(`[通知 ${channelNo}] ✅ PushPlus 推送成功`)
      }

    } catch (error) {
      console.error(`[通知 ${channelNo}] ❌ ${channelType} 推送失败`)
      const message = String(error?.message || '')
      const detail = /^HTTP \d+$|^接口返回 (?:code|errcode)=/.test(message) ? message : '网络或响应解析错误'
      console.error(`[通知 ${channelNo}] ${detail}`)
      process.exitCode = 1
      // 单个渠道失败不中断其他渠道推送
    }
  }

  console.log('\n========== 通知推送模块结束 ==========')
}

// ========== 主入口 ==========
const main = async () => {
  const notice = await glados()
  await notify(notice)
  console.log('\n🎉 全部任务执行完毕')
}

// 全局错误捕获，避免程序静默失败
main().catch(() => {
  console.error('未捕获错误')
  process.exitCode = 1
})
