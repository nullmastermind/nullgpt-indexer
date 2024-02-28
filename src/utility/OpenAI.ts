import OpenAI from 'openai';

import Strategy from './Strategy';
import { SummaryStrategy } from './SummarySplitter';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 10,
});

export const summaryByStrategy = async (
  content: string,
  strategy: SummaryStrategy,
): Promise<string | null> => {
  const completion = await openai.chat.completions.create({
    messages: [
      ...Strategy[strategy],
      {
        role: 'user',
        content,
      },
    ],
    model: 'gpt-3.5-turbo',
    temperature: 0,
  });
  const summarized = completion.choices?.[0]?.message?.content || null;

  if (summarized) {
    return summarized;
  }

  throw {
    message: '`summaryByStrategy` failed',
  };
};
