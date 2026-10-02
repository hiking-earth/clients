/**
 * 云开发服务封装。
 * - 微信小程序内走 wx.cloud（免鉴权登录）
 * - H5 / App 端或云环境未配置时，自动降级为本地 mock（保证功能可演示）
 * 云环境 id 在 shared/constants CLOUD_ENV，占位待开通后替换。
 */
import { CLOUD_ENV } from "@shared/constants";

declare const wx: any;

export type CloudResult<T> = { ok: boolean; data?: T; errMsg?: string };

let inited = false;

export function cloudAvailable(): boolean {
  // #ifdef MP-WEIXIN
  try {
    return typeof wx !== "undefined" && !!wx.cloud;
  } catch {
    return false;
  }
  // #endif
  // #ifndef MP-WEIXIN
  return false;
  // #endif
}

export function initCloud(): void {
  if (inited || !cloudAvailable()) return;
  // #ifdef MP-WEIXIN
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
    inited = true;
  } catch (e) {
    console.warn("[cloud] init 失败，使用本地降级", e);
  }
  // #endif
}

/** 调云函数；不可用时走 mockHandlers 里的本地实现 */
export async function callCloud<T = any>(name: string, data: Record<string, any> = {}): Promise<CloudResult<T>> {
  initCloud();
  if (cloudAvailable() && inited) {
    // #ifdef MP-WEIXIN
    try {
      const res = await wx.cloud.callFunction({ name, data });
      return { ok: true, data: res.result as T };
    } catch (e: any) {
      return { ok: false, errMsg: e?.errMsg ?? String(e) };
    }
    // #endif
  }
  const mock = mockHandlers[name];
  if (mock) {
    const data2 = await mock(data);
    return { ok: true, data: data2 as T };
  }
  return { ok: false, errMsg: `云环境未配置且无本地降级：${name}` };
}

/* ---------------- 本地降级（mock） ---------------- */

const mockHandlers: Record<string, (data: any) => Promise<any>> = {
  login: async () => ({ openid: "local-mock-user", nickname: "本地用户" }),
  "companion-list": async () => ({ posts: mockPosts() }),
  "companion-create": async (d) => ({ id: `local-${Date.now()}`, ...d }),
  "companion-join": async () => ({ joined: true }),
  "team-create": async () => ({ teamId: `team-${Date.now()}`, inviteCode: String(Math.floor(100000 + Math.random() * 900000)) }),
  "team-join": async () => ({ joined: true }),
  "team-locations": async () => ({ members: [] }),
  "sos-trigger": async () => ({ sosId: `sos-${Date.now()}` }),
  "track-sync": async () => ({ synced: true }),
  "guide-list": async () => ({ items: mockGuideItems() }),
};

function mockPosts() {
  return [
    {
      id: "demo-1",
      openid: "demo",
      nickname: "山友·示例",
      routeId: "wugongshan",
      title: "武功山两日轻装约伴（示例）",
      content: "计划周末石鼓寺上金顶，草甸露营一晚，求 2-3 人同行。本帖为本地演示数据。",
      departDate: "2026-10-17",
      maxMembers: 4,
      members: ["demo"],
      createdAt: Date.now(),
      status: "open",
    },
  ];
}

function mockGuideItems() {
  return [
    { id: "g1", title: "中高帮防水徒步鞋（示例）", category: "鞋靴", summary: "未铺装路面优先防水防滑款，出行前磨合。导购链接待配置。", image: "", link: "", priceHint: "¥400-1200" },
    { id: "g2", title: "20-30L 一日徒步背包（示例）", category: "背包", summary: "一日线 20L 起步，带水袋仓与腰封。导购链接待配置。", image: "", link: "", priceHint: "¥200-800" },
    { id: "g3", title: "头灯 + 备用电池（示例）", category: "应急", summary: "夜路应急必备，勿只依赖手机手电。导购链接待配置。", image: "", link: "", priceHint: "¥50-300" },
  ];
}
