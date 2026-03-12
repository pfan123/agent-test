#!/usr/bin/env node
/**
 * MCP Weather Server
 * 提供天气查询工具，用于判断是否适合钓鱼
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  visibility: number;
  pressure: number;
  fishingSuitability: {
    score: number;
    verdict: string;
    reasons: string[];
  };
}

const cityCoordinates: Record<string, { lat: number; lon: number; country?: string }> = {
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

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

function weatherCodeToCondition(code: number): string {
  const codeMap: Record<number, string> = {
    0: "晴", 1: "晴间多云", 2: "多云", 3: "阴",
    45: "雾", 48: "雾凇",
    51: "小毛毛雨", 53: "中毛毛雨", 55: "大毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨",
    71: "小雪", 73: "中雪", 75: "大雪",
    80: "小阵雨", 81: "中阵雨", 82: "大阵雨",
    95: "雷暴", 96: "雷暴加冰雹", 99: "强雷暴加冰雹",
  };
  return codeMap[code] || "未知";
}

function windDegreeToDirection(degree: number): string {
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const index = Math.round(degree / 45) % 8;
  return directions[index];
}

function assessFishingSuitability(weather: Omit<WeatherData, "fishingSuitability">) {
  const reasons: string[] = [];
  let score = 100;

  if (weather.temperature >= 10 && weather.temperature <= 25) {
    reasons.push("温度适宜，鱼类活跃度高");
  } else if (weather.temperature < 5) {
    score -= 30;
    reasons.push("温度过低，鱼类活动减少");
  } else if (weather.temperature > 32) {
    score -= 25;
    reasons.push("温度过高，鱼类会游向深水区");
  }

  if (weather.windSpeed <= 3) {
    reasons.push("风力微弱，水面平稳，便于观察");
  } else if (weather.windSpeed <= 5) {
    reasons.push("微风徐徐，适合钓鱼");
  } else if (weather.windSpeed <= 7) {
    score -= 15;
    reasons.push("风力较大，抛竿有一定难度");
  } else {
    score -= 40;
    reasons.push("风力过大，不安全且难以控制鱼线");
  }

  const goodConditions = ["晴", "多云", "阴"];
  const badConditions = ["雨", "雷", "雪", "雾"];
  const hasBadCondition = badConditions.some((c) => weather.condition.includes(c));
  const hasGoodCondition = goodConditions.some((c) => weather.condition.includes(c));

  if (hasBadCondition) {
    score -= 35;
    reasons.push("恶劣天气，不建议户外活动");
  } else if (hasGoodCondition) {
    reasons.push("天气状况良好");
  }

  if (weather.humidity > 85) {
    score -= 10;
    reasons.push("湿度过高，体感不适");
  } else if (weather.humidity >= 50 && weather.humidity <= 70) {
    reasons.push("湿度舒适");
  }

  if (weather.visibility < 1) {
    score -= 20;
    reasons.push("能见度低，注意安全");
  }

  if (weather.pressure > 1013) {
    reasons.push("气压较高，鱼类觅食积极");
  } else if (weather.pressure < 1000) {
    score -= 15;
    reasons.push("气压较低，可能影响鱼类活动");
  }

  let verdict: string;
  if (score >= 85) verdict = "非常适合";
  else if (score >= 70) verdict = "适合";
  else if (score >= 50) verdict = "一般";
  else if (score >= 30) verdict = "不适合";
  else verdict = "非常不适合";

  return { score, verdict, reasons };
}

async function geocodeCity(cityName: string) {
  if (cityCoordinates[cityName]) {
    const c = cityCoordinates[cityName];
    return { lat: c.lat, lon: c.lon, displayName: `${cityName}, ${c.country || "中国"}` };
  }
  return null;
}

async function fetchWeather(locationOrCoords: string | { latitude: number; longitude: number }, displayName?: string) {
  let lat: number;
  let lon: number;
  let locName: string;

  if (typeof locationOrCoords === "object" && "latitude" in locationOrCoords) {
    lat = locationOrCoords.latitude;
    lon = locationOrCoords.longitude;
    locName = displayName || `${lat}, ${lon}`;
  } else {
    const geoResult = await geocodeCity(locationOrCoords);
    if (!geoResult) {
      throw new Error(`未找到城市: ${locationOrCoords}`);
    }
    lat = geoResult.lat;
    lon = geoResult.lon;
    locName = geoResult.displayName;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility&timezone=auto`;

  const response = await fetchWithTimeout(url, 15000);
  if (!response.ok) {
    throw new Error(`天气 API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  const current = data.current;

  const baseWeather = {
    location: locName,
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    condition: weatherCodeToCondition(current.weather_code),
    windSpeed: current.wind_speed_10m,
    windDirection: windDegreeToDirection(current.wind_direction_10m),
    visibility: current.visibility / 1000,
    pressure: current.surface_pressure,
  };

  const fishingSuitability = assessFishingSuitability(baseWeather);

  return { ...baseWeather, fishingSuitability };
}

const server = new Server(
  {
    name: "mcp-weather-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather_for_fishing",
        description: "获取指定位置的天气信息，并判断是否适合钓鱼",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "城市或地区名称，例如：深圳、北京、上海、东京、纽约等",
            },
            latitude: {
              type: "number",
              description: "纬度（可选，与 longitude 一起使用）",
            },
            longitude: {
              type: "number",
              description: "经度（可选，与 latitude 一起使用）",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_weather_for_fishing") {
    const { location, latitude, longitude } = args as { location?: string; latitude?: number; longitude?: number };

    let weatherData;

    if (latitude !== undefined && longitude !== undefined) {
      weatherData = await fetchWeather({ latitude, longitude }, location);
    } else if (location) {
      weatherData = await fetchWeather(location);
    } else {
      throw new Error("需要提供 location 或 latitude/longitude 参数");
    }

    const { location: loc, temperature, condition, humidity, windSpeed, windDirection, visibility, pressure, fishingSuitability } = weatherData;

    return {
      content: [
        {
          type: "text",
          text: `📍 ${loc}天气情况

🌡️ 温度: ${temperature}°C
☁️ 天气: ${condition}
💧 湿度: ${humidity}%
💨 风速: ${windSpeed}km/h (${windDirection})
👁️ 能见度: ${visibility.toFixed(1)}km
🔽 气压: ${pressure}hPa

🎣 钓鱼适宜性评估:
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 综合评分: ${fishingSuitability.score}/100
🎯 结论: ${fishingSuitability.verdict}

📋 详细分析:
${fishingSuitability.reasons.map((r) => `  • ${r}`).join("\n")}`,
        },
      ],
    };
  }

  throw new Error(`未知的工具: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Weather Server 已启动");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
