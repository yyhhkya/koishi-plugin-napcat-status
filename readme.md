# @yyhhkya/koishi-plugin-napcat-status

[![npm](https://img.shields.io/npm/v/@yyhhkya/koishi-plugin-napcat-status?style=flat-square)](https://www.npmjs.com/package/@yyhhkya/koishi-plugin-napcat-status)

用于监控 `adapter-onebot` 下所有已登录账号的状态，并在账号 `online !== true` 或状态查询失败时发送邮件提醒。

## 功能特性

- 自动遍历当前 Koishi 中所有 `platform === 'onebot'` 的账号
- 定时调用 OneBot `get_status` 接口检查账号状态
- 当账号 `online` 不为 `true` 时发送告警邮件
- 当状态接口调用失败时也会发送告警邮件
- 支持启动后立即检查
- 支持相同异常的冷却时间，避免短时间重复发信

## 依赖要求

- Koishi `^4.18.7`
- 已正确接入 `koishi-plugin-adapter-onebot`
- 可用的 SMTP 邮件服务

## 工作方式

插件会在 Koishi 启动完成后开始巡检：

1. 获取当前所有 OneBot 连接
2. 调用每个账号的 `get_status`
3. 判断返回结果中的 `online`
4. 若存在异常账号，则按配置发送告警邮件

以下情况会被视为异常：

- `online !== true`
- 适配器连接未暴露 `getStatus` 接口
- 调用状态接口时报错

当全部账号恢复正常后，插件会清空当前异常状态记录；下次再出现异常时会重新发送告警。

## 配置说明

### monitor

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enable` | `boolean` | `false` | 是否启用定时巡检 |
| `checkOnStartup` | `boolean` | `true` | 启动后是否立即执行一次检查 |
| `checkInterval` | `number` | `60` | 巡检间隔，单位为秒 |
| `reminderCooldown` | `number` | `600` | 相同异常的邮件提醒冷却时间，单位为秒 |

### mail

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enable` | `boolean` | `false` | 是否启用邮件告警 |
| `host` | `string` | `''` | SMTP 服务器地址 |
| `port` | `number` | `465` | SMTP 服务器端口 |
| `secure` | `boolean` | `true` | 是否启用 SSL/TLS |
| `user` | `string` | `''` | SMTP 用户名 |
| `pass` | `string` | `''` | SMTP 密码或授权码 |
| `from` | `string` | `''` | 发件人邮箱 |
| `to` | `string[]` | `[]` | 收件人邮箱列表 |
| `subject` | `string` | `'[NapCat 状态告警]'` | 邮件主题 |

## 配置示例

```yml
plugins:
  @yyhhkya/napcat-status:
    monitor:
      enable: true
      checkOnStartup: true
      checkInterval: 60
      reminderCooldown: 600
    mail:
      enable: true
      host: smtp.qq.com
      port: 465
      secure: true
      user: your-account@qq.com
      pass: your-smtp-auth-code
      from: your-account@qq.com
      to:
        - admin1@example.com
        - admin2@example.com
      subject: "[NapCat 状态告警]"
```

## 告警规则

- 只要存在任意异常账号，就会生成一封告警邮件
- 同一批异常内容在冷却时间内不会重复发送
- 若异常账号集合或异常信息发生变化，会重新发送
- 若没有填写完整邮件配置，即使检测到异常也不会发送邮件

## 邮件内容

邮件中会包含以下信息：

- 检查时间
- 异常账号数量
- 每个异常账号的 `selfId`
- Koishi 侧状态
- OneBot 在线状态
- OneBot 健康状态
- 接口错误信息或状态统计信息

## 注意事项

- `mail.enable` 和 `monitor.enable` 都需要开启，邮件提醒才会实际生效
- 某些邮箱服务商需要使用 SMTP 授权码，而不是登录密码
- 如果 `user` 为空，则不会附带 SMTP 认证信息

## 适用场景

- NapCat / OneBot 多账号托管
- 需要对掉线账号做基础值守
- 需要在接口异常时第一时间收到邮件提醒

