import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GoogleClients } from './env.js'
import { searchCatalog } from './catalog.js'
import { executeCode } from './sandbox.js'

export function createServer(clients: GoogleClients): McpServer {
    const server = new McpServer({ name: 'GoogleWorkspace', version: '0.1.0' })

    server.registerTool(
        'google_workspace_search',
        {
            description:
                'Search available Google Workspace operations. Returns operation names, descriptions, and optionally usage examples. Use this to discover what operations are available before writing code for the google_workspace_execute tool.',
            inputSchema: {
                query: z
                    .string()
                    .optional()
                    .describe(
                        'Search query to filter by operation name, service, or description (e.g. "gmail send", "calendar", "drive")'
                    ),
                detail: z
                    .enum(['brief', 'detailed'])
                    .optional()
                    .default('brief')
                    .describe(
                        '"brief" returns names and descriptions, "detailed" includes usage examples'
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
        'google_workspace_execute',
        {
            description: `Execute JavaScript code against Google Workspace APIs. Authenticated service clients and helpers are available in scope. Write async code — use \`return\` to provide the result.

Available via \`google\` object:
- google.gmail.users.messages.list({ userId: "me", q?, maxResults? })
- google.gmail.users.messages.get({ userId: "me", id, format? })
- google.gmail.users.messages.send({ userId: "me", requestBody: { raw, threadId? } })
- google.gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } })
- google.gmail.users.drafts.send({ userId: "me", requestBody: { id: draftId } })
- google.gmail.users.threads.get({ userId: "me", id, format? })
- google.gmail.users.labels.list({ userId: "me" })
- google.calendar.events.list({ calendarId: "primary", timeMin?, timeMax?, maxResults? })
- google.calendar.events.insert({ calendarId: "primary", requestBody: { summary, start, end } })
- google.drive.files.list({ q?, pageSize?, fields? })
- google.drive.files.get({ fileId, fields? })
- google.docs.documents.get({ documentId })
- google.sheets.spreadsheets.values.get({ spreadsheetId, range })
- google.sheets.spreadsheets.values.update({ spreadsheetId, range, valueInputOption, requestBody })
- google.tasks.tasks.list({ tasklist })

Available via \`helpers\` object:
- helpers.createMimeMessage({ to, subject, body, from?, cc?, bcc?, html?, inReplyTo?, references? }) → base64url raw string
- helpers.extractBody(message) → plain text body from Gmail message response
- helpers.getHeader(message, name) → extract header value (e.g. "From", "Subject", "Message-ID")

All API calls return { data } — access results via \`res.data\`. Use console.log() for debugging.`,
            inputSchema: {
                code: z
                    .string()
                    .describe(
                        'JavaScript code to execute. Authenticated Google API clients are available via the `google` object.'
                    ),
            },
        },
        async ({ code }) => {
            const { result, logs, isError } = await executeCode(code, clients)
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
