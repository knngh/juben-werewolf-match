const AI_FEATURE_KEYS = ['sessionDraft', 'requestMessage', 'matchExplanation', 'reportClassification', 'opsSummary'];
const AI_PROVIDER_FEATURES = {
  mock: {
    sessionDraft: true,
    requestMessage: true,
    matchExplanation: true,
    reportClassification: true,
    opsSummary: true,
  },
};
const AI_SEVERITY_LEVELS = ['low', 'medium', 'high'];

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeText(value, maxLength = 80) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeCityName(value) {
  return normalizeText(value, 20).replace(/市$/, '');
}

function normalizeInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeAiTextOutput(value, maxLength, fallback = '') {
  return normalizeText(value, maxLength) || fallback;
}

function emptyAiFeatures() {
  return AI_FEATURE_KEYS.reduce((features, key) => {
    features[key] = false;
    return features;
  }, {});
}

function getAiProviderStatus({ enabled, provider, apiKey }) {
  const providerName = provider || '';
  const providerFeatures = AI_PROVIDER_FEATURES[providerName] || null;
  const providerSupported = !!providerFeatures;
  const providerConfigured = providerName === 'mock' ? true : !!apiKey;
  const ready = !!enabled && !!providerName && providerSupported && providerConfigured;
  return {
    provider: providerName,
    providerSupported,
    providerConfigured,
    ready,
    features: ready ? { ...emptyAiFeatures(), ...providerFeatures } : emptyAiFeatures(),
  };
}

function getAiCapabilities(config) {
  const providerStatus = getAiProviderStatus(config);
  return {
    enabled: !!config.enabled,
    ready: providerStatus.ready,
    provider: providerStatus.provider,
    providerSupported: providerStatus.providerSupported,
    providerConfigured: providerStatus.providerConfigured,
    model: config.model || '',
    timeoutMs: config.timeoutMs,
    dailyLimit: config.dailyLimit,
    features: providerStatus.features,
  };
}

function pickFirstMention(text, values, fallback = '') {
  return values.find((item) => text.includes(item)) || fallback;
}

function buildMockSessionDraft(prompt, profile = {}, options = {}) {
  const gameTypes = options.gameTypes || [];
  const playStyles = options.playStyles || [];
  const budgetRanges = options.budgetRanges || [];
  const text = normalizeText(prompt, 300);
  const gameType = pickFirstMention(text, gameTypes, (profile.gameTypes || [])[0] || '桌游');
  const playMode = text.includes('线上') ? '线上' : '线下';
  const budgetRange = pickFirstMention(text, budgetRanges, profile.budgetRange || '看局而定');
  const knownCities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '重庆', '西安', '苏州', '天津'];
  const city = pickFirstMention(text, knownCities, profile.city || '');
  const playTime = text.includes('上午') ? '10:00' : text.includes('下午') ? '14:00' : '19:30';
  const maxPlayers = gameType === '狼人杀' || gameType === '血染钟楼' ? 10 : gameType === '跑团' ? 5 : 6;
  const styleTags = playStyles.filter((item) => text.includes(item.replace('型', '')) || text.includes(item));
  const tags = normalizeTags([
    text.includes('新手') ? '新手友好' : '',
    text.includes('不鸽') || text.includes('准时') ? '准时不鸽' : '',
    ...styleTags,
    gameType,
  ]);

  return {
    gameType,
    title: normalizeText(`${city ? city : ''}${text.includes('周末') ? '周末' : text.includes('周五') ? '周五晚' : ''}${gameType}局`, 40) || `${gameType}组局`,
    city,
    area: '',
    address: '',
    playDate: '',
    playTime,
    playMode,
    budgetRange,
    minPlayers: gameType === '跑团' ? 3 : 2,
    maxPlayers,
    currentPlayers: 1,
    tags,
    note: normalizeText(`想组一个${tags.includes('新手友好') ? '新手友好、' : ''}氛围稳定的${gameType}局。${text ? `补充：${text}` : ''}`, 500),
    contactNote: '申请通过后再交换联系方式或拉群。',
  };
}

function normalizeAiSessionDraft(draft = {}, profile = {}, options = {}) {
  const gameTypes = options.gameTypes || [];
  const budgetRanges = options.budgetRanges || [];
  const playModes = options.playModes || [];
  const excludedGameTypes = options.excludedGameTypes || [];
  const profileGameType = (profile.gameTypes || []).find((item) => gameTypes.includes(item));
  const gameType = gameTypes.includes(draft.gameType) && !excludedGameTypes.includes(draft.gameType)
    ? draft.gameType
    : profileGameType || '桌游';
  const minPlayers = normalizeInteger(draft.minPlayers, 1, 30, gameType === '跑团' ? 3 : 2);
  const maxPlayers = Math.max(minPlayers, normalizeInteger(draft.maxPlayers, minPlayers, 30, 6));
  const currentPlayers = normalizeInteger(draft.currentPlayers, 1, maxPlayers, 1);
  const playMode = playModes.includes(draft.playMode) ? draft.playMode : '线下';
  const budgetRange = budgetRanges.includes(draft.budgetRange)
    ? draft.budgetRange
    : budgetRanges.includes(profile.budgetRange) ? profile.budgetRange : '看局而定';

  return {
    gameType,
    title: normalizeText(draft.title, 40) || `${gameType}组局`,
    city: normalizeCityName(draft.city || profile.city),
    area: normalizeText(draft.area, 20),
    address: normalizeText(draft.address, 80),
    playDate: normalizeText(draft.playDate, 10),
    playTime: normalizeText(draft.playTime, 8),
    playMode,
    budgetRange,
    minPlayers,
    maxPlayers,
    currentPlayers,
    tags: normalizeTags(draft.tags).filter((tag) => !excludedGameTypes.includes(tag)),
    note: normalizeText(draft.note, 500),
    contactNote: normalizeText(draft.contactNote, 200) || '申请通过后再交换联系方式或拉群。',
  };
}

function buildMockRequestMessage(profile = {}, session = {}) {
  const pieces = [
    profile.city ? `我在${profile.city}` : '',
    profile.gameTypes && profile.gameTypes.length ? `常玩${profile.gameTypes.slice(0, 2).join('、')}` : '',
    profile.playStyles && profile.playStyles.length ? `偏好${profile.playStyles.slice(0, 2).join('、')}风格` : '',
    profile.availability && profile.availability.length ? `${profile.availability[0]}通常有空` : '',
  ].filter(Boolean);
  const intro = pieces.length ? pieces.join('，') : '我对这个局比较感兴趣';
  return normalizeText(`${intro}。看到“${session.title || '这个局'}”时间和类型都合适，希望能加入，会准时沟通不鸽。`, 200);
}

function buildMockMatchExplanation(profile = {}, session = {}, reasons = []) {
  const normalizedReasons = normalizeTags(reasons).slice(0, 4);
  if (!normalizedReasons.length) {
    return '这局暂时没有明显匹配信号，可以重点确认时间、地点和人数是否适合你。';
  }

  const details = [];
  if (normalizedReasons.includes('常玩类型')) {
    details.push(`${session.game_type || '这个类型'}属于你的常玩类型`);
  }
  if (normalizedReasons.includes('同城')) {
    details.push(`${session.city || '同城'}地点更方便线下沟通`);
  }
  if (normalizedReasons.includes('预算匹配')) {
    details.push(`预算${session.budget_range || ''}和你的偏好接近`);
  }
  if (normalizedReasons.includes('玩法偏好')) {
    details.push(`${session.play_mode || '玩法'}符合你的玩法偏好`);
  }
  if (normalizedReasons.includes('人数合适')) {
    details.push(`人数规模接近你偏好的${profile.playerCountRange || '范围'}`);
  }
  if (normalizedReasons.includes('距离近') || normalizedReasons.includes('同城附近')) {
    details.push('地点距离较近');
  }
  if (normalizedReasons.includes('时间临近')) {
    details.push('开局时间比较近');
  }

  const summary = `匹配理由：${normalizedReasons.join('、')}。`;
  const detailText = details.length ? details.join('，') + '。' : '';
  return normalizeText(`${summary}${detailText}建议再确认具体时间和局主说明是否合适。`, 220);
}

function buildMockReportClassification(input = {}, options = {}) {
  const reportReasons = options.reportReasons || [];
  const reason = reportReasons.includes(input.reason) ? input.reason : '';
  const detail = normalizeText(input.detail, 300);
  const text = `${reason} ${detail}`;
  const rules = [
    { reason: '骚扰', pattern: /骚扰|辱骂|威胁|私信|纠缠|不舒服|性骚扰/ },
    { reason: '鸽局', pattern: /鸽|不来|失联|迟到|放鸽子|临时取消|爽约/ },
    { reason: '虚假信息', pattern: /虚假|骗人|诈骗|假|冒充|信息不实|转账/ },
    { reason: '不合适内容', pattern: /黄赌毒|色情|暴力|歧视|广告|引流|不合适/ },
  ];
  const matched = rules.find((item) => item.pattern.test(text));
  const category = matched ? matched.reason : reason || '其他';
  const highRisk = /威胁|诈骗|转账|人身安全|性骚扰|黄赌毒|暴力/.test(text);
  const mediumRisk = highRisk || category !== '其他' || detail.length >= 20;
  const severity = highRisk ? 'high' : mediumRisk ? 'medium' : 'low';
  const confidence = matched || reason ? 0.82 : 0.58;
  const summary = detail
    ? normalizeText(`用户描述与“${category}”较相关：${detail}`, 120)
    : `用户选择了“${category}”，建议结合上下文复核。`;
  const suggestedAction = severity === 'high'
    ? '优先人工复核，必要时先限制可疑互动。'
    : severity === 'medium'
      ? '进入人工复核队列，结合局记录和聊天凭证判断。'
      : '暂按低风险记录，等待更多证据或重复举报。';

  return { reason: category, severity, confidence, summary, suggestedAction };
}

function normalizeAiReportClassification(classification = {}, options = {}) {
  const reportReasons = options.reportReasons || [];
  const reason = reportReasons.includes(classification.reason) ? classification.reason : '其他';
  const severity = AI_SEVERITY_LEVELS.includes(classification.severity) ? classification.severity : 'low';
  const rawConfidence = Number(classification.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, Math.round(rawConfidence * 100) / 100))
    : 0.5;
  return {
    reason,
    severity,
    confidence,
    summary: normalizeAiTextOutput(classification.summary, 120, `建议按“${reason}”复核。`),
    suggestedAction: normalizeAiTextOutput(classification.suggestedAction, 120, '进入人工复核队列。'),
  };
}

function buildMockOpsSummary(snapshot = {}) {
  const stats = snapshot.stats || {};
  const topReport = (snapshot.reportBreakdown || [])[0];
  const feedback = snapshot.feedback || {};
  const highlights = [
    `当前开放局 ${stats.openSessions || 0} 个，待处理申请 ${stats.pendingRequests || 0} 个。`,
    `开放举报 ${stats.openReports || 0} 条${topReport ? `，最高频原因是${topReport.reason}` : ''}。`,
    `局后反馈 ${feedback.total || 0} 条，愿意再约 ${feedback.wouldPlayAgain || 0} 条。`,
  ];
  const actions = [];
  if ((stats.openReports || 0) > 0) {
    actions.push(topReport ? `优先复核${topReport.reason}类举报。` : '优先复核开放举报。');
  }
  if ((stats.pendingRequests || 0) > 0) {
    actions.push('提醒局主及时处理待确认申请。');
  }
  if ((stats.openSessions || 0) === 0) {
    actions.push('补充示例局或引导活跃用户发起新局。');
  }
  if (!actions.length) {
    actions.push('维持现有监控，关注新增举报和申请积压。');
  }
  return {
    summary: normalizeText(highlights.join(''), 240),
    highlights,
    actions,
  };
}

function normalizeAiOpsSummary(summary = {}, snapshot = {}) {
  const stats = snapshot.stats || {};
  const feedback = snapshot.feedback || {};
  const highlights = Array.isArray(summary.highlights)
    ? normalizeTags(summary.highlights).slice(0, 5)
    : [];
  const normalizedHighlights = highlights.length ? highlights : [
    `当前开放局 ${stats.openSessions || 0} 个，待处理申请 ${stats.pendingRequests || 0} 个。`,
    `开放举报 ${stats.openReports || 0} 条。`,
    `局后反馈 ${feedback.total || 0} 条，愿意再约 ${feedback.wouldPlayAgain || 0} 条。`,
  ];
  const actions = Array.isArray(summary.actions)
    ? normalizeTags(summary.actions).slice(0, 5)
    : [];
  return {
    summary: normalizeAiTextOutput(summary.summary, 240, normalizedHighlights.join('')),
    highlights: normalizedHighlights,
    actions: actions.length ? actions : ['维持现有监控，关注新增举报和申请积压。'],
  };
}

module.exports = {
  getAiCapabilities,
  normalizeAiTextOutput,
  buildMockSessionDraft,
  normalizeAiSessionDraft,
  buildMockRequestMessage,
  buildMockMatchExplanation,
  buildMockReportClassification,
  normalizeAiReportClassification,
  buildMockOpsSummary,
  normalizeAiOpsSummary,
};
