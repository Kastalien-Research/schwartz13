import { z } from 'zod'
import { AgentMailClient } from 'agentmail'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { searchCatalog } from './catalog.js'
import { executeCode } from './sandbox.js'

export function createServer(client: AgentMailClient): McpServer {
    const server = new McpServer({ name: 'AgentMail', version: '0.2.2' })

    server.registerTool(
        'search',
        {
            description:
                'Search available AgentMail operations. Returns tool names, descriptions, and optionally parameter schemas. Use this to discover what operations are available before writing code for the execute tool.',
            inputSchema: {
                query: z
                    .string()
                    .optional()
                    .describe(
                        'Search query to filter operations by name or description'
                    ),
                detail: z
                    .enum(['brief', 'detailed'])
                    .optional()
                    .default('brief')
                    .describe(
                        '"brief" returns names and descriptions, "detailed" includes parameter schemas'
                    ),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ query, detail }) => {
            const result = searchCatalog(query, detail)
            return {
                content: [
                    { type: 'text' as const, text: JSON.stringify(result, null, 2) },
                ],
            }
        }
    )

    server.registerTool(
        'execute',
        {
            description: `Execute JavaScript code against the AgentMail API. An authenticated \`agentmail\` client (AgentMailClient) is available in scope. Write async code — use \`return\` to provide the result.

Available client methods:
- agentmail.inboxes.list({ limit?, pageToken? }) — List inboxes
- agentmail.inboxes.get(inboxId) — Get inbox details
- agentmail.inboxes.create({ username?, domain?, displayName? }) — Create inbox
- agentmail.inboxes.delete(inboxId) — Delete inbox
- agentmail.inboxes.threads.list(inboxId, { limit?, pageToken?, labels?, before?, after? }) — List threads
- agentmail.inboxes.threads.get(inboxId, threadId) — Get thread with messages
- agentmail.threads.getAttachment(threadId, attachmentId) — Get attachment
- agentmail.inboxes.messages.send(inboxId, { to, cc?, bcc?, subject?, text?, html?, labels?, attachments? }) — Send message
- agentmail.inboxes.messages.reply(inboxId, messageId, { text?, html?, replyAll?, labels?, attachments? }) — Reply to message
- agentmail.inboxes.messages.forward(inboxId, messageId, { to, cc?, bcc?, subject?, text?, html?, labels?, attachments? }) — Forward message
- agentmail.inboxes.messages.update(inboxId, messageId, { addLabels?, removeLabels? }) — Update message labels

Use console.log() for debugging — output is captured and returned.`,
            inputSchema: {
                code: z
                    .string()
                    .describe(
                        'JavaScript code to execute. An authenticated agentmail client is available in scope.'
                    ),
            },
        },
        async ({ code }) => {
            const { result, logs, isError } = await executeCode(code, client)
            const parts: { type: 'text'; text: string }[] = []
            if (logs.length > 0) {
                parts.push({
                    type: 'text' as const,
                    text: `--- Logs ---\n${logs.join('\n')}`,
                })
            }
            parts.push({
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
            })
            return { content: parts, isError }
        }
    )

    return server
}
