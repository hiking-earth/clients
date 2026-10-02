// sos-trigger：一键求救。记录事件；若用户在队伍中，标记队伍告警（队友轮询可见）。
// 紧急联系人短信/电话通知需要企业资质与运营商通道，个人主体阶段先做到队内告警。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { latitude, longitude, message = "" } = event;
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
