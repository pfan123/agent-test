# MCP Weather Server

天气查询 MCP 服务器，用于判断是否适合钓鱼。

## 功能

- 查询指定城市的实时天气
- 智能评估钓鱼适宜性
- 提供详细的天气数据分析

## 安装

```bash
cd apps/langchain/mcp-weather-server
pnpm install
```

## 使用方式

### 方式一：直接运行

```bash
pnpm start
```

### 方式二：在 Claude Desktop 中配置

编辑 Claude Desktop 配置文件:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

添加以下配置:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/path/to/agent-tutorial/apps/langchain/mcp-weather-server/index.ts"]
    }
  }
}
```

需要使用 `tsx` 来执行 TypeScript:

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/agent-tutorial/apps/langchain/mcp-weather-server/index.ts"
      ]
    }
  }
}
```

### 方式三：在 LangGraph Agent 中使用

参见 `fishing-agent.ts` 示例。

## API

### get_weather_for_fishing

获取指定位置的天气信息，并判断是否适合钓鱼。

**参数:**
- `location` (string): 城市名称，例如：深圳、北京、上海

**返回:**
详细的天气信息和钓鱼适宜性评估

## 示例

```
用户: 今天深圳适合钓鱼吗？

工具调用:
get_weather_for_fishing(location: "深圳")

返回:
📍 深圳天气情况
🌡️ 温度: 22°C
☁️ 天气: 多云
💧 湿度: 65%
💨 风速: 3级 (东南风)
🎣 钓鱼适宜性: 适合 (85/100)
```

## 钓鱼适宜性评估标准

| 因素 | 最佳条件 | 影响 |
|------|----------|------|
| 温度 | 10-25°C | 鱼类活跃度高 |
| 风速 | ≤3级 | 水面平稳 |
| 天气 | 晴/多云 | 安全舒适 |
| 湿度 | 50-70% | 体感舒适 |
| 气压 | >1013hPa | 鱼类觅食积极 |
