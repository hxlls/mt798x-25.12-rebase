# luci-app-singbox 开发笔记

> 记录于 immortalwrt-mt798x-rebase 源码，Sing-Box GUI for OpenWrt。

## 项目概述

为 Sing-Box（通用代理平台）开发 OpenWrt LuCI 管理界面，支持订阅管理、节点编辑、透明代理。

## 目录结构

```
package/mtk/applications/luci-app-singbox/
├── Makefile                          # PKG_VERSION:=1.0.0, +sing-box +curl +jsonfilter +ucode
├── htdocs/luci-static/resources/view/singbox/
│   ├── overview.js                   # 概览：服务状态、快速设置、日志
│   ├── subscribe.js                  # 订阅：URL管理、一键导入、自动解析
│   ├── nodes.js                      # 节点：协议编辑、延迟测试
│   └── settings.js                   # 设置：入站/TUN/Clash API/配置预览
├── po/
│   ├── zh_Hans/singbox.po            # 中文翻译 (75条)
│   └── templates/singbox.pot
└── root/
    ├── etc/config/singbox            # UCI 配置文件
    ├── etc/init.d/singbox            # procd 服务管理
    ├── etc/uci-defaults/luci-singbox # 首次安装默认配置
    ├── usr/sbin/singbox-helper       # 配置生成脚本（shell）
    └── usr/share/
        ├── luci/menu.d/luci-app-singbox.json    # 4个菜单项
        ├── rpcd/acl.d/luci-app-singbox.json     # ACL 权限
        └── rpcd/ucode/luci.singbox              # rpcd 后端 (ucode)
```

## UCI 配置结构 (`/etc/config/singbox`)

### global 段
| 选项 | 默认值 | 说明 |
|------|--------|------|
| enabled | 0 | 服务开关 |
| log_level | info | 日志级别 (trace/debug/info/warn/error) |
| log_output | /tmp/singbox.log | 日志文件路径 |
| mixed_port | 2080 | HTTP/SOCKS5 混合代理端口 |
| socks_port | 1080 | SOCKS5 独立端口 |
| http_port | 1081 | HTTP 独立端口 |
| tun_enabled | 0 | TUN 透明代理开关 |
| tun_address | 172.19.0.1/30 | TUN 设备地址 |
| tun_auto_route | 1 | 自动路由 |
| tun_stack | system | TUN 协议栈 (system/gvisor/mixed) |
| clash_api_enabled | 0 | Clash API 开关 |
| clash_api_port | 9090 | Clash API 端口 |
| clash_api_secret | | API 密钥 |

### subscribe 段
| 选项 | 说明 |
|------|------|
| url | 订阅 URL |
| name | 订阅名称 |
| enabled | 启用开关 |
| auto_update | 自动更新 |
| update_interval | 更新间隔 (6/12/24/48/72 小时) |
| ua | User-Agent |
| last_update | 最后更新时间 |

### node 段
| 选项 | 说明 |
|------|------|
| type | 协议 (shadowsocks/vmess/vless/trojan/hysteria2) |
| server | 服务器地址 |
| server_port | 端口 |
| name | 节点名称 |
| subscribe | 所属订阅 |
| enabled | 启用开关 |
| method/password | SS 加密/密码 |
| uuid/alter_id/security | VMess 参数 |
| flow | VLESS flow |
| transport/path/host | 传输层设置 |
| tls/sni/fingerprint | TLS 设置 |
| obfs_type/obfs_password | Hysteria2 混淆 |

## 技术架构

### 前端 (LuCI JS)
- 使用 `form.Map` / `form.GridSection` / `form.NamedSection`
- rpc 调用后端 `luci.singbox` 方法
- uci 读写 `/etc/config/singbox`
- 4 个独立页面：overview / subscribe / nodes / settings

### 后端 (ucode rpcd)
- `luci.singbox` 模块提供 RPC 接口
- 主要方法：
  - `getStatus()` - 服务状态 (running/pid/version/uptime)
  - `getGlobal()` - 全局配置
  - `getSubscribes()` / `getNodes()` - 列表
  - `fetchSubscribe(url, ua)` - 下载订阅
  - `parseNodes(content)` - 解析节点 (SS/VMess/VLESS/Trojan/Hysteria2)
  - `generateConfig()` - 生成 SingBox JSON 配置
  - `startService()` / `stopService()` / `restartService()`
  - `testNodeDelay(server, port)` - 连接测试
  - `getLog(lines)` - 读取日志

### 订阅解析
- 支持格式：Base64 编码、Clash YAML、V2Ray 订阅
- 支持协议：`ss://` / `vmess://` / `vless://` / `trojan://` / `hy2://`
- URL 解码使用 python3 urllib
- Base64 解码使用系统 `base64 -d`

### 配置生成
- `singbox-helper generate` 脚本读取 UCI 生成 JSON
- 输出结构：log / dns / inbounds / outbounds / route
- DNS 默认：Google TLS + 本地 223.5.5.5
- 入站默认：mixed (HTTP+SOCKS5) 端口 2080

## 菜单结构

```
admin/services/singbox          → overview.js
  ├── Overview (概览)            → overview.js
  ├── Subscriptions (订阅管理)   → subscribe.js
  ├── Nodes (节点列表)           → nodes.js
  └── Settings (设置)            → settings.js
```

## 待完善

- [ ] DNS 规则/分流规则编辑页面
- [ ] 订阅自动更新 (cron 定时任务)
- [ ] 完善配置生成（transport/tls/fingerprint 参数）
- [ ] GeoIP/Geosite 规则集支持
- [ ] 流量统计集成
- [ ] 多出站选择器 (selector/urltest)
- [ ] 节点拖拽排序
- [ ] 订阅导入 Clash YAML 格式支持

## 依赖

- `sing-box` - 核心代理程序
- `curl` - 订阅下载
- `jsonfilter` - JSON 解析
- `ucode` - rpcd 后端语言
- `uhttpd` - Web 服务器

## 参考项目

- passwall: `feeds/passwall/luci-app-passwall/luasrc/passwall/util_sing-box.lua` (2412行)
- passwall2: `feeds/passwall2_luci/luci-app-passwall2/luasrc/passwall2/util_sing-box.lua`
- SingBox 文档: https://sing-box.sagernet.org/
- SingBox 源码: https://github.com/SagerNet/sing-box
