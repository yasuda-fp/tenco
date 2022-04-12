import { BOT_USER_OAUTH_TOKEN } from "./env.ts";

export class APIError extends Error {
  constructor(msg: string, public method: string, public params?: unknown) {
    super(msg);
  }
}

// deno-lint-ignore no-explicit-any
async function fetchGetAPI<T = any>(
  method: string,
  query?: Record<string, string>,
): Promise<T> {
  const res = await fetch(
    `https://slack.com/api/${method}${
      query ? `?${new URLSearchParams(query)}` : ""
    }`,
    { headers: { authorization: `Bearer ${BOT_USER_OAUTH_TOKEN}` } },
  );
  if (!res.ok) {
    throw new APIError(`request error: ${await res.text()}`, method);
  }
  const data = await res.json();
  if (!data.ok) {
    console.error(data);
    throw new APIError(`execution error: ${data.error}`, method);
  }
  return data as T;
}

// deno-lint-ignore no-explicit-any
async function fetchPostAPI<T = any>(
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${BOT_USER_OAUTH_TOKEN}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    throw new APIError(`request error: ${await res.text()}`, method);
  }
  const data = await res.json();
  if (!data.ok) {
    console.error(data);
    throw new APIError(`execution error: ${data.error}`, method);
  }
  return data as T;
}

export type Member = {
  id: string;
  profile: { display_name: string };
  is_bot: boolean;
};

// scope: users:read
export async function getUsersList(): Promise<Member[]> {
  const data = await fetchGetAPI("users.list");
  return data.members;
}

// scope: channels:read
export async function getConversationsMembers(
  channel: string,
): Promise<string[]> {
  const data = await fetchGetAPI("conversations.members", { channel });
  return data.members;
}

// scope: chat:write
export async function postChatMessage(channel: string, blocks: unknown) {
  await fetchPostAPI("chat.postMessage", { channel, blocks });
}

// scope: chat:write
export async function updateChatMessage(
  channel: string,
  timestamp: string,
  blocks: unknown,
) {
  await fetchPostAPI("chat.update", { channel, ts: timestamp, blocks });
}

// no scope required
export async function openView(trigger: string, view: unknown) {
  await fetchPostAPI("views.open", { trigger_id: trigger, view });
}

// no scope required
export async function getMyId(): Promise<string> {
  const data = await fetchGetAPI("auth.test");
  return data.user_id;
}

export type Message = {
  blocks: [
    {
      text: {
        text: string;
      };
    },
  ];
};

// scope: channels:history
export async function getMessage(
  channel: string,
  timestamp: string,
): Promise<Message> {
  const data = await fetchGetAPI("conversations.history", {
    channel,
    latest: timestamp,
    limit: "1",
    inclusive: "true",
  });
  return data.messages[0];
}
