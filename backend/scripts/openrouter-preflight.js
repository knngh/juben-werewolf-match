require('../env')();

const ai = require('../ai');

const DEFAULT_MODELS = {
  openrouter: 'openrouter/free',
  opencode: 'nemotron-3-super-free',
};

function parseIntegerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseNumberEnv(name, fallback, min) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

function requireConfig(condition, message) {
  if (condition) return;
  const error = new Error(message);
  error.configurationError = true;
  throw error;
}

function buildConfig() {
  const provider = process.env.AI_PROVIDER || '';
  const apiKey = process.env.AI_API_KEY || '';

  requireConfig(process.env.AI_ENABLED === 'true', 'AI_ENABLED must be true for AI provider preflight');
  requireConfig(
    provider === 'openrouter' || provider === 'opencode',
    'AI_PROVIDER must be openrouter or opencode for AI provider preflight'
  );
  requireConfig(!!apiKey, 'AI_API_KEY is required for AI provider preflight');

  return {
    enabled: true,
    provider,
    apiKey,
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider],
    baseUrl: process.env.AI_BASE_URL || '',
    siteUrl: process.env.AI_SITE_URL || '',
    appTitle: process.env.AI_APP_TITLE || 'juben-werewolf-match',
    timeoutMs: parseIntegerEnv('AI_TIMEOUT_MS', 8000, 1000, 60000),
    retryCount: parseIntegerEnv('AI_RETRY_COUNT', 1, 0, 3),
    dailyLimit: parseIntegerEnv('AI_DAILY_LIMIT', 200, 1, 100000),
    dailyCostLimit: parseNumberEnv('AI_DAILY_COST_LIMIT', 0, 0),
  };
}

async function main() {
  const config = buildConfig();
  const capabilities = ai.getAiCapabilities(config);
  requireConfig(capabilities.ready, 'AI provider is not ready');

  const result = await ai.generateRequestMessage(
    config,
    {
      city: '上海',
      gameTypes: ['剧本杀'],
      playStyles: ['推理型'],
      availability: ['周末晚上'],
    },
    {
      title: '周末推理剧本杀',
      game_type: '剧本杀',
      city: '上海',
      play_date: '2026-06-06',
      play_time: '19:30',
      play_mode: '线下',
    }
  );

  if (typeof result.data !== 'string' || !result.data.trim()) {
    throw new Error('OpenRouter preflight returned an empty message');
  }

  const meta = result.meta || {};
  console.log(JSON.stringify({
    ok: true,
    provider: capabilities.provider,
    model: capabilities.model || DEFAULT_MODELS[capabilities.provider],
    selectedModel: meta.providerModel || null,
    outputLength: result.data.length,
    usage: {
      providerRequestId: meta.providerRequestId || null,
      promptTokens: meta.promptTokens ?? null,
      completionTokens: meta.completionTokens ?? null,
      totalTokens: meta.totalTokens ?? null,
      costCredits: meta.costCredits ?? null,
    },
  }, null, 2));
}

main().catch((error) => {
  const prefix = error.configurationError ? 'configuration' : 'request';
  console.error(`AI provider preflight ${prefix} failed: ${error.message}`);
  process.exit(1);
});
