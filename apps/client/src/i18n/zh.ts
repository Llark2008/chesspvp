export const zh = {
  // 登录页
  login_title: '战棋 PVP',
  login_guest_btn: '游客开始',
  login_logging_in: '登录中…',
  login_guest_tab: '游客',
  login_email_tab: '邮箱登录',
  login_register_tab: '注册账号',
  login_guest_hint: '游客可直接参与排位，后续可升级为正式账号保留战绩。',
  login_username: '昵称',
  login_email: '邮箱',
  login_password: '密码',
  login_submit: '登录',
  login_register_submit: '注册并进入大厅',
  login_guest_submit: '进入大厅',
  login_form_error: '操作失败，请稍后重试',

  // 大厅
  lobby_welcome: '欢迎',
  lobby_start_match: '开始排位',
  lobby_recent_replays: '最近战报（敬请期待）',
  lobby_ranked_queue: '进入排位匹配',
  lobby_rankings: '查看排行榜',
  lobby_logout: '退出登录',
  lobby_upgrade: '升级为正式账号',
  lobby_upgrade_submit: '完成升级',
  lobby_guest_badge: '游客账号',
  lobby_formal_badge: '正式账号',
  lobby_rating: '当前 ELO',
  lobby_record: '战绩',
  lobby_rank: '当前排名',
  lobby_rank_guest_title: '游客不上榜',
  lobby_rank_projected_prefix: '预计升级后',
  lobby_rank_unranked: '未上榜',
  lobby_rank_projected_empty: '暂无预计名次',
  lobby_email: '绑定邮箱',
  lobby_refreshing: '正在刷新玩家数据…',

  // 匹配
  matchmaking_finding: '正在寻找接近实力的排位对手…',
  matchmaking_cancel: '取消匹配',
  matchmaking_opponent_found: '对手已找到',
  matchmaking_wait: '已等待',
  matchmaking_title: '排位匹配中',
  matchmaking_subtitle: '系统会优先寻找 ELO 接近的玩家，并随等待时间逐步放宽范围。',
  matchmaking_entering: '秒后自动进入战斗…',
  matchmaking_side_first: '先手',
  matchmaking_side_second: '后手',

  // 战斗
  battle_end_turn: '结束回合',
  battle_surrender: '投降',
  battle_your_turn: '我方回合',
  battle_opponent_turn: '对方回合',
  battle_recruit: '招募',
  battle_outpost_recruit: '前哨站招募',
  battle_recruit_title: '招募单位',
  battle_action_title: '单位动作',
  battle_attack: '攻击',
  battle_artillery: '炮击',
  battle_gold: '金币',
  battle_turn: '回合',
  battle_reconnecting: '正在重连…',
  battle_zoom_title: '缩放',

  // 胜负
  result_win: '胜利！',
  result_lose: '落败',
  result_base_destroyed: '基地被摧毁',
  result_surrender: '投降',
  result_timeout: '时间超限',
  result_back_lobby: '返回大厅',
  result_duration: '对局时长',

  // 排行榜
  rankings_title: '排行榜',
  rankings_subtitle: '当前赛季全局 ELO 排名（仅正式账号参与）',
  rankings_back: '返回大厅',
  rankings_empty: '暂无排行数据',
  rankings_column_rank: '排名',
  rankings_column_player: '玩家',
  rankings_column_rating: 'ELO',
  rankings_column_record: '战绩',

  // 错误
  err_not_your_turn: '还没到你的回合',
  err_unit_already_moved: '单位已移动',
  err_unit_already_acted: '单位已行动',
  err_insufficient_gold: '金币不足',
  err_population_cap: '人口已满（上限 8）',
  err_recruit_already_ordered: '本回合已下招募单',
  err_invalid_target: '无效目标',
  err_network: '网络错误，请稍后重试',
  err_server: '服务器错误',
  err_unauthorized: '登录已失效，请重新进入',

  // 兵种
  unit_warrior: '战士',
  unit_archer: '弓手',
  unit_mage: '法师',
  unit_knight: '骑士',
  unit_priest: '牧师',
  unit_gunner: '炮手',
} as const;

export type I18nKey = keyof typeof zh;
export function t(key: I18nKey): string {
  return zh[key];
}
