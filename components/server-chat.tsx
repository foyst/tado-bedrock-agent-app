"use server";

import { Chat } from "./chat";
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentRequest,
  ResponseStream,
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
    // agentAliasId: "SCDHRJKTIV",
    agentAliasId: "TSTALIASID",
    sessionId: chatId,
    inputText: input,
  };

  const command = new InvokeAgentCommand(agentInput);
  const response = await bedrockClient.send(command);

  if (response.completion === undefined) {
    throw new Error("Completion is undefined");
  }

  const completion = await processResponseCompletion(
    agentInput,
    response.completion
  );

  return completion;
}

async function processResponseCompletion(
  agentInput: InvokeAgentRequest,
  chunks: AsyncIterable<ResponseStream>
): Promise<string | undefined> {
  for await (const chunkEvent of chunks) {
    if (chunkEvent.returnControl !== undefined) {
      const apiInvocationInput =
        chunkEvent.returnControl.invocationInputs![0].apiInvocationInput!;
      const url = "/api/v2" + apiInvocationInput.apiPath!;

      const apiParameters = apiInvocationInput.parameters!;

      apiParameters.unshift({
        name: "homeId",
        value: process.env.HOME_ID!,
      });

      const parameterisedUrl = apiParameters.reduce(
        (url, parameter) =>
          url.replace(`{${parameter.name}}`, parameter.value!),
        url
      );

      const method = apiInvocationInput.httpMethod! as "GET" | "POST";

      console.log("Preparing Tado API request for: ", parameterisedUrl, method);
      const data = processTadoRequestBody(apiInvocationInput.requestBody!);
      console.log("Calling Tado API with: ", parameterisedUrl, method, data);
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
                agentId: agentInput.agentId,
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

      const finalResponse = await processResponseCompletion(
        agentInputWithTadoResponse,
        updatedResponse.completion!
      );

      if (finalResponse !== undefined) {
        return finalResponse;
      }
    }

    const chunk = chunkEvent.chunk;
    console.log(chunk);
    if (chunk !== undefined) {
      return new TextDecoder("utf-8").decode(chunk!.bytes);
    }
  }
}

function processTadoRequestBody(requestBody: { [key: string]: any }): any {
  if (requestBody === undefined) {
    return {};
  }

  const result: Record<string, any> = {};
  const properties: [] =
    requestBody["content"]["application/json"]["properties"];

  console.log("Bedrock-generated properties are: ", properties);

  properties.forEach((property) => {
    if (property["type"] === "object") {
      result[property["name"]] = JSON.parse(property["value"]);
    } else {
      result[property["name"]] = property["value"];
    }
  });

  return result;
}
