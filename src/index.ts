import { Status } from '@satorijs/protocol'
import { Bot, Context, Schema } from 'koishi'
import nodemailer from 'nodemailer'

export const name = 'napcat-status'

interface OneBotStatusData {
  online: boolean
  good: boolean
  stat: Record<string, unknown>
}

interface OneBotInternal {
  getStatus?: () => Promise<OneBotStatusData>
}

type OneBotRuntimeBot = Bot & {
  selfId: string
  platform?: string
  status: Status
  internal?: OneBotInternal
}

export interface Config {
  monitor: {
    enable: boolean
    checkOnStartup: boolean
    checkInterval: number
    reminderCooldown: number
  }
  mail: {
    enable: boolean
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
    to: string[]
    subject: string
  }
}

export const Config: Schema<Config> = Schema.object({
  monitor: Schema.object({
    enable: Schema.boolean().default(false).description('是否启用定时巡检。'),
    checkOnStartup: Schema.boolean().default(true).description('启动后是否立即执行一次巡检。'),
    checkInterval: Schema.number().default(60).description('巡检间隔，单位为秒。'),
    reminderCooldown: Schema.number().default(600).description('相同告警的邮件提醒冷却时间，单位为秒。'),
  }).description('定时巡检配置'),
  mail: Schema.object({
    enable: Schema.boolean().default(false).description('是否启用邮件告警。'),
    host: Schema.string().default('').description('SMTP 服务器地址。'),
    port: Schema.number().default(465).description('SMTP 服务器端口。'),
    secure: Schema.boolean().default(true).description('是否启用 SSL/TLS。'),
    user: Schema.string().default('').description('SMTP 用户名。'),
    pass: Schema.string().role('secret').default('').description('SMTP 密码或授权码。'),
    from: Schema.string().default('').description('发件人邮箱。'),
    to: Schema.array(Schema.string()).default([]).description('收件人邮箱列表。'),
    subject: Schema.string().default('[NapCat 状态告警]').description('邮件主题。'),
  }).description('邮件告警配置'),
})

interface StatusSnapshot {
  bot: OneBotRuntimeBot
  data?: OneBotStatusData
  error?: string
}

function isOneBotRuntimeBot(bot: Bot): bot is OneBotRuntimeBot {
  return bot.platform === 'onebot' && typeof (bot as OneBotRuntimeBot).selfId === 'string'
}

function formatKoishiStatus(status: Status) {
  switch (status) {
    case Status.ONLINE:
      return 'ONLINE'
    case Status.CONNECT:
      return 'CONNECT'
    case Status.DISCONNECT:
      return 'DISCONNECT'
    case Status.RECONNECT:
      return 'RECONNECT'
    default:
      return 'OFFLINE'
  }
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
  return JSON.stringify(value)
}

function formatStat(stat: Record<string, unknown>) {
  const entries = Object.entries(stat)
  if (!entries.length) return '{}'
  return entries
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(', ')
}

function resolveBots(ctx: Context) {
  return ctx.bots.filter(isOneBotRuntimeBot)
}

async function queryStatus(bot: OneBotRuntimeBot): Promise<StatusSnapshot> {
  const getStatus = bot.internal?.getStatus

  if (typeof getStatus !== 'function') {
    return {
      bot,
      error: '适配器连接未暴露 getStatus 接口。',
    }
  }

  try {
    const data = await getStatus.call(bot.internal)
    return { bot, data }
  } catch (error) {
    return {
      bot,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function queryStatuses(bots: OneBotRuntimeBot[]) {
  return Promise.all(bots.map(queryStatus))
}

function isAbnormal(snapshot: StatusSnapshot) {
  return !!snapshot.error || snapshot.data?.online !== true
}

function getAlertKey(snapshots: StatusSnapshot[]) {
  return snapshots
    .map((snapshot) => {
      if (snapshot.error) return `${snapshot.bot.selfId}:error:${snapshot.error}`
      return `${snapshot.bot.selfId}:online:${snapshot.data.online}`
    })
    .sort()
    .join('|')
}

function canSendMail(config: Config['mail']) {
  return config.enable
    && !!config.host
    && !!config.from
    && config.to.length > 0
}

function createMailText(snapshots: StatusSnapshot[]) {
  const lines = [
    'NapCat OneBot 账号状态告警',
    `检查时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `异常账号数: ${snapshots.length}`,
    '',
  ]

  for (const snapshot of snapshots) {
    lines.push(`账号: ${snapshot.bot.selfId}`)
    lines.push(`Koishi 状态: ${formatKoishiStatus(snapshot.bot.status)}`)
    if (snapshot.error) {
      lines.push(`结果: 获取状态失败 (${snapshot.error})`)
    } else {
      lines.push(`OneBot 在线: ${snapshot.data.online ? '是' : '否'}`)
      lines.push(`OneBot 健康: ${snapshot.data.good ? '是' : '否'}`)
      lines.push(`统计信息: ${formatStat(snapshot.data.stat)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger(name)
  let checking = false
  let lastAlertAt = 0
  let lastAlertKey = ''

  const checkAllBots = async () => {
    if (!config.monitor.enable) return
    if (checking) return

    const targets = resolveBots(ctx)
    if (!targets.length) return

    checking = true

    try {
      const snapshots = await queryStatuses(targets)
      const abnormal = snapshots.filter(isAbnormal)

      for (const snapshot of snapshots) {
        if (snapshot.error) {
          logger.warn(`账号 ${snapshot.bot.selfId} 获取状态失败: ${snapshot.error}`)
        }
      }

      if (!abnormal.length) {
        lastAlertAt = 0
        lastAlertKey = ''
        return
      }

      if (!canSendMail(config.mail)) {
        logger.warn('检测到异常账号，但邮件告警配置不完整或未启用。')
        return
      }

      const alertKey = getAlertKey(abnormal)
      const now = Date.now()
      const shouldSend = alertKey !== lastAlertKey
        || !lastAlertAt
        || now - lastAlertAt >= config.monitor.reminderCooldown * 1000

      if (!shouldSend) return

      const transporter = nodemailer.createTransport({
        host: config.mail.host,
        port: config.mail.port,
        secure: config.mail.secure,
        auth: config.mail.user
          ? {
              user: config.mail.user,
              pass: config.mail.pass,
            }
          : undefined,
      })

      await transporter.sendMail({
        from: config.mail.from,
        to: config.mail.to,
        subject: config.mail.subject,
        text: createMailText(abnormal),
      })

      lastAlertAt = now
      lastAlertKey = alertKey
      logger.info(`已发送状态告警邮件，异常账号数: ${abnormal.length}`)
    } catch (error) {
      logger.warn(error)
    } finally {
      checking = false
    }
  }

  ctx.on('ready', () => {
    if (!config.monitor.enable) return

    if (config.monitor.checkOnStartup) {
      void checkAllBots()
    }

    ctx.setInterval(() => {
      void checkAllBots()
    }, config.monitor.checkInterval * 1000)
  })
}
