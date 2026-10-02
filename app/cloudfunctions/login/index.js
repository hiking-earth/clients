// login：微信一键登录，返回 openid（免鉴权，云函数内直接取上下文）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID, nickname: "山友" };
};
