import OpenAI from 'openai';

import { summaryStorage } from '../constant';
import Strategy from './Strategy';
import { SummaryStrategy } from './SummarySplitter';
import { createMd5 } from './common';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const summaryByStrategy = async (
  content: string,
  strategy: SummaryStrategy,
): Promise<string | null> => {
  const messages = [
    ...Strategy[strategy],
    {
      role: 'user',
      content,
    },
  ];
  const model = process.env.SUMMARY_MODEL_NAME || 'gpt-3.5-turbo';
  const key = [createMd5(JSON.stringify(messages)), model].join(':');
  const cached = await summaryStorage.get(key);

  if (cached) {
    return cached;
  }

  const completion = await openai.chat.completions.create({
    messages,
    model,
    temperature: 0,
  });
  const summarized = completion.choices?.[0]?.message?.content || null;

  if (summarized) {
    await summaryStorage.set(key, summarized);
    return summarized;
  }

  throw {
    message: '`summaryByStrategy` failed',
  };
};
