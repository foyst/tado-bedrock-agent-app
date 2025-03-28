"use server";

import { Chat } from "./chat";
import {
  ApiInvocationInput,
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
    agentAliasId: "TSTALIASID", // Test alias ID allows for testing without creating a new alias
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

/**
 * Controls the interaction between the agent and the Tado API.
 * 
 * @param agentInput - The input request for invoking the agent.
 * @param chunks - An asynchronous iterable of response stream chunks.
 * @returns A promise that resolves to a string containing the final response or undefined.
 * 
 * This function performs the following steps:
 * 1. Takes the agent returnControl invocation inputs and constructs the Tado API request.
 * 2. Sends the Tado API request
 * 3. Sends the response back to the agent.
 * 4. If necessary, recursively calls this function with additional API calls to make
 */
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
      const tadoRequestHttpMethod = apiInvocationInput.httpMethod! as "GET" | "POST";

      apiParameters.unshift({
        name: "homeId",
        value: process.env.HOME_ID!,
      });

      const tadoRequestParameterisedUrl = apiParameters.reduce(
        (url, parameter) =>
          url.replace(`{${parameter.name}}`, parameter.value!),
        url
      );

      let tadoResponse;
      let tadoRequestBody;
      try {
        tadoRequestBody = processTadoRequestBody(apiInvocationInput.requestBody!);
      } catch (error) {
        console.error("Error parsing JSON: ", error);
        // We fake a response from Tado, telling the agent that the JSON was malformed
        tadoResponse = { error: "The JSON was malformed" };
      }

      if (tadoRequestBody !== undefined) {
        try {
          tadoResponse = await makeTadoApiCall(tadoRequestParameterisedUrl, tadoRequestHttpMethod, tadoRequestBody)
        } catch (error) {
          return "There was an error calling the Tado API";
        }
      }

      const postTadoAgentResponse: InvokeAgentRequest =
        createPostTadoAgentResponse(agentInput, apiInvocationInput, tadoResponse, chunkEvent);

      const command = new InvokeAgentCommand(postTadoAgentResponse);
      const updatedResponse = await bedrockClient.send(command);

      const finalResponse = await processResponseCompletion(
        postTadoAgentResponse,
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

async function makeTadoApiCall(
  url: string,
  method: "GET" | "POST",
  requestBody: Record<string, any>
) {
  console.log(
    "Preparing Tado API request for: ",
    url.replace(process.env.HOME_ID!, "<REDACTED>"),
    method,
    requestBody
  );

  try {
    const tadoResponse = await tadoClient.apiCall(url, method, requestBody);
    console.debug("Tado API response: ", JSON.stringify(tadoResponse));
    return tadoResponse;
  } catch (error) {
    console.error("Error calling Tado API: ", error);
    console.error("Failed Tado API call details: ", url, method, requestBody
    );
    throw error;
  }
}

function createPostTadoAgentResponse(agentInput: InvokeAgentRequest,
  apiInvocationInput: ApiInvocationInput,
  tadoResponse: any,
  chunkEvent: ResponseStream.ReturnControlMember): InvokeAgentRequest {
  return {
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
                body: JSON.stringify(tadoResponse),
              },
            },
          },
        },
      ],
      invocationId: chunkEvent.returnControl.invocationId,
    },
  };
}