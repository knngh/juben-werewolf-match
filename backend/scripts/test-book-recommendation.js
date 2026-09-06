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
