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
    process.env.TADO_USERNAME!,
    process.env.TADO_PASSWORD!
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
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN!,
  },
});

export async function processPrompt(chatId: string, input: string) {
  
  const inputWithSystemPrompt = `My home id is ${process.env.HOME_ID}. ` + input;
  
  const agentInput: InvokeAgentRequest = {
    agentId: process.env.AGENT_ID!,
    agentAliasId: "TSTALIASID",
    sessionId: chatId,
    inputText: inputWithSystemPrompt,
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

      let response;
      let data;
      try {
        data = processTadoRequestBody(apiInvocationInput.requestBody!);
      } catch (error) {
        console.error("Error parsing JSON: ", error);
        response = { error: "The JSON was malformed" };
      }

      if (data !== undefined) {
        console.log(
          "Preparing Tado API request for: ",
          parameterisedUrl.replace(process.env.HOME_ID!, "<REDACTED>"),
          method,
          data
        );
  
        try {
          response = await tadoClient.apiCall(parameterisedUrl, method, data);
        } catch (error) {
          console.error("Error calling Tado API: ", error);
          console.error("Failed Tado API call details: ", parameterisedUrl, method, data
          );
          return "There was an error calling the Tado API";
        }  
      }
      
      console.debug("Tado API response: ", JSON.stringify(response));

      const agentInputWithTadoResponse: InvokeAgentRequest = {
        ...agentInput,
        sessionState: {
          returnControlInvocationResults: [
            {
              apiResult: {
                actionGroup: apiInvocationInput.actionGroup,
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
    if (chunk !== undefined) {
      return new TextDecoder("utf-8").decode(chunk!.bytes);
    }
  }
}

function processTadoRequestBody(requestBody: { [key: string]: any }): any {
  if (requestBody === undefined) {
    return {};
  }

  console.debug("Request body is: ", requestBody);

  const result: Record<string, any> = {};
  const properties: [] =
    requestBody["content"]["application/json"]["properties"];

  properties.forEach((property) => {
    if (property["type"] === "object") {
      result[property["name"]] = JSON.parse(property["value"]);
    } else {
      result[property["name"]] = property["value"];
    }
  });

  return result;
}
