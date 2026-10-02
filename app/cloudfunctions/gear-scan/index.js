// gear-scan：拍照识别装备 → 视觉大模型识别 → 返回装备清单 + 补充建议 + 使用要点 + 打包清单
//
// 配置（云函数环境变量，缺一不可，未配置时返回明确错误）：
//   LLM_BASE_URL  如 https://api.deepseek.com 或 https://dashscope.aliyuncs.com/compatible-mode
//   LLM_API_KEY   对应平台 key（个人从开放平台申请，严禁写进代码库）
//   LLM_MODEL     需支持视觉，如 qwen-vl-plus / glm-4v 等
//
// 请求：{ image: base64, routeId?, routeName? }
// 响应：{ items:[{name,category}], missing:[{name,reason}], usage:[...], plan:[{name}] }
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BASE = process.env.LLM_BASE_URL || "";
const KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "qwen-vl-plus";

const SYS_PROMPT = `你是户外徒步装备专家。用户会给你一张装备照片（可能还有目标徒步路线）。
任务：
1. 识别照片中所有可见装备（名称 + 类别：鞋靴/背包/服装/露营/导航/饮食/应急/其他）。
2. 结合目标路线（若有：考虑其里程/爬升/过夜/路面/季节）给出还缺什么，按优先级排序并说明原因。
3. 给出已有关键装备的使用要点（3-6 条）。
4. 输出一份完整出行打包清单（名称列表，含照片里已有的和补充的）。
严格只输出 JSON，不要任何额外文字，格式：
{"items":[{"name":"...","category":"..."}],"missing":[{"name":"...","reason":"..."}],"usage":["..."],"plan":[{"name":"..."}]}`;

exports.main = async (event) => {
  const { image, routeName = "" } = event;
  if (!image || typeof image !== "string") return { errMsg: "缺少图片" };
  if (!BASE || !KEY) {
    return { errMsg: "视觉模型未配置（云函数环境变量 LLM_BASE_URL / LLM_API_KEY 缺失）" };
  }
  // base64 体积保护（约 10MB）
  if (image.length > 14 * 1024 * 1024) return { errMsg: "图片过大，请压缩后重试" };

  const userText = routeName
    ? `目标路线：${routeName}。请识别照片中的装备并给出该路线的装备规划。`
    : "请识别照片中的装备并给出一般一日徒步的装备规划。";

  try {
    const resp = await fetch(`${BASE.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYS_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });
    if (!resp.ok) return { errMsg: `模型服务错误 ${resp.status}` };
    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content ?? "";
    // 提取 JSON（模型可能包裹 ```json）
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { errMsg: "识别结果解析失败，请重试" };
    const parsed = JSON.parse(match[0]);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      usage: Array.isArray(parsed.usage) ? parsed.usage : [],
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
    };
  } catch (e) {
    return { errMsg: "识别服务异常：" + (e && e.message ? e.message : String(e)) };
  }
};
