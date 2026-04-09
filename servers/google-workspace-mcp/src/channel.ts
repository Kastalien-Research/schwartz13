import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import express from 'express'
import { createAuth, createClients, type GoogleClients } from './env.js'

const CHANNEL_PORT = parseInt(process.env.CHANNEL_PORT ?? '3001', 10)
const CHANNEL_HOST = process.env.CHANNEL_HOST ?? '127.0.0.1'
const VERBOSE = process.env.CHANNEL_VERBOSE === '1'

// --- MIME helpers (duplicated from sandbox for channel tool use) ---

function createMimeMessage(opts: {
    to: string
    subject: string
    body: string
    from?: string
    cc?: string
    bcc?: string
    inReplyTo?: string
    references?: string
    html?: boolean
}): string {
    const contentType = opts.html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'
    let message = ''
    if (opts.from) message += `From: ${opts.from}\r\n`
    message += `To: ${opts.to}\r\n`
    if (opts.cc) message += `Cc: ${opts.cc}\r\n`
    if (opts.bcc) message += `Bcc: ${opts.bcc}\r\n`
    message += `Subject: ${opts.subject}\r\n`
    if (opts.inReplyTo) message += `In-Reply-To: ${opts.inReplyTo}\r\n`
    if (opts.references) message += `References: ${opts.references}\r\n`
    message += `Content-Type: ${contentType}\r\n`
    message += `\r\n${opts.body}`

    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function extractBody(message: Record<string, unknown>): string {
    const payload = message.payload as Record<string, unknown> | undefined
    if (!payload) return ''
    const body = payload.body as Record<string, unknown> | undefined
    const parts = payload.parts as Array<Record<string, unknown>> | undefined

    if (body?.data && payload.mimeType === 'text/plain') {
        return Buffer.from(body.data as string, 'base64').toString('utf-8')
    }
    if (parts) {
        for (const part of parts) {
            const partBody = part.body as Record<string, unknown> | undefined
            if (part.mimeType === 'text/plain' && partBody?.data) {
                return Buffer.from(partBody.data as string, 'base64').toString('utf-8')
            }
        }
        for (const part of parts) {
            const partBody = part.body as Record<string, unknown> | undefined
            if (part.mimeType === 'text/html' && partBody?.data) {
                return Buffer.from(partBody.data as string, 'base64').toString('utf-8')
            }
        }
    }
    return ''
}

function getHeader(message: Record<string, unknown>, name: string): string {
    const payload = message.payload as Record<string, unknown> | undefined
    const headers = payload?.headers as Array<{ name?: string; value?: string }> | undefined
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// --- Dedup cache ---
// Tracks message_ids we've already pushed as channel notifications.
// Entries expire after DEDUP_TTL_MS to avoid unbounded growth.
const DEDUP_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const seenMessages = new Map<string, number>() // message_id → timestamp

function isDuplicate(messageId: string): boolean {
    const now = Date.now()
    // Prune stale entries periodically (every 100 checks)
    if (seenMessages.size > 0 && seenMessages.size % 100 === 0) {
        for (const [id, ts] of seenMessages) {
            if (now - ts > DEDUP_TTL_MS) seenMessages.delete(id)
        }
    }
    if (seenMessages.has(messageId)) return true
    seenMessages.set(messageId, now)
    return false
}

// --- Channel ---

export function startChannel(): void {
    const auth = createAuth()
    const clients = createClients(auth)
    const { gmail } = clients

    let lastHistoryId: string | undefined

    const mcp = new Server(
        { name: 'google-workspace-channel', version: '0.1.0' },
        {
            capabilities: {
                experimental: {
                    'claude/channel': {},
                },
                tools: {},
            },
            instructions:
                'Inbound Gmail messages arrive as <channel> notifications with attributes: event_type, from, to, subject, thread_id, message_id. ' +
                'Available tools: reply (respond to an email), draft_for_review (compose for human approval), approve_draft / reject_draft, ' +
                'summarize_thread (conversation digest), triage (scan inbox for threads needing attention).',
        }
    )

    // -- Tools --

    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'reply',
                description: 'Reply to a Gmail message. Uses thread_id and message_id from the channel notification.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        thread_id: { type: 'string', description: 'Thread to reply in' },
                        message_id: { type: 'string', description: 'Message to reply to (for In-Reply-To header)' },
                        text: { type: 'string', description: 'Plain text reply body' },
                        html: { type: 'string', description: 'Optional HTML reply body' },
                    },
                    required: ['thread_id', 'message_id', 'text'],
                },
            },
            {
                name: 'draft_for_review',
                description: 'Create a Gmail draft for human review. Returns draft ID. Use approve_draft or reject_draft to finalize.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        to: { type: 'string', description: 'Recipient email address' },
                        subject: { type: 'string', description: 'Email subject' },
                        text: { type: 'string', description: 'Plain text body' },
                        html: { type: 'string', description: 'Optional HTML body' },
                    },
                    required: ['to', 'subject', 'text'],
                },
            },
            {
                name: 'approve_draft',
                description: 'Send a previously created Gmail draft.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        draft_id: { type: 'string', description: 'Draft ID to approve and send' },
                    },
                    required: ['draft_id'],
                },
            },
            {
                name: 'reject_draft',
                description: 'Delete a Gmail draft without sending.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        draft_id: { type: 'string', description: 'Draft ID to reject and delete' },
                    },
                    required: ['draft_id'],
                },
            },
            {
                name: 'summarize_thread',
                description: 'Fetch a full Gmail thread and return a structured digest with each message\'s sender, subject, and body.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        thread_id: { type: 'string', description: 'Thread to summarize' },
                    },
                    required: ['thread_id'],
                },
            },
            {
                name: 'triage',
                description: 'Scan inbox for unread threads needing attention. Returns recent unread messages with sender, subject, and snippet.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        max_results: { type: 'number', description: 'Max messages to return (default 20)' },
                        query: { type: 'string', description: 'Optional Gmail search query to narrow results' },
                    },
                },
            },
        ],
    }))

    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
        const args = req.params.arguments as Record<string, unknown>

        switch (req.params.name) {
            case 'reply': {
                // Fetch the original message to get headers for threading
                const original = await gmail.users.messages.get({
                    userId: 'me',
                    id: args.message_id as string,
                    format: 'metadata',
                    metadataHeaders: ['From', 'To', 'Subject', 'Message-ID'],
                })
                const origData = original.data as Record<string, unknown>
                const origFrom = getHeader(origData, 'From')
                const origMessageId = getHeader(origData, 'Message-ID')
                const origSubject = getHeader(origData, 'Subject')

                const raw = createMimeMessage({
                    to: origFrom,
                    subject: origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`,
                    body: args.text as string,
                    html: args.html !== undefined,
                    inReplyTo: origMessageId,
                    references: origMessageId,
                })

                const sent = await gmail.users.messages.send({
                    userId: 'me',
                    requestBody: { raw, threadId: args.thread_id as string },
                })

                return {
                    content: [{ type: 'text' as const, text: `Reply sent (message_id: ${sent.data.id})` }],
                }
            }

            case 'draft_for_review': {
                const raw = createMimeMessage({
                    to: args.to as string,
                    subject: args.subject as string,
                    body: args.html ? (args.html as string) : (args.text as string),
                    html: !!args.html,
                })

                const draft = await gmail.users.drafts.create({
                    userId: 'me',
                    requestBody: { message: { raw } },
                })

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            draft_id: draft.data.id,
                            to: args.to,
                            subject: args.subject,
                            status: 'pending_review',
                        }, null, 2),
                    }],
                }
            }

            case 'approve_draft': {
                const sent = await gmail.users.drafts.send({
                    userId: 'me',
                    requestBody: { id: args.draft_id as string },
                })
                return {
                    content: [{ type: 'text' as const, text: `Draft ${args.draft_id} approved and sent (message_id: ${sent.data.id}).` }],
                }
            }

            case 'reject_draft': {
                await gmail.users.drafts.delete({
                    userId: 'me',
                    id: args.draft_id as string,
                })
                return {
                    content: [{ type: 'text' as const, text: `Draft ${args.draft_id} rejected and deleted.` }],
                }
            }

            case 'summarize_thread': {
                const thread = await gmail.users.threads.get({
                    userId: 'me',
                    id: args.thread_id as string,
                    format: 'full',
                })
                const messages = (thread.data.messages ?? []) as Array<Record<string, unknown>>

                const digest = messages.map((m) => ({
                    message_id: m.id,
                    from: getHeader(m, 'From'),
                    to: getHeader(m, 'To'),
                    subject: getHeader(m, 'Subject'),
                    date: getHeader(m, 'Date'),
                    body: extractBody(m),
                }))

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            thread_id: args.thread_id,
                            message_count: digest.length,
                            messages: digest,
                        }, null, 2),
                    }],
                }
            }

            case 'triage': {
                const maxResults = (args.max_results as number) ?? 20
                const q = (args.query as string) ?? 'is:unread'

                const list = await gmail.users.messages.list({
                    userId: 'me',
                    q,
                    maxResults,
                })
                const messageRefs = list.data.messages ?? []

                const summaries = await Promise.all(
                    messageRefs.slice(0, maxResults).map(async (ref) => {
                        const msg = await gmail.users.messages.get({
                            userId: 'me',
                            id: ref.id!,
                            format: 'metadata',
                            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
                        })
                        const data = msg.data as Record<string, unknown>
                        return {
                            message_id: ref.id,
                            thread_id: ref.threadId,
                            from: getHeader(data, 'From'),
                            subject: getHeader(data, 'Subject'),
                            date: getHeader(data, 'Date'),
                            snippet: (data.snippet as string) ?? '',
                        }
                    })
                )

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            query: q,
                            count: summaries.length,
                            messages: summaries,
                        }, null, 2),
                    }],
                }
            }

            default:
                throw new Error(`Unknown tool: ${req.params.name}`)
        }
    })

    // -- Webhook listener for Gmail Pub/Sub push notifications --

    const app = express()
    app.use(express.json())

    app.post('/webhook', async (req, res) => {
        try {
            const body = req.body

            // Google Pub/Sub wraps the notification in message.data (base64)
            const pubsubMessage = body.message?.data
            if (!pubsubMessage) {
                if (VERBOSE) console.error('Webhook received non-Pub/Sub payload:', JSON.stringify(body).slice(0, 200))
                res.sendStatus(200)
                return
            }

            const decoded = JSON.parse(
                Buffer.from(pubsubMessage, 'base64').toString('utf-8')
            ) as { emailAddress?: string; historyId?: string }

            if (!decoded.historyId) {
                res.sendStatus(200)
                return
            }

            // Fetch changes since last known historyId
            const prevHistoryId = lastHistoryId
            lastHistoryId = decoded.historyId // Update BEFORE processing to prevent duplicate Pub/Sub reprocessing
            if (prevHistoryId) {
                await processHistoryChanges(clients, mcp, prevHistoryId)
            }

            res.sendStatus(200)
        } catch (err) {
            console.error('Webhook handler error:', err)
            res.sendStatus(200) // Always ACK to prevent Pub/Sub retries
        }
    })

    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', lastHistoryId })
    })

    app.listen(CHANNEL_PORT, CHANNEL_HOST, () => {
        console.error(
            `Google Workspace channel webhook listener on http://${CHANNEL_HOST}:${CHANNEL_PORT}/webhook`
        )
    })

    // -- Setup Gmail watch on startup (if Pub/Sub topic configured) --
    const pubsubTopic = process.env.GOOGLE_PUBSUB_TOPIC
    if (pubsubTopic) {
        gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: pubsubTopic,
                labelIds: ['INBOX'],
            },
        }).then((res) => {
            lastHistoryId = String(res.data.historyId)
            console.error(`Gmail watch registered. historyId: ${lastHistoryId}`)
        }).catch((err) => {
            console.error('Failed to register Gmail watch (Pub/Sub push). Inbound notifications will not work:', err.message)
            console.error('Set GOOGLE_PUBSUB_TOPIC to a valid topic or use polling mode.')
        })
    } else {
        console.error('GOOGLE_PUBSUB_TOPIC not set — starting polling mode for new messages.')
        startPolling(clients, mcp)
    }

    // -- Stdio transport --
    const transport = new StdioServerTransport()
    mcp.connect(transport).then(() => {
        console.error('Google Workspace channel connected via stdio')
    })
}

/**
 * Process Gmail history changes and push new inbound messages as channel notifications.
 */
async function processHistoryChanges(
    clients: GoogleClients,
    mcp: Server,
    startHistoryId: string
): Promise<void> {
    try {
        const history = await clients.gmail.users.history.list({
            userId: 'me',
            startHistoryId,
            historyTypes: ['messageAdded'],
        })

        const records = history.data.history ?? []
        for (const record of records) {
            const added = record.messagesAdded ?? []
            for (const item of added) {
                const msgId = item.message?.id
                const labels = item.message?.labelIds ?? []

                // Only notify for INBOX messages (skip sent, drafts, etc.)
                if (!msgId || !labels.includes('INBOX')) continue
                if (isDuplicate(msgId)) continue

                try {
                    const msg = await clients.gmail.users.messages.get({
                        userId: 'me',
                        id: msgId,
                        format: 'full',
                    })
                    const data = msg.data as Record<string, unknown>
                    const from = getHeader(data, 'From')
                    const to = getHeader(data, 'To')
                    const subject = getHeader(data, 'Subject')
                    const body = extractBody(data)

                    await mcp.notification({
                        method: 'notifications/claude/channel',
                        params: {
                            content: body || '(no body)',
                            meta: {
                                event_type: 'message.received',
                                message_id: msgId,
                                thread_id: (data.threadId as string) ?? '',
                                from,
                                to,
                                subject,
                            },
                        },
                    })
                } catch (err) {
                    console.error(`Failed to fetch/push message ${msgId}:`, err)
                }
            }
        }
    } catch (err) {
        console.error('Failed to process history changes:', err)
    }
}

/**
 * Fallback polling mode: check for new messages every 30s when Pub/Sub is not configured.
 */
function startPolling(clients: GoogleClients, mcp: Server): void {
    let lastCheck = new Date().toISOString()

    const poll = async () => {
        try {
            const list = await clients.gmail.users.messages.list({
                userId: 'me',
                q: `is:unread after:${Math.floor(new Date(lastCheck).getTime() / 1000)}`,
                maxResults: 10,
            })
            lastCheck = new Date().toISOString()

            const messages = list.data.messages ?? []
            for (const ref of messages) {
                if (ref.id && isDuplicate(ref.id)) continue
                try {
                    const msg = await clients.gmail.users.messages.get({
                        userId: 'me',
                        id: ref.id!,
                        format: 'full',
                    })
                    const data = msg.data as Record<string, unknown>
                    const from = getHeader(data, 'From')
                    const to = getHeader(data, 'To')
                    const subject = getHeader(data, 'Subject')
                    const body = extractBody(data)

                    await mcp.notification({
                        method: 'notifications/claude/channel',
                        params: {
                            content: body || '(no body)',
                            meta: {
                                event_type: 'message.received',
                                message_id: ref.id ?? '',
                                thread_id: ref.threadId ?? '',
                                from,
                                to,
                                subject,
                            },
                        },
                    })
                } catch (err) {
                    console.error(`Failed to fetch/push polled message ${ref.id}:`, err)
                }
            }
        } catch (err) {
            console.error('Polling error:', err)
        }
    }

    setInterval(poll, 30_000)
    console.error('Polling for new Gmail messages every 30s')
}
