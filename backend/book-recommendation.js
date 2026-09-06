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
  return normalizeTasteProfile({
    favoriteTags: answers.experience,
    avoidTags: answers.avoid,
    pace: Array.isArray(answers.pace) ? answers.pace[0] : answers.pace,
    frequency: Array.isArray(answers.frequency) ? answers.frequency[0] : answers.frequency,
  });
}

function includesRelated(values, target) {
  return values.some((value) => value === target || value.includes(target) || target.includes(value));
}

function scoreBook(row = {}, tasteProfile = {}, history = {}) {
  const profile = normalizeTasteProfile(tasteProfile);
  const tags = parseArray(row.tags);
  const warnings = parseArray(row.warnings);
  if (history.dismissed) return { score: -100, matchScore: 0, reasons: ['已跳过'] };

  const hasTaste = profile.favoriteTags.length || profile.avoidTags.length || profile.pace || profile.frequency;
  let score = hasTaste ? 24 : 0;
  const reasons = [];
  const shared = profile.favoriteTags.filter((tag) => includesRelated(tags, tag));
  if (shared.length) {
    score += Math.min(shared.length, 2) * 22;
    reasons.push('符合你的偏好');
  }

  const risk = profile.avoidTags.filter((tag) => includesRelated(warnings, tag) || includesRelated(tags, tag));
  if (risk.length) {
    score -= 42;
    reasons.push('可能踩中你的雷点');
  }

  if (profile.pace && includesRelated(tags, profile.pace)) {
    score += 10;
    reasons.push('节奏符合');
  }
  if (profile.frequency === '高频' && row.difficulty === '进阶') {
    score += 8;
    reasons.push('适合高频玩家');
  }
  if (profile.frequency === '偶尔' && row.difficulty === '入门') {
    score += 8;
    reasons.push('偶尔玩也容易上手');
  }
  if (history.saved) {
    score += 8;
    reasons.push('你收藏过相似内容');
  }
  if (history.viewed) score -= 2;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
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
};
