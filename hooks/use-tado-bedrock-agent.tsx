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
import { Tado } from "@/lib/tado/tado";

// const client = new BedrockAgentRuntimeClient({ region: "REGION" });
const bedrockClient = new BedrockAgentRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.NEXT_PUBLIC_AWS_SESSION_TOKEN!,
  },
});

export function useTadoBedrockAgent(tadoToken: AccessToken) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const chatId = uuidv4();

  const handleSubmit = async () => {
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

    const tadoClient = new Tado(
      process.env.NEXT_PUBLIC_TADO_USERNAME!,
      process.env.NEXT_PUBLIC_TADO_PASSWORD!
    );
    tadoClient.accessToken = tadoToken;

    const agentInput: InvokeAgentRequest = {
      agentId: "NA6YAHIZYV",
      agentAliasId: "SCDHRJKTIV",
      sessionId: chatId,
      inputText: input,
    };

    const command = new InvokeAgentCommand(agentInput);
    const response = await bedrockClient.send(command);

    if (response.completion === undefined) {
      throw new Error("Completion is undefined");
    }

    let completion = "";

    for await (const chunkEvent of response.completion) {
      if (chunkEvent.returnControl !== undefined) {
        console.log("Return control event received");
        console.log(chunkEvent.returnControl);

        const url =
          chunkEvent.returnControl.invocationInputs![0].apiInvocationInput!
            .apiPath!;
        const parameterisedUrl = url.replace("{homeId}", process.env.HOME_ID!);
        const method = chunkEvent.returnControl.invocationInputs![0]
          .apiInvocationInput!.httpMethod! as "GET" | "POST";
        const data = {};
        const response = await tadoClient.apiCall(
          parameterisedUrl,
          method,
          data
        );

        console.log("response from tado", response);
        break;
      }

      const chunk = chunkEvent.chunk;
      console.log(chunk);
      if (chunk !== undefined) {
        const decodedResponse = new TextDecoder("utf-8").decode(chunk!.bytes);
        completion += decodedResponse;
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: completion,
        id: uuidv4(),
      },
    ]);
    stop();
    // }, 2000);
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
