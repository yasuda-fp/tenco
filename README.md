# tenco

## Usage

```
$ deno run --allow-env --allow-net --allow-read=.env,.env.defaults server.ts
```

## Entry Points

| Path             | Description                     |
| ---------------- | ------------------------------- |
| /                | health check                    |
| /interactivities | Interactivity Request URL       |
| /commands/tenco  | Slash Command Request URL       |
| /events          | Event Subscriptions Request URL |

## Environment Variables

- BOT_USER_OAUTH_TOKEN
- VERIFICATION_TOKEN

## Slack API Settings

### Required Bot Token Scopes

- `channels:history`
- `channels:read`
- `chat:write`
- `users:read`
- `commands`

### Requied Subscription of Events on behalf of Users

- `reaction_added`
