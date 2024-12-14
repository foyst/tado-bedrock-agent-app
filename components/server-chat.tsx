"use server";

import { Chat } from "./chat";
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentRequest,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { Tado } from "node-tado-client";

const tadoClient = new Tado();

try {
  await tadoClient.login(
    process.env.NEXT_PUBLIC_TADO_USERNAME!,
    process.env.NEXT_PUBLIC_TADO_PASSWORD!
  );
} catch (error) {
  console.error("Error logging in: ", error);
}

export async function ChatServerComponent() {
  return (
    <>
      <Chat />
    </>
  );
}

const bedrockClient = new BedrockAgentRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.NEXT_PUBLIC_AWS_SESSION_TOKEN!,
  },
});

export async function processPrompt(chatId: string, input: string) {
  const agentId = "NA6YAHIZYV";
  const agentInput: InvokeAgentRequest = {
    agentId: agentId,
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

      const apiInvocationInput =
        chunkEvent.returnControl.invocationInputs![0].apiInvocationInput!;
      const url = "/api/v2" + apiInvocationInput.apiPath!;
      const parameterisedUrl = url.replace("{homeId}", process.env.HOME_ID!);
      const method = apiInvocationInput.httpMethod! as "GET" | "POST";
      const data = {};
      const response = await tadoClient.apiCall(parameterisedUrl, method, data);

      const agentInputWithTadoResponse: InvokeAgentRequest = {
        ...agentInput,
        sessionState: {
          returnControlInvocationResults: [
            // ReturnControlInvocationResults
            {
              // InvocationResultMember Union: only one key present
              apiResult: {
                // ApiResult
                actionGroup: apiInvocationInput.actionGroup, // required
                agentId: agentId,
                apiPath: apiInvocationInput.apiPath,
                confirmationState: "CONFIRM",
                httpMethod: apiInvocationInput.httpMethod,
                httpStatusCode: 200,
                responseBody: {
                  TEXT: {
                    body: JSON.stringify(response),
                  },
                },
              },
            },
          ],
          invocationId: chunkEvent.returnControl.invocationId,
        },
      };

      const command = new InvokeAgentCommand(agentInputWithTadoResponse);
      const updatedResponse = await bedrockClient.send(command);

      console.log("response from agent", updatedResponse);
      break;
    }

    const chunk = chunkEvent.chunk;
    console.log(chunk);
    if (chunk !== undefined) {
      const decodedResponse = new TextDecoder("utf-8").decode(chunk!.bytes);
      completion += decodedResponse;
    }
  }

  return completion;
}
