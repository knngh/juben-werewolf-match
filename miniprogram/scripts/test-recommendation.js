const assert = require('assert');
const recommendation = require('../utils/recommendation');

assert.strictEqual(recommendation.normalizeScore(88.4), 88);
assert.strictEqual(recommendation.normalizeScore(-5), 0);
assert.strictEqual(recommendation.normalizeScore(120), 100);
assert.strictEqual(recommendation.matchLevel(72), '高度匹配');
assert.strictEqual(recommendation.matchLevel(43), '比较合适');
assert.strictEqual(recommendation.matchLevel(0), '待完善偏好');

const session = recommendation.enrichRecommendation({
  matchScore: 76,
  matchReasons: ['同城', '常玩类型', '时间临近'],
});
assert.strictEqual(session.matchLevel, '高度匹配');
assert.strictEqual(session.matchReasonsText, '同城、常玩类型、时间临近');
assert.strictEqual(session.recommendationText, '因为同城、常玩类型、时间临近');
assert.strictEqual(recommendation.scoreFromRaw(17), 100);

console.log('recommendation tests ok');
