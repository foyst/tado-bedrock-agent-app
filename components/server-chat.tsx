import { Tado } from "@/lib/tado/tado";
import { Chat } from "./chat";

export async function ChatServerComponent() {
  const tadoClient = new Tado();

  try {
    await tadoClient.login(
      process.env.NEXT_PUBLIC_TADO_USERNAME!,
      process.env.NEXT_PUBLIC_TADO_PASSWORD!
    );
  } catch (error) {
    console.error("Error logging in: ", error);
  }
  const tadoTokenJson = JSON.stringify(tadoClient.accessToken!);
  // console.log("Serialized Tado token: ", tadoTokenJson);

  return (
    <>
      <Chat tadoToken={tadoTokenJson} />
    </>
  );
}

export async function processPrompt(
  chatId: string,
  input: string,
  tadoAccessToken: string
) {}
