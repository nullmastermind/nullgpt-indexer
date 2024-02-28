import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

import { db } from '../constant';
import { summaryByStrategy } from './OpenAI';
import Strategy from './Strategy';
import { countTokens, createMd5 } from './common';

export type SummaryStrategy = 'document' | 'code' | string;

class SummarySplitter extends RecursiveCharacterTextSplitter {
  summaryStrategy: SummaryStrategy;
  summaryStrategyKey: string;

  constructor(summaryStrategy: SummaryStrategy) {
    super();

    this.summaryStrategy = summaryStrategy;
    this.summaryStrategyKey = createMd5(JSON.stringify(Strategy[summaryStrategy]));
  }

  async splitText(text: string): Promise<string[]> {
    const maxTokens = +(process.env.SUMMARY_MAX_TOKENS || 16000);
    const currentTokens = await countTokens(text);

    if (currentTokens > maxTokens) {
      console.warn(
        'The maximum token limit has been reached; using the default strategy for splitting text.',
      );
      return super.splitText(text);
    }

    const key = [this.summaryStrategyKey, createMd5(text)].join(':');
    const cachedValue = await db.get(key);

    if (cachedValue) {
      return [cachedValue];
    }

    const summary = await summaryByStrategy(text, this.summaryStrategy);

    await db.set(key, summary);

    return [summary];
  }
}

export default SummarySplitter;
