import OpenAI from 'openai';

/** Explicit per-owner credentials; no environment-selected tenant or endpoint. */
export function openAiClient(apiKey: string, timeout: number): OpenAI {
  return new OpenAI({
    apiKey, baseURL: 'https://api.openai.com/v1', organization: null, project: null,
    timeout, maxRetries: 0, logLevel: 'off',
    fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
  });
}
