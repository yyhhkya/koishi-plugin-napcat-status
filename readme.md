# @yyhhkya/koishi-plugin-napcat-status

[![npm](https://img.shields.io/npm/v/@yyhhkya/koishi-plugin-napcat-status?style=flat-square)](https://www.npmjs.com/package/@yyhhkya/koishi-plugin-napcat-status)

## 它做什么

- 定时检查所有 `platform === 'onebot'` 的账号
- 异常时发送告警（支持邮件、企业微信，或两者同时）
- 支持启动后立即检查
- 支持告警冷却，避免短时间重复提醒

## 什么算异常

- 无法获取群列表
- Koishi 连接状态异常
- OneBot 返回 `online === false`

## 配置

### monitor

- `enable`: 是否开启巡检
- `checkOnStartup`: 启动后是否立即检查一次
- `checkInterval`: 巡检间隔（秒）
- `reminderCooldown`: 相同异常提醒冷却时间（秒）

### mail

- `enable`: 是否启用邮件
- `host`: SMTP 地址
- `port`: SMTP 端口
- `secure`: 是否启用 SSL/TLS
- `user`: SMTP 用户名（可空）
- `pass`: SMTP 密码或授权码
- `from`: 发件人邮箱
- `to`: 收件人邮箱列表
- `subject`: 邮件主题

### wecom

- `enable`: 是否启用企业微信机器人
- `webhook`: 企业微信机器人 Webhook

## 最小示例

```yml
plugins:
  @yyhhkya/napcat-status:
    monitor:
      enable: true
      checkOnStartup: true
      checkInterval: 60
      reminderCooldown: 600
    wecom:
      enable: true
      webhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 提醒规则

- 存在异常就会触发告警
- 同一异常在冷却时间内不重复发送
- 异常内容变化会立即重新发送
- 未启用可用通道时不会发送告警
