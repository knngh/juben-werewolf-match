const SCORE_MAX = 17;

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function matchLevel(score) {
  const normalized = normalizeScore(score);
  if (normalized >= 70) return '高度匹配';
  if (normalized >= 40) return '比较合适';
  if (normalized > 0) return '有共同偏好';
  return '待完善偏好';
}

function reasonsText(reasons = []) {
  return Array.isArray(reasons) ? reasons.filter(Boolean).slice(0, 4).join('、') : '';
}

function enrichRecommendation(item = {}) {
  const next = Object.assign({}, item);
  const rawScore = item.matchScore !== undefined ? item.matchScore : item.score;
  next.matchScore = normalizeScore(rawScore);
  next.matchLevel = matchLevel(next.matchScore);
  next.matchReasonsText = reasonsText(item.matchReasons);
  next.recommendationText = next.matchReasonsText
    ? `因为${next.matchReasonsText}`
    : '完善资料后会获得更准确的推荐';
  return next;
}

function scoreFromRaw(rawScore) {
  const score = Number(rawScore);
  if (!Number.isFinite(score)) return 0;
  return normalizeScore((score / SCORE_MAX) * 100);
}

module.exports = {
  normalizeScore,
  matchLevel,
  reasonsText,
  enrichRecommendation,
  scoreFromRaw,
};
