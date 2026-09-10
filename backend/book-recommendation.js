function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function parseArray(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  try {
    const parsed = JSON.parse(value || '[]');
    return uniqueStrings(parsed);
  } catch {
    return [];
  }
}

const EXPERIENCE_TAGS = {
  '硬核推理': ['硬核推理', '推理'],
  '情感沉浸': ['情感沉浸', '情感', '情感线'],
  '机制阵营': ['机制阵营', '机制', '阵营'],
  '恐怖惊悚': ['恐怖惊悚', '恐怖', '惊悚'],
  '轻松社交': ['轻松社交', '轻松', '社交', '欢乐'],
};
const RISK_TAGS = {
  embarrassment: { label: '怕尬', phrases: ['怕尬', '尴尬', '强制表演'] },
  sidelined: { label: '怕边缘', phrases: ['怕边缘', '边缘角色', '参与感较弱'] },
  forced_emotion: { label: '强行煽情', phrases: ['强行煽情', '强制煽情', '强制哭泣'] },
  confrontation: { label: '公开对抗', phrases: ['公开对抗', '对抗感明显', '不喜欢公开发言请谨慎'] },
  fear: { label: '惊吓压迫', phrases: ['惊吓压迫', '含惊吓', '怕惊吓', '压迫感', '惊吓桥段'] },
};

function experienceTags(tags) {
  const values = parseArray(tags);
  return Object.keys(EXPERIENCE_TAGS).filter((key) => EXPERIENCE_TAGS[key].some((tag) => values.includes(tag)));
}

function riskTags(row) {
  const explicit = parseArray(row.risk_tags || row.riskTags);
  const warnings = parseArray(row.warnings);
  return Object.keys(RISK_TAGS).filter((code) => explicit.includes(code) || explicit.includes(RISK_TAGS[code].label) ||
    warnings.some((warning) => RISK_TAGS[code].phrases.some((phrase) => warning.includes(phrase))));
}

function buildFeedbackPreferences(records) {
  const totals = {};
  records.forEach((record) => {
    const rating = Number(record.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
    experienceTags(record.tags).forEach((tag) => {
      const entry = totals[tag] || { sum: 0, count: 0 };
      entry.sum += (rating - 3) * 2;
      entry.count += 1;
      totals[tag] = entry;
    });
  });
  // Two neutral observations keep a single rating from dominating a whole genre.
  return Object.fromEntries(Object.entries(totals).map(([tag, value]) => [tag, value.sum / (value.count + 2)]));
}

function normalizeTasteProfile(profile) {
  const value = profile || {};
  return {
    favoriteTags: uniqueStrings(value.favoriteTags),
    avoidTags: uniqueStrings(value.avoidTags),
    pace: String(value.pace || '').trim(),
    frequency: String(value.frequency || '').trim(),
  };
}

function deriveTasteProfile(answers = {}) {
  const profile = normalizeTasteProfile({
    favoriteTags: answers.experience,
    avoidTags: answers.avoid,
    pace: Array.isArray(answers.pace) ? answers.pace[0] : answers.pace,
    frequency: Array.isArray(answers.frequency) ? answers.frequency[0] : answers.frequency,
  });
  profile.favoriteTags = profile.favoriteTags.filter((tag) => EXPERIENCE_TAGS[tag]).slice(0, 2);
  profile.avoidTags = profile.avoidTags.filter((tag) => Object.values(RISK_TAGS).some((risk) => risk.label === tag)).slice(0, 3);
  if (!['短局轻量', '长时沉浸', '节奏紧凑', '都可以'].includes(profile.pace)) profile.pace = '';
  if (!['偶尔', '每月 1-2 次', '高频', '刚入门'].includes(profile.frequency)) profile.frequency = '';
  return profile;
}

function includesRelated(values, target) {
  return values.some((value) => value === target || value.includes(target) || target.includes(value));
}

function scoreBook(row = {}, tasteProfile = {}, history = {}) {
  const profile = normalizeTasteProfile(tasteProfile);
  const tags = parseArray(row.tags);
  const warnings = parseArray(row.warnings);
  const hasTaste = profile.favoriteTags.length || profile.avoidTags.length || profile.pace || profile.frequency;
  if (history.dismissed) return { score: -100, matchScore: hasTaste ? 0 : null, reasons: ['已跳过'] };
  let score = hasTaste ? 24 : 0;
  const reasons = [];
  const experiences = experienceTags(tags);
  const shared = profile.favoriteTags.filter((tag) => experiences.includes(tag));
  if (shared.length) {
    score += Math.min(shared.length, 2) * 22;
    reasons.push('符合你的偏好');
  }

  const risks = riskTags(row).map((code) => RISK_TAGS[code].label);
  const risk = profile.avoidTags.filter((tag) => risks.includes(tag) || warnings.includes(tag));
  if (risk.length) {
    score -= 42;
    reasons.unshift('可能踩中你的雷点');
  }

  const duration = Number(row.duration_min || row.durationMin);
  if ((profile.pace === '短局轻量' && duration > 0 && duration <= 120) ||
      (profile.pace === '长时沉浸' && duration >= 180) ||
      (profile.pace === '节奏紧凑' && includesRelated([...tags, ...parseArray(row.highlights)], '节奏紧凑'))) {
    score += 10;
    reasons.push('节奏符合');
  }
  if (profile.pace === '短局轻量' && duration > 180) {
    score -= 16;
    reasons.push('时长超过你的轻量偏好');
  }
  if (profile.frequency === '高频' && row.difficulty === '进阶') {
    score += 8;
    reasons.push('适合高频玩家');
  }
  if (['偶尔', '刚入门'].includes(profile.frequency) && row.difficulty === '入门') {
    score += 8;
    reasons.push('偶尔玩也容易上手');
  }
  if (history.saved) {
    score += 8;
    reasons.push('你已收藏这本');
  }
  if (history.viewed) score -= 2;

  const feedback = Math.max(-8, Math.min(8, Math.round(experiences.reduce((sum, tag) => sum + ((history.tagPreferences || {})[tag] || 0), 0))));
  score += feedback;
  if (feedback) reasons.push(feedback > 0 ? '你对这类体验的评分较高' : '你对这类体验的评分偏低');
  if (history.played) {
    score -= 18;
    reasons.unshift('你已经玩过');
  }

  const normalized = hasTaste ? Math.max(0, Math.min(risk.length ? 39 : 100, Math.round(score))) : null;
  if (risk.length) score = Math.min(score, 39);
  return {
    score,
    matchScore: normalized,
    reasons: reasons.slice(0, 4),
  };
}

module.exports = {
  deriveTasteProfile,
  normalizeTasteProfile,
  scoreBook,
  buildFeedbackPreferences,
  riskTags,
};
