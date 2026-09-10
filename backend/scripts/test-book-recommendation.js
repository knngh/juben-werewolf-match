const assert = require('assert');
const {
  deriveTasteProfile,
  scoreBook,
  normalizeTasteProfile,
} = require('../book-recommendation');

const profile = deriveTasteProfile({
  experience: ['硬核推理', '情感沉浸'],
  avoid: ['怕尬'],
  pace: ['长时沉浸'],
  frequency: '每月 1-2 次',
});

assert.deepStrictEqual(profile.favoriteTags, ['硬核推理', '情感沉浸']);
assert.deepStrictEqual(profile.avoidTags, ['怕尬']);
assert.strictEqual(profile.frequency, '每月 1-2 次');

const matched = scoreBook({
  game_type: '剧本杀',
  tags: JSON.stringify(['硬核推理', '沉浸']),
  warnings: JSON.stringify(['不适合只想纯推理的玩家']),
  min_players: 6,
  max_players: 7,
  duration_min: 240,
  difficulty: '进阶',
}, profile, { viewed: false, saved: false, dismissed: false });
assert(matched.matchScore >= 40);
assert(matched.reasons.includes('符合你的偏好'));

const dismissed = scoreBook({
  game_type: '剧本杀',
  tags: JSON.stringify(['欢乐', '社交']),
  warnings: JSON.stringify(['怕尬']),
  min_players: 6,
  max_players: 6,
  duration_min: 90,
  difficulty: '入门',
}, profile, { viewed: false, saved: false, dismissed: true });
assert.strictEqual(dismissed.matchScore, 0);

assert.deepStrictEqual(normalizeTasteProfile(null), { favoriteTags: [], avoidTags: [], pace: '', frequency: '' });
console.log('book recommendation tests ok');

const { test } = require('node:test');
const recommendation = require('../book-recommendation');
const starterScripts = require('../starter-scripts');

test('equivalent fear warnings are recognized as an avoided experience', () => {
  const script = starterScripts.find((item) => item.slug === 'midnight-train');
  const score = scoreBook(script, { favoriteTags: ['恐怖惊悚'], avoidTags: ['惊吓压迫'], frequency: '高频' });
  assert(score.reasons.includes('可能踩中你的雷点'));
  assert(score.matchScore < 40);
});

test('short-session preferences use duration rather than genre tags', () => {
  const profile = { favoriteTags: ['硬核推理'], pace: '短局轻量', frequency: '偶尔' };
  const script = { tags: ['硬核推理'], difficulty: '入门' };
  assert(scoreBook({ ...script, duration_min: 90 }, profile).score > scoreBook({ ...script, duration_min: 240 }, profile).score);
});

test('a new user without taste answers has no purported match percentage', () => {
  assert.strictEqual(scoreBook({ tags: ['硬核推理'] }, {}, {}).matchScore, null);
});

test('a saved book is explained as this book rather than similar content', () => {
  const result = scoreBook({}, { favoriteTags: ['轻松社交'] }, { saved: true });
  assert(result.reasons.includes('你已收藏这本'));
  assert(!result.reasons.includes('你收藏过相似内容'));
});

test('past ratings contribute a bounded signal while played books are demoted', () => {
  const preferences = recommendation.buildFeedbackPreferences([{ tags: ['硬核推理'], rating: 1 }]);
  const script = { tags: ['硬核推理'], difficulty: '进阶' };
  const profile = { favoriteTags: ['硬核推理'], frequency: '高频' };
  const baseline = scoreBook(script, profile);
  const feedback = scoreBook(script, profile, { tagPreferences: preferences });
  assert(feedback.score < baseline.score);
  assert(baseline.score - feedback.score <= 8);
  assert(scoreBook(script, profile, { played: true }).score < baseline.score);
  assert.deepStrictEqual(recommendation.buildFeedbackPreferences([]), {});
});
