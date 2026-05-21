const bcrypt = require('bcryptjs');
const db = require('../db');

const DEMO_PASSWORD = '123456';
const DEMO_WECHAT_PREFIX = 'demo_';

function json(value) {
  return JSON.stringify(value);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function deleteDemoData() {
  const demoUsers = db.prepare("SELECT id FROM users WHERE wechat LIKE ?").all(`${DEMO_WECHAT_PREFIX}%`);
  const userIds = demoUsers.map((item) => item.id);
  if (!userIds.length) return;

  const userPlaceholders = placeholders(userIds);
  const sessionIds = db.prepare(
    `SELECT id FROM game_sessions WHERE creator_user_id IN (${userPlaceholders})`
  ).all(...userIds).map((item) => item.id);

  if (sessionIds.length) {
    db.prepare(`DELETE FROM session_requests WHERE session_id IN (${placeholders(sessionIds)})`).run(...sessionIds);
  }
  db.prepare(`DELETE FROM session_requests WHERE user_id IN (${userPlaceholders})`).run(...userIds);
  db.prepare(`DELETE FROM likes WHERE from_user_id IN (${userPlaceholders}) OR to_user_id IN (${userPlaceholders})`)
    .run(...userIds, ...userIds);
  db.prepare(`DELETE FROM game_sessions WHERE creator_user_id IN (${userPlaceholders})`).run(...userIds);
  db.prepare(`DELETE FROM profiles WHERE user_id IN (${userPlaceholders})`).run(...userIds);
  db.prepare(`DELETE FROM users WHERE id IN (${userPlaceholders})`).run(...userIds);
}

function createUser(input, passwordHash) {
  const result = db.prepare(`
    INSERT INTO users (nickname, wechat, password_hash, gender)
    VALUES (?, ?, ?, ?)
  `).run(input.nickname, input.wechat, passwordHash, input.gender || 0);

  const userId = result.lastInsertRowid;
  db.prepare(`
    INSERT INTO profiles (
      user_id, game_types, play_styles, preferred_roles, availability,
      budget_range, player_count_range, play_modes, play_freq, intro, city, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    json(input.profile.gameTypes),
    json(input.profile.playStyles),
    json(input.profile.preferredRoles || ['无所谓']),
    json(input.profile.availability),
    input.profile.budgetRange,
    input.profile.playerCountRange,
    json(input.profile.playModes),
    input.profile.playFreq,
    input.profile.intro,
    input.profile.city
  );

  return userId;
}

function createSession(input) {
  const result = db.prepare(`
    INSERT INTO game_sessions (
      creator_user_id, game_type, title, city, area, address, location_lng, location_lat,
      play_date, play_time, play_mode, budget_range,
      min_players, max_players, current_players, tags, note, contact_note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.creatorUserId,
    input.gameType,
    input.title,
    input.city,
    input.area || '',
    input.address || '',
    input.locationLng || null,
    input.locationLat || null,
    input.playDate,
    input.playTime,
    input.playMode,
    input.budgetRange || '',
    input.minPlayers,
    input.maxPlayers,
    input.currentPlayers,
    json(input.tags || []),
    input.note || '',
    input.contactNote || '',
    input.status || 'open'
  );
  return result.lastInsertRowid;
}

function createRequest(input) {
  db.prepare(`
    INSERT INTO session_requests (session_id, user_id, message, status, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(input.sessionId, input.userId, input.message || '', input.status || 'pending');
}

const seed = db.transaction(() => {
  deleteDemoData();

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const users = {
    creator: createUser({
      nickname: '阿杰局主',
      wechat: 'demo_creator',
      gender: 1,
      profile: {
        gameTypes: ['桌游', '狼人杀', '血染钟楼'],
        playStyles: ['社交型', '阵营型', '合作型'],
        availability: ['周五晚', '周末晚上'],
        budgetRange: '100-200',
        playerCountRange: '5-8人',
        playModes: ['线下'],
        playFreq: '每周 1-2 次',
        intro: '喜欢组新手友好的桌游和阵营局。',
        city: '上海',
      },
    }, passwordHash),
    joiner: createUser({
      nickname: '小白同学',
      wechat: 'demo_joiner',
      gender: 0,
      profile: {
        gameTypes: ['桌游', '剧本杀'],
        playStyles: ['欢乐型', '合作型'],
        availability: ['周末白天', '周五晚'],
        budgetRange: '100-200',
        playerCountRange: '5-8人',
        playModes: ['线下'],
        playFreq: '每月 2-3 次',
        intro: '新手但不鸽，喜欢轻策和欢乐局。',
        city: '上海',
      },
    }, passwordHash),
    social: createUser({
      nickname: '鹿鹿',
      wechat: 'demo_social',
      gender: 2,
      profile: {
        gameTypes: ['狼人杀', '血染钟楼'],
        playStyles: ['社交型', '阵营型'],
        availability: ['周五晚', '周末晚上'],
        budgetRange: '50-100',
        playerCountRange: '9人以上',
        playModes: ['线下', '线上'],
        playFreq: '每周 1 次',
        intro: '喜欢阵营发言和复盘。',
        city: '上海',
      },
    }, passwordHash),
    keeper: createUser({
      nickname: '老周 Keeper',
      wechat: 'demo_keeper',
      gender: 1,
      profile: {
        gameTypes: ['跑团', '剧本杀'],
        playStyles: ['沉浸型', '推理型'],
        availability: ['周末白天', '节假日'],
        budgetRange: '50以下',
        playerCountRange: '2-4人',
        playModes: ['线上'],
        playFreq: '每周 1 次',
        intro: '长期带轻量跑团，偏剧情和探索。',
        city: '线上',
      },
    }, passwordHash),
  };

  const sessions = {
    boardGame: createSession({
      creatorUserId: users.creator,
      gameType: '桌游',
      title: '周五晚新手友好轻策桌游',
      city: '上海',
      area: '黄浦',
      address: '人民大道人民广场附近',
      locationLng: 121.47039,
      locationLat: 31.23071,
      playDate: addDays(8),
      playTime: '19:30',
      playMode: '线下',
      budgetRange: '100-200',
      minPlayers: 3,
      maxPlayers: 5,
      currentPlayers: 2,
      tags: ['新手友好', '轻策', '不鸽'],
      note: '计划开一到两款轻中策桌游，能接受新手，会先讲规则。',
      contactNote: '通过后拉微信群确认集合点。',
    }),
    botc: createSession({
      creatorUserId: users.social,
      gameType: '血染钟楼',
      title: '周末血染钟楼新手教学局',
      city: '上海',
      area: '徐汇',
      address: '徐家汇附近',
      locationLng: 121.43752,
      locationLat: 31.18831,
      playDate: addDays(10),
      playTime: '14:00',
      playMode: '线下',
      budgetRange: '50-100',
      minPlayers: 7,
      maxPlayers: 12,
      currentPlayers: 5,
      tags: ['新手教学', '阵营', '复盘'],
      note: '说书人会带规则，新手可来，要求准时。',
      contactNote: '通过后发微信群二维码。',
    }),
    rpg: createSession({
      creatorUserId: users.keeper,
      gameType: '跑团',
      title: '线上短团：迷雾小镇',
      city: '线上',
      area: '',
      address: '腾讯会议',
      playDate: addDays(6),
      playTime: '20:00',
      playMode: '线上',
      budgetRange: '50以下',
      minPlayers: 3,
      maxPlayers: 4,
      currentPlayers: 2,
      tags: ['短团', '剧情', '新手可'],
      note: '预计 2-3 小时，偏剧情探索，不需要复杂规则基础。',
      contactNote: '通过后发会议号和角色卡模板。',
    }),
  };

  createRequest({
    sessionId: sessions.boardGame,
    userId: users.joiner,
    status: 'pending',
    message: '我能准时到，想玩轻策。',
  });
  createRequest({
    sessionId: sessions.botc,
    userId: users.creator,
    status: 'approved',
    message: '有血染经验，可以帮忙带新手。',
  });

  db.prepare('INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)').run(users.joiner, users.creator);
  db.prepare('INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)').run(users.creator, users.joiner);

  return {
    users: Object.keys(users).length,
    sessions: Object.keys(sessions).length,
    login: {
      password: DEMO_PASSWORD,
      accounts: ['demo_creator', 'demo_joiner', 'demo_social', 'demo_keeper'],
    },
  };
});

const result = seed();
console.log(JSON.stringify(result, null, 2));
