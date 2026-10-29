import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
const ok = body => ({ ok: true, json: async () => body })
const checkin = (code = 0, message = '') => ok({ code, message })
const status = (leftDays = 10) => ok({ code: 0, data: { leftDays } })
const points = (points = 600) => ok({ code: 0, points })
async function run(responses, env = {}) {
  const calls = [], logs = []
  const process = { env: { GLADOS: 'cookie-private-marker', GLADOS_UA: 'ua-private-marker', ...env } }
  const context = vm.createContext({ process, console: Object.fromEntries(['log', 'warn', 'error'].map(k => [k, (...args) => logs.push(args.join(' '))])),
    fetch: async (url, options) => {
      calls.push({ url, options })
      assert.ok(responses.length, 'unexpected fetch; no network is available in this VM')
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    } })
  await vm.runInContext(source.slice(0, source.indexOf('// 全局错误捕获')) + '\nmain()', context)
  assert.equal(responses.length, 0)
  const output = logs.join('\n')
  for (const secret of ['cookie-private-marker', 'ua-private-marker', 'response-private-marker']) assert.ok(!output.includes(secret))
  return { calls, output, exit: process.exitCode || 0 }
}

test('default and non-true switches never exchange, even with enough points', async () => {
  for (const AUTO_EXCHANGE of [undefined, 'false', '1', 'yes']) {
    const r = await run([checkin(), status(), points()], { AUTO_EXCHANGE })
    assert.equal(r.calls.length, 3); assert.equal(r.exit, 0); assert.match(r.output, /600 点/)
  }
})
test('code=1 and legacy messages count as already checked in', async () => {
  for (const response of [checkin(1), checkin(-2, 'checkin repeats')]) {
    const r = await run([response, status(), points()], { NOTIFY: 'console:log' })
    assert.match(r.output, /今日已签到/); assert.match(r.output, /成功 1 个 \| 失败 0 个/)
    assert.match(r.output, /GLaDOS 签到成功/)
  }
})
test('strict credentials and CRLF/multi-account parsing', async () => {
  for (const env of [{ GLADOS: '' }, { GLADOS: ' \r\n' }, { GLADOS_UA: '' }, { GLADOS_UA: 'a\nb' }]) {
    assert.equal((await run([], env)).exit, 1)
  }
  const r = await run([checkin(), status(), points(), checkin(), status(), points()], { GLADOS: ' c1 \r\n\r\n c2 ', GLADOS_UA: ' ua \r\n' })
  assert.equal(r.calls[0].options.headers.cookie, 'c1'); assert.equal(r.calls[3].options.headers.cookie, 'c2')
  assert.equal(r.calls[3].options.headers['user-agent'], 'ua')
  assert.match(r.output, /成功 2 个/)
})
test('failed account is counted and raw server errors stay private', async () => {
  const r = await run([checkin(-2, 'unauthorized response-private-marker'), checkin(), status(), points()], { GLADOS: 'a\nb', NOTIFY: 'console:log' })
  assert.equal(r.exit, 1); assert.match(r.output, /成功 1 个 \| 失败 1 个/); assert.match(r.output, /GLaDOS 签到失败/)
})
test('points failure never exchanges or invents zero', async () => {
  for (const response of [points(null), points(''), points('bad'), new Error('response-private-marker')]) {
    const r = await run([checkin(), status(), response], { AUTO_EXCHANGE: 'true' })
    assert.equal(r.calls.length, 3); assert.equal(r.exit, 0); assert.match(r.output, /查询失败/)
  }
})
test('opt-in exchanges once and reports refreshed balances', async () => {
  const r = await run([checkin(), status(), points(), ok({ code: 0, message: 'response-private-marker' }), points(100), status(110)], { AUTO_EXCHANGE: 'true', NOTIFY: 'console:log' })
  assert.equal(r.exit, 0); assert.equal(r.calls.filter(c => c.url.endsWith('/exchange')).length, 1)
  assert.equal(r.calls[3].options.body, '{"planType":"plan500"}')
  assert.match(r.output, /剩余 110 天/); assert.match(r.output, /账号1: 100 点/); assert.doesNotMatch(r.output, /600 点|剩余 10 天/)
})
test('failed refresh labels unknown balances, not stale values', async () => {
  const r = await run([checkin(), status(), points(), ok({ code: 0 }), new Error('response-private-marker'), new Error('response-private-marker')], { AUTO_EXCHANGE: 'true', NOTIFY: 'console:log' })
  assert.match(r.output, /剩余 刷新失败/); assert.match(r.output, /当前积分 查询失败/); assert.doesNotMatch(r.output, /600 点|剩余 10 天/)
})
test('exchange errors fail the task without changing checkin count or retrying', async () => {
  const r = await run([checkin(), status(), points(), new Error('response-private-marker'), points(100), status(110)], { AUTO_EXCHANGE: 'true', NOTIFY: 'console:log' })
  assert.equal(r.exit, 1); assert.equal(r.calls.filter(c => c.url.endsWith('/exchange')).length, 1)
  assert.match(r.output, /成功 1 个 \| 失败 0 个/)
})
test('invalid and higher thresholds prevent exchange', async () => {
  for (const EXCHANGE_THRESHOLD of ['0', '499', 'NaN', 'Infinity', '700']) {
    const r = await run([checkin(), status(), points()], { AUTO_EXCHANGE: 'true', EXCHANGE_THRESHOLD })
    assert.equal(r.calls.length, 3); assert.equal(r.exit, EXCHANGE_THRESHOLD === '700' ? 0 : 1)
  }
})
test('notification HTTP failures fail the task for every supported channel', async () => {
  for (const NOTIFY of ['wxpusher:token:uid', 'pushplus:token', 'bark:token', 'qyweixin:token', 'legacy']) {
    const r = await run([checkin(), status(), points(), { ok: false, status: 503 }], { NOTIFY })
    assert.equal(r.exit, 1); assert.match(r.output, /HTTP 503/)
  }
})
test('workflow push is main-only and opt-in variables are passed', () => {
  const workflow = readFileSync(new URL('../.github/workflows/run.yml', import.meta.url), 'utf8')
  assert.match(workflow, /push:\n    branches: \[main\]/)
  assert.match(workflow, /AUTO_EXCHANGE: 'false'/)
  assert.match(workflow, /EXCHANGE_THRESHOLD: \$\{\{ vars.EXCHANGE_THRESHOLD \|\| '500' \}\}/)
})
