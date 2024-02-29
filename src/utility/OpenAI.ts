import Queue from 'better-queue';
import OpenAI from 'openai';

import { summaryStorage } from '../constant';
import Strategy from './Strategy';
import { SummaryStrategy } from './SummarySplitter';
import { createMd5 } from './common';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const summaryTaskHandler = async (
  input: {
    content: string;
    strategy: SummaryStrategy;
  },
  cb: any,
) => {
  const { content, strategy } = input;
  try {
    const result = await summaryByStrategy(content, strategy);
    cb(null, result);
  } catch (error) {
    console.error(error);
    cb(error);
  }
};

// Create a better-queue instance with the task handler and concurrency of 3
const summaryQueue = new Queue(summaryTaskHandler, {
  concurrent: 3,
  maxRetries: 10,
  retryDelay: 30000,
});

const summaryByStrategy = async (
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

export const enqueueSummaryByStrategy = (
  content: string,
  strategy: SummaryStrategy,
): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    summaryQueue.push({ content, strategy }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};
