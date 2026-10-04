/**
 * 云开发服务封装。
 * - 微信小程序内走 wx.cloud（免鉴权登录）
 * - H5 / App 通过配置的 HTTPS 网关使用统一账号；未配置时明确返回失败。
 * 云环境 id 在 shared/constants CLOUD_ENV。
 */
import { hasPrivacyConsent } from "@/services/privacy";
import { CLOUD_ENV } from "@shared/constants";
import { accountApiConfigured, accountRequest, accountSession } from '@/services/account';

declare const wx: any;

export type CloudResult<T> = { ok: boolean; data?: T; errMsg?: string };

let inited = false;

export function cloudAvailable(): boolean {
  // #ifdef MP-WEIXIN
  try {
    return typeof wx !== "undefined" && !!wx.cloud || accountApiConfigured();
  } catch {
    return false;
  }
  // #endif
  // #ifndef MP-WEIXIN
  return accountApiConfigured();
  // #endif
}

export function initCloud(): void {
  if (inited || !cloudAvailable()) return;
  // #ifdef MP-WEIXIN
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: false });
    inited = true;
  } catch (e) {
    console.warn("[cloud] init 失败", e);
  }
  // #endif
}

/** 调云函数；不可用或服务端返回错误时明确失败 */
export async function callCloud<T = any>(name: string, data: Record<string, any> = {}): Promise<CloudResult<T>> {
  const consent = { "track-sync": "trackCloudSync", "gear-scan": "gearImageUpload", "team-report": "teamLocation", "sos-trigger": "location" } as const;
  const key = consent[name as keyof typeof consent];
  if (key && !(name === "sos-trigger" && data.action === "resolve") && (!hasPrivacyConsent(key) || (name === "team-report" && !hasPrivacyConsent("location")))) {
    return { ok: false, errMsg: "相关数据授权已关闭，请在隐私设置中启用。" };
  }
  // A unified account takes precedence even inside the mini-program. Otherwise
  // keep its original trusted WeChat context; identities are never client input.
  if (accountSession()) return accountRequest<T>(name, data);
  // #ifndef MP-WEIXIN
  return accountRequest<T>(name, data);
  // #endif
  initCloud();
  if (cloudAvailable() && inited) {
    // #ifdef MP-WEIXIN
    try {
      const res = await wx.cloud.callFunction({ name, data });
      if (res.result?.errMsg || res.result?.error || res.result?.ok === false) {
        return { ok: false, errMsg: String(res.result.errMsg || res.result.error || "服务未完成本次操作") };
      }
      return { ok: true, data: res.result as T };
    } catch (e: any) {
      return { ok: false, errMsg: e?.errMsg ?? String(e) };
    }
    // #endif
  }
  return { ok: false, errMsg: "当前平台尚未接通云服务，请使用微信小程序；本次操作未提交。" };
}
