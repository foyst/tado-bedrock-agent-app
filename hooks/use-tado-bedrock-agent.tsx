import { ChatRequestOptions, CreateMessage, Message } from "ai";
import { v4 as uuidv4 } from "uuid";
import { useEffect, useState } from "react";

export function useTadoBedrockAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");

  const handleSubmit = (params: object) => {
    console.log("submit!!");
    console.log("input is: ", input);
    append({
      role: "user",
      content: input,
    });
    // Set isLoading to true
    setIsLoading((prev) => true);
    // Get message from input
    // Send message to Bedrock Agent and await response
    // Append response to messages
    // Profit

    setTimeout(() => {
      console.log("appending response");
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "Come get some!",
          id: uuidv4(),
        },
      ]);
      stop();
    }, 2000);
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

  //   useEffect(() => {

  //     return () => {
  //       // cleanup
  //     };
  //   });

  return {
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
