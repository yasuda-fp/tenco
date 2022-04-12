import { Application, Router } from "https://deno.land/x/oak@v10.5.1/mod.ts";
import { VERIFICATION_TOKEN } from "./env.ts";
import {
  APIError,
  getConversationsMembers,
  getMessage,
  getMyId,
  getUsersList,
  openView,
  postChatMessage,
  updateChatMessage,
} from "./api.ts";

function createAttendanceMessageBlocks(ids: string[]): unknown {
  const blocks = [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ids.length > 0
          ? `点呼を取ります。スタンプをつけてください\n${ids.map((id) => `<@${id}>`).join(" ")}`
          : "全員出席 :tada:",
      },
    },
  ];
  return blocks;
}

function createModalView(channel: string, members: string[]): unknown {
  return {
    "type": "modal",
    "callback_id": "MEMBER_SELECTION_MODAL",
    "private_metadata": channel,
    "title": {
      "type": "plain_text",
      "text": "点呼とるやつ",
    },
    "submit": {
      "type": "plain_text",
      "text": "Submit",
    },
    "close": {
      "type": "plain_text",
      "text": "Cancel",
    },
    "blocks": [
      {
        "type": "input",
        "block_id": "multi_users_select_block",
        "element": {
          "type": "multi_users_select",
          "action_id": "multi_users_select_action",
          "initial_users": members,
        },
        "label": {
          "type": "plain_text",
          "text": "参加者(メンションが飛びます)",
        },
      },
    ],
  };
}

async function getHumanMembers(channel: string): Promise<string[]> {
  const members = await getConversationsMembers(channel);
  const allUsers = await getUsersList();
  const humans = new Set(allUsers.filter((m) => !m.is_bot).map((m) => m.id));
  return members.filter((id) => humans.has(id));
}

async function inChannel(channel: string): Promise<boolean> {
  const members = await getConversationsMembers(channel);
  const myId = await getMyId();
  return members.includes(myId);
}

async function extractMentionsInMessage(
  channel: string,
  timestamp: string,
): Promise<string[]> {
  const msg = await getMessage(channel, timestamp);
  const text = msg.blocks[0].text.text;
  const pat = /<@([0-9A-Z]+)>/g;
  return [...text.matchAll(pat)].map((m) => m[1]);
}

function setup() {
  const router = new Router();

  router.get("/", (ctx) => {
    ctx.response.body = "bot is ready";
  });

  router.post("/commands/tenco", async (ctx) => {
    const { type, value } = ctx.request.body({ type: "form" });
    if (type !== "form") {
      ctx.response.status = 400;
      ctx.response.body = "Unexpected Body";
      return;
    }
    const params = await value;
    if (params.get("token") !== VERIFICATION_TOKEN) {
      ctx.response.status = 403;
      ctx.response.body = "Forbidden";
      return;
    }
    const trigger = params.get("trigger_id");
    const channel = params.get("channel_id");
    if (trigger == null || channel == null) {
      ctx.response.status = 400;
      ctx.response.body = "Invalid Parameters";
      return;
    }

    if (!await inChannel(channel)) {
      console.info();
      ctx.response.status = 200;
      ctx.response.body = "「点呼するやつ」がチャンネルに参加していません";
      return;
    }

    const members = await getHumanMembers(channel);
    const view = createModalView(channel, members);
    await openView(trigger, view);
    ctx.response.status = 200;
  });

  router.post("/interactivities", async (ctx) => {
    const { type, value } = ctx.request.body({ type: "form" });
    if (type !== "form") {
      ctx.response.status = 400;
      ctx.response.body = "Unexpected Body";
      return;
    }
    const params: URLSearchParams = await value;
    const payload = JSON.parse(params.get("payload") as string);
    if (payload == null) {
      ctx.response.status = 400;
      ctx.response.body = "Invalid Body";
      return;
    }
    if (payload.token !== VERIFICATION_TOKEN) {
      ctx.response.status = 403;
      ctx.response.body = "Forbidden";
      return;
    }
    if (payload.type !== "view_submission") {
      console.warn(`unknown interactivity type: ${payload.type}`);
      ctx.response.status = 400;
      ctx.response.body = "Unknown Interactivity Type";
      return;
    }
    const channel = payload?.view?.private_metadata;
    const members = payload
      ?.view
      ?.state
      ?.values
      ?.multi_users_select_block
      ?.multi_users_select_action
      ?.selected_users;
    if (channel == null || members == null) {
      console.warn(`invalid state of view: ${JSON.stringify(payload?.view)}`);
      ctx.response.status = 400;
      ctx.response.body = "Invalid State of View";
      return;
    }
    const blocks = createAttendanceMessageBlocks(members);
    console.debug(
      `post message to channel '${channel}': ${JSON.stringify(blocks)}`,
    );
    await postChatMessage(channel, blocks);
    ctx.response.status = 200;
  });

  router.post("/events", async (ctx) => {
    const { type, value } = ctx.request.body({ type: "json" });
    if (type !== "json") {
      ctx.response.status = 400;
      ctx.response.body = "Unexpected Body";
      return;
    }
    const payload = await value;
    if (payload.token !== VERIFICATION_TOKEN) {
      ctx.response.status = 403;
      ctx.response.body = "Forbidden";
      return;
    }
    if (payload.type === "url_verification") {
      console.info("url verfication");
      ctx.response.status = 200;
      ctx.response.body = payload.challenge;
      return;
    }
    if (payload.type !== "event_callback") {
      console.warn(`unknown event type: ${payload.type}`);
      ctx.response.status = 400;
      ctx.response.body = "Unknown Payload Type";
      return;
    }

    const event = payload.event;
    console.info(`receive event: ${JSON.stringify(event)}`);

    const channel = event?.item.channel;
    const timestamp = event?.item.ts;
    const itemUser = event?.item_user;
    const reactUser = event?.user;

    if (
      channel == null || timestamp == null || itemUser == null ||
      reactUser == null
    ) {
      ctx.response.status = 400;
      ctx.response.body = "Invalid Body";
      return;
    }

    const myId = await getMyId();
    if (itemUser !== myId) {
      ctx.response.status = 200;
      console.debug("ignore uninterested reaction");
      return;
    }

    const members = await extractMentionsInMessage(channel, timestamp);
    console.debug(`extract mentions from message: ${JSON.stringify(members)}`);

    const blocks = createAttendanceMessageBlocks(
      members.filter((id) => id !== reactUser),
    );
    console.debug(
      `update message in channel '${channel}': ${JSON.stringify(blocks)}`,
    );
    await updateChatMessage(channel, timestamp, blocks);
    ctx.response.status = 200;
  });

  const app = new Application();

  app.use(async (ctx, next) => {
    await next();
    const rt = ctx.response.headers.get("X-Response-Time");
    console.debug(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
  });

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.response.headers.set("X-Response-Time", `${ms}ms`);
  });

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      if (e instanceof APIError) {
        ctx.response.status = 500;
        ctx.response.body = "Slack API Error";
        console.error(`${e}`);
        if (e.params != null) {
          console.error(`${e.method} with ${JSON.stringify(e.params)}`);
        } else {
          console.error(`${e.method}`);
        }
        return;
      } else {
        ctx.response.status = 500;
        ctx.response.body = "Internal Server Error";
        if (e instanceof Error) {
          console.error(e.stack);
        }
        return;
      }
    }
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  app.addEventListener(
    "listen",
    () => console.info("Listening on http://localhost:8080"),
  );
  return app.listen({ port: 8080 });
}

await setup();
