import { ChatRequestOptions, CreateMessage, Message } from "ai";
import { v4 as uuidv4 } from "uuid";
import { useEffect, useState } from "react";
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentRequest,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { AccessToken } from "simple-oauth2";
import { processPrompt } from "@/components/server-chat";

export function useTadoBedrockAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const chatId = uuidv4();

  const handleSubmit = async () => {
    append({
      role: "user",
      content: input,
    });
    setIsLoading((prev) => true);

    const completion = await processPrompt(chatId, input);

    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: completion,
        id: uuidv4(),
      },
    ]);
    stop();
  };

  const append = (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ): Promise<string | null | undefined> => {
    return new Promise((resolve) => {
      console.log("appending message", message);
      const messageWithId = { ...message, id: uuidv4() };
      setMessages((prev) => [...prev, messageWithId]);
      resolve(undefined);
    });
  };

  const streamingData = {};
  const stop = (): void => {
    // This triggers when the UI stop button is clicked
    console.log("stop");
    setIsLoading((prev) => false);
    setInput((prev) => "");
  };

  return {
    chatId,
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    data: streamingData,
  };
}
