// 保存用户主动提交的求助位置；尚未接通联系人通知或救援调度。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: "请先在微信小程序登录" };
  const { latitude, longitude, message = "" } = event;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return { errMsg: "求助坐标无效" };
  const doc = {
    openid: OPENID,
    latitude, longitude,
    message: String(message).slice(0, 200),
    triggeredAt: Date.now(),
    status: "active",
  };
  const res = await db.collection("sos_events").add({ data: doc });
  return { sosId: res._id };
};
