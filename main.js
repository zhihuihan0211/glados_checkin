const requestJson = async (url, options) => {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`Request failed (HTTP ${response.status})`)
  try {
    return await response.json()
  } catch {
    throw new Error('Invalid JSON response')
  }
}

const sendNotification = async (url, options) => {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`Notification HTTP ${response.status}`)
}

const glados = async () => {
  const notice = []
  if (!process.env.GLADOS?.trim()) {
    console.error('GLADOS secret is missing')
    process.exitCode = 1
    return ['Checkin Error: GLADOS secret is missing']
  }
  const cookies = String(process.env.GLADOS).split(/\r?\n/).map((cookie) => cookie.trim()).filter(Boolean)
  const agents = String(process.env.GLADOS_UA || '').split(/\r?\n/).map((ua) => ua.trim()).filter(Boolean)
  if (!agents.length || (agents.length !== 1 && agents.length !== cookies.length)) {
    console.error('GLADOS_UA secret is missing or does not match the account count')
    process.exitCode = 1
    return ['Checkin Error: GLADOS_UA configuration is invalid']
  }
  for (const [index, cookie] of cookies.entries()) {
    try {
      const common = {
        'cookie': cookie.trim(),
        'referer': 'https://glados.cloud/console/checkin',
        'user-agent': agents[index] || agents[0],
      }
      const action = await requestJson('https://glados.cloud/api/user/checkin', {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json' },
        body: '{"token":"glados.cloud"}',
      })
      const message = String(action?.message || '')
      const repeated = /checkin\s+repeats/i.test(message)
      const normal = repeated || /checkin!\s*got|today's observation logged/i.test(message)
      if (action?.code && !normal) {
        const reason = /please checkin via/i.test(message) ? 'domain rejected'
          : /cookie|log.?in|sign.?in|expired|unauthorized/i.test(message) ? 'authentication rejected'
          : /captcha|cloudflare|challenge/i.test(message) ? 'browser challenge'
          : 'other response'
        const code = String(action.code).replace(/[^0-9-]/g, '').slice(0, 8) || 'unknown'
        throw new Error(`check-in API rejected (code ${code}; ${reason})`)
      }
      const status = await requestJson('https://glados.cloud/api/user/status', {
        method: 'GET',
        headers: { ...common },
      })
      if (status?.code) throw new Error('status API rejected')
      console.log(`Account ${index + 1}: ${repeated ? 'already checked in' : 'check-in succeeded'}`)
      notice.push(
        `Account ${index + 1}: ${repeated ? 'already checked in' : 'check-in succeeded'}`,
        `${action?.message}`,
        `Left Days ${Number(status?.data?.leftDays)}`
      )
    } catch (error) {
      console.error(`Account ${index + 1}: check-in failed (${error instanceof Error ? error.message : 'unknown error'})`)
      process.exitCode = 1
      notice.push(
        `Account ${index + 1}: check-in failed`,
        `${error}`,
        `<${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}>`
      )
    }
  }
  notice.unshift(process.exitCode ? 'Checkin Error' : 'Checkin OK')
  return notice
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice) return
  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue
    try {
      if (option.startsWith('console:')) {
        for (const line of notice) {
          console.log(line)
        }
      } else if (option.startsWith('wxpusher:')) {
        await sendNotification(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('pushplus:')) {
        await sendNotification(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      } else if (option.startsWith('bark:')) {
        await sendNotification(`https://api.day.app/${option.split(':')[1]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1]
        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken;
        await sendNotification(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
                content: notice.join('<br>')
            }
          }),
        })
      } else {
        // fallback
        await sendNotification(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }
    } catch (error) {
      throw error
    }
  }
}

const main = async () => {
  await notify(await glados())
}

main().catch((error) => {
  const message = String(error?.message || '')
  console.error(message.startsWith('Notification HTTP ') ? message : 'Notification request failed')
  process.exitCode = 1
})
