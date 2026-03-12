#!/usr/bin/env node
/**
 * MCP Geocoding Server
 * 地名转坐标服务
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const cityCoordinates: Record<
  string,
  { lat: number; lon: number; country?: string }
> = {
  深圳: { lat: 22.5431, lon: 114.0579, country: "中国" },
  北京: { lat: 39.9042, lon: 116.4074, country: "中国" },
  上海: { lat: 31.2304, lon: 121.4737, country: "中国" },
  广州: { lat: 23.1291, lon: 113.2644, country: "中国" },
  杭州: { lat: 30.2741, lon: 120.1551, country: "中国" },
  南京: { lat: 32.0603, lon: 118.7969, country: "中国" },
  成都: { lat: 30.5728, lon: 104.0668, country: "中国" },
  武汉: { lat: 30.5928, lon: 114.3055, country: "中国" },
  西安: { lat: 34.3416, lon: 108.9398, country: "中国" },
  重庆: { lat: 29.4316, lon: 106.9123, country: "中国" },
  天津: { lat: 39.3434, lon: 117.3616, country: "中国" },
  苏州: { lat: 31.299, lon: 120.5853, country: "中国" },
  郑州: { lat: 34.7466, lon: 113.6254, country: "中国" },
  长沙: { lat: 28.2282, lon: 112.9388, country: "中国" },
  青岛: { lat: 36.0671, lon: 120.3826, country: "中国" },
  沈阳: { lat: 41.8057, lon: 123.4315, country: "中国" },
  大连: { lat: 38.914, lon: 121.6147, country: "中国" },
  厦门: { lat: 24.4798, lon: 118.0894, country: "中国" },
  昆明: { lat: 25.0406, lon: 102.7129, country: "中国" },
  哈尔滨: { lat: 45.8038, lon: 126.534, country: "中国" },
  东京: { lat: 35.6895, lon: 139.69171, country: "日本" },
  纽约: { lat: 40.7128, lon: -74.006, country: "美国" },
  伦敦: { lat: 51.5074, lon: -0.1278, country: "英国" },
  巴黎: { lat: 48.8566, lon: 2.3522, country: "法国" },
  悉尼: { lat: -33.8688, lon: 151.2093, country: "澳大利亚" },
  首尔: { lat: 37.5665, lon: 126.978, country: "韩国" },
  新加坡: { lat: 1.3521, lon: 103.8198, country: "新加坡" },
  香港: { lat: 22.3193, lon: 114.1694, country: "中国香港" },
  台北: { lat: 25.033, lon: 121.5654, country: "中国台湾" },
};

async function geocodeCity(
  cityName: string,
): Promise<{ lat: number; lon: number; displayName: string } | null> {
  if (cityCoordinates[cityName]) {
    const c = cityCoordinates[cityName];
    return {
      lat: c.lat,
      lon: c.lon,
      displayName: `${cityName}, ${c.country || "中国"}`,
    };
  }
  return null;
}

const server = new McpServer(
  {
    name: "mcp-geocoding-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.registerTool(
  "geocode",
  {
    description: "将地名转换为经纬度坐标",
    inputSchema: {
      location: z
        .string()
        .describe("城市或地区名称，例如：深圳、北京、东京、纽约等"),
    },
    outputSchema: {
      latitude: z.number().describe("纬度"),
      longitude: z.number().describe("经度"),
      displayName: z.string().describe("地名的显示名称，例如：深圳, 中国"),
    },
  },
  async ({ location }) => {
    if (!location) {
      throw new Error("缺少必需参数: location");
    }

    const geoResult = await geocodeCity(location);

    if (!geoResult) {
      throw new Error(`未找到城市: ${location}`);
    }

    const locationInfo = {
      latitude: geoResult.lat,
      longitude: geoResult.lon,
      displayName: geoResult.displayName,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(locationInfo),
        },
      ],
      structuredContent: locationInfo,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Geocoding Server 已启动");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
