---
name: setup
description: Set up the AgentMail channel — configure API key, webhook URL, and verify the connection.
---

# AgentMail Setup

Walk the user through setting up the AgentMail channel:

1. **API key**: Check if `AGENTMAIL_API_KEY` is set in the environment. It must be an inbox-scoped key (starts with `am_us_inbox_`). If not set, direct the user to get one from https://app.agentmail.to and add it to `.env.local`.

2. **Webhook URL**: The channel listens on port 3001 by default. Help the user determine their public webhook URL:
   - For Codespaces: `https://<CODESPACE_NAME>-3001.app.github.dev/webhook`
   - For local dev with ngrok: `ngrok http 3001` then use the HTTPS URL + `/webhook`
   - For deployed servers: their public URL + `/webhook`

3. **Register the webhook**: Use the AgentMail execute tool to register the webhook URL for `message.received` events, or direct the user to the AgentMail Console.

4. **Verify**: Send a test email to the inbox and confirm the channel notification appears.
