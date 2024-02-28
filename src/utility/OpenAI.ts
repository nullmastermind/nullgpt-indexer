import { pathExists, readFile } from 'fs-extra';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';

import summary from './prompts/summary.json';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 10,
});

export const summaryCode = async (fileFullPath: string): Promise<string | null> => {
  if (!(await pathExists(fileFullPath))) return null;

  const code = await readFile(fileFullPath, 'utf-8');
  const completion = await openai.chat.completions.create({
    messages: [
      ...(summary as ChatCompletionMessageParam[]),
      {
        role: 'user',
        content: `${fileFullPath}\n\n\`\`\`${code}\`\`\``,
      },
    ],
    model: 'gpt-3.5-turbo',
  });
  const summarized = completion.choices?.[0]?.message?.content || null;

  if (summarized) {
    return `${fileFullPath}\n${summarized}`;
  }

  return null;
};
