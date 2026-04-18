import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";

export async function createModel(modelId: string): Promise<BaseChatModel> {
  if (modelId.startsWith("gpt-")) {
    try {
      // Dynamic import — requires @langchain/openai to be installed
      const mod = await import("@langchain/openai" as string);
      return new mod.ChatOpenAI({ model: modelId });
    } catch {
      throw new Error("Install @langchain/openai to use OpenAI models");
    }
  }
  const m = new ChatAnthropic({ model: modelId });
  // LangChain defaults topP/topK to -1 as a sentinel, but Anthropic API rejects -1
  (m as unknown as Record<string, unknown>).topP = undefined;
  (m as unknown as Record<string, unknown>).topK = undefined;
  return m;
}
