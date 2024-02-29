import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

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
    const strategyTokens = await countTokens(JSON.stringify(Strategy[this.summaryStrategy]));
    const maxTokens = +(process.env.SUMMARY_MAX_TOKENS || 16000) - strategyTokens;
    const currentTokens = await countTokens(text);

    if (currentTokens > maxTokens) {
      const parts = await super.splitText(text);
      const requestTexts = [];
      let requestText = '';

      for (const part of parts) {
        const temp = [requestText, part].join('\n');
        const tokens = await countTokens(temp);

        if (tokens >= maxTokens) {
          requestTexts.push(requestText);
          requestText = part;
          continue;
        }

        requestText = temp;
      }

      if (requestText) {
        requestTexts.push(requestText);
      }

      const summaries = await Promise.all(
        requestTexts.map((text) => summaryByStrategy(text, this.summaryStrategy)),
      );
      const tempText = summaries.join('\n');

      if ((await countTokens(tempText)) < maxTokens) {
        text = tempText;
      } else {
        return summaries;
      }
    }

    const summary = await summaryByStrategy(text, this.summaryStrategy);

    return [summary];
  }
}

export default SummarySplitter;
