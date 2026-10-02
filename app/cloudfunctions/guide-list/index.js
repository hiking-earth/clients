// guide-list：装备导购条目（运营在云控制台 guide_items 集合维护；空库时返回内置种子）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const SEED = [
  { id: "g1", title: "中高帮防水徒步鞋", category: "鞋靴", summary: "未铺装路面优先防水防滑款，出行前磨合。", image: "", link: "", priceHint: "¥400-1200" },
  { id: "g2", title: "20-30L 一日徒步背包", category: "背包", summary: "一日线 20L 起步，带水袋仓与腰封。", image: "", link: "", priceHint: "¥200-800" },
  { id: "g3", title: "头灯 + 备用电池", category: "应急", summary: "夜路应急必备，勿只依赖手机手电。", image: "", link: "", priceHint: "¥50-300" },
  { id: "g4", title: "双层铝杆帐篷（1-2 人）", category: "露营", summary: "过夜线基础款，注意抗风等级与重量平衡。", image: "", link: "", priceHint: "¥300-1500" },
  { id: "g5", title: "保温水壶 750ml+", category: "其他", summary: "高海拔与秋冬线保温更重要。", image: "", link: "", priceHint: "¥60-200" },
];

exports.main = async () => {
  try {
    const res = await db.collection("guide_items").limit(100).get();
    if (res.data.length > 0) return { items: res.data.map((i) => ({ ...i, id: i._id })) };
  } catch (e) {
    // 集合不存在时降级种子
  }
  return { items: SEED };
};
