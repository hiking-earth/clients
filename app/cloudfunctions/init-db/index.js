// init-db：一次性初始化数据库集合（6 个）。部署后手动调用一次即可，调用完成后可删除本函数。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  "companion_posts",  // 约伴帖（机审后发布）
  "teams",            // 组队
  "team_members",     // 队员实时位置（敏感个人信息，覆盖更新不留历史）
  "sos_events",       // 一键求救
  "tracks",           // 云同步轨迹（仅本人可读）
  "guide_items",      // 装备导购条目
];

exports.main = async () => {
  const results = [];
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results.push(`${name}: 已创建`);
    } catch (e) {
      results.push(`${name}: ${e.message}`);
    }
  }
  return { results };
};
