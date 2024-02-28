import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

import { summaryByStrategy } from './OpenAI';
import { countTokens } from './common';

export type SummaryStrategy = 'document' | 'code' | string;

class SummarySplitter extends RecursiveCharacterTextSplitter {
  summaryStrategy: SummaryStrategy;

  constructor(summaryStrategy: SummaryStrategy) {
    super();

    this.summaryStrategy = summaryStrategy;
  }

  async splitText(text: string): Promise<string[]> {
    const maxTokens = +(process.env.SUMMARY_MAX_TOKENS || 16000);
    const currentTokens = await countTokens(text);

    if (currentTokens > maxTokens) {
      console.warn("The maximum token limit has been reached; using the default strategy for splitting text.")
      return super.splitText(text);
    }

    const summary = await summaryByStrategy(text, this.summaryStrategy);

    return [summary];
  }
}

export default SummarySplitter;
