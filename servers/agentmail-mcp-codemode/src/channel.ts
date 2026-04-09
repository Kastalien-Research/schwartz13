import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import express from 'express'
import { createClient } from './env.js'

const CHANNEL_PORT = parseInt(process.env.CHANNEL_PORT ?? '3001', 10)
const CHANNEL_HOST = process.env.CHANNEL_HOST ?? '127.0.0.1'
const VERBOSE = process.env.CHANNEL_VERBOSE === '1'

export function startChannel(): void {
    const client = createClient()

    const mcp = new Server(
        { name: 'agentmail-channel', version: '0.0.1' },
        {
            capabilities: {
                experimental: {
                    'claude/channel': {},
                },
                tools: {},
            },
            instructions:
                'Inbound emails arrive as <channel> notifications with attributes: event_type, from, to, subject, inbox_id, message_id, thread_id. ' +
                'Available tools: reply (respond to an email), draft_for_review (compose for human approval), approve_draft / reject_draft, ' +
                'summarize_thread (conversation digest), triage (scan inbox for threads needing attention), onboard_tenant (provision pod + inbox + webhook).',
        }
    )

    // -- Tools --

    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'reply',
                description:
                    'Reply to an email. Use inbox_id and message_id from the channel notification attributes.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox that received the email',
                        },
                        message_id: {
                            type: 'string',
                            description: 'Message to reply to',
                        },
                        text: {
                            type: 'string',
                            description: 'Plain text reply body',
                        },
                        html: {
                            type: 'string',
                            description: 'Optional HTML reply body',
                        },
                        reply_all: {
                            type: 'boolean',
                            description: 'Reply to all recipients (default false)',
                        },
                    },
                    required: ['inbox_id', 'message_id', 'text'],
                },
            },
            {
                name: 'draft_for_review',
                description:
                    'Create a draft email for human review. Returns the draft ID. Use approve_draft or reject_draft to finalize.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox to send from',
                        },
                        to: {
                            type: 'string',
                            description: 'Recipient email address',
                        },
                        subject: {
                            type: 'string',
                            description: 'Email subject',
                        },
                        text: {
                            type: 'string',
                            description: 'Plain text body',
                        },
                        html: {
                            type: 'string',
                            description: 'Optional HTML body',
                        },
                    },
                    required: ['inbox_id', 'to', 'subject', 'text'],
                },
            },
            {
                name: 'approve_draft',
                description: 'Send a previously created draft.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox the draft belongs to',
                        },
                        draft_id: {
                            type: 'string',
                            description: 'Draft ID to approve and send',
                        },
                    },
                    required: ['inbox_id', 'draft_id'],
                },
            },
            {
                name: 'reject_draft',
                description: 'Delete a draft without sending.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox the draft belongs to',
                        },
                        draft_id: {
                            type: 'string',
                            description: 'Draft ID to reject and delete',
                        },
                    },
                    required: ['inbox_id', 'draft_id'],
                },
            },
            {
                name: 'summarize_thread',
                description:
                    'Fetch a full email thread and return a structured digest with extracted content (stripped of quoted history) for each message.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox containing the thread',
                        },
                        thread_id: {
                            type: 'string',
                            description: 'Thread to summarize',
                        },
                    },
                    required: ['inbox_id', 'thread_id'],
                },
            },
            {
                name: 'triage',
                description:
                    'Scan an inbox for threads needing attention. Returns recent threads with their latest message content, labels, and metadata for classification.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        inbox_id: {
                            type: 'string',
                            description: 'Inbox to triage',
                        },
                        limit: {
                            type: 'number',
                            description:
                                'Max threads to return (default 20)',
                        },
                    },
                    required: ['inbox_id'],
                },
            },
            {
                name: 'onboard_tenant',
                description:
                    'Provision a new tenant: creates a pod, inbox, and webhook in one operation. Returns all created resource IDs.',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Tenant/customer name (used as pod name)',
                        },
                        username: {
                            type: 'string',
                            description: 'Inbox username (e.g. "support")',
                        },
                        domain: {
                            type: 'string',
                            description:
                                'Email domain (default: agentmail.to)',
                        },
                        webhook_url: {
                            type: 'string',
                            description:
                                'Webhook URL for receiving events on this tenant\'s inbox',
                        },
                        event_types: {
                            type: 'array',
                            items: { type: 'string' },
                            description:
                                'Webhook event types (default: ["message.received"])',
                        },
                    },
                    required: ['name', 'username', 'webhook_url'],
                },
            },
        ],
    }))

    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
        const args = req.params.arguments as Record<string, unknown>

        switch (req.params.name) {
            case 'reply': {
                const sent = await client.inboxes.messages.reply(
                    args.inbox_id as string,
                    args.message_id as string,
                    {
                        text: args.text as string,
                        html: args.html as string | undefined,
                        replyAll: args.reply_all as boolean | undefined,
                    }
                )
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Reply sent (message_id: ${sent.messageId})`,
                        },
                    ],
                }
            }

            case 'draft_for_review': {
                const draft = await client.inboxes.drafts.create(
                    args.inbox_id as string,
                    {
                        to: [args.to as string],
                        subject: args.subject as string,
                        text: args.text as string,
                        html: args.html as string | undefined,
                    }
                )
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    draft_id: draft.draftId,
                                    inbox_id: args.inbox_id,
                                    to: args.to,
                                    subject: args.subject,
                                    status: 'pending_review',
                                },
                                null,
                                2
                            ),
                        },
                    ],
                }
            }

            case 'approve_draft': {
                await client.inboxes.drafts.send(
                    args.inbox_id as string,
                    args.draft_id as string,
                    {}
                )
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Draft ${args.draft_id} approved and sent.`,
                        },
                    ],
                }
            }

            case 'reject_draft': {
                await client.inboxes.drafts.delete(
                    args.inbox_id as string,
                    args.draft_id as string
                )
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Draft ${args.draft_id} rejected and deleted.`,
                        },
                    ],
                }
            }

            case 'summarize_thread': {
                const thread = await client.inboxes.threads.get(
                    args.inbox_id as string,
                    args.thread_id as string
                )
                const messages = (
                    thread as unknown as {
                        messages: Array<{
                            messageId: string
                            from: string | string[]
                            to: string | string[]
                            subject?: string
                            text?: string
                            html?: string
                            extractedText?: string
                            extractedHtml?: string
                            labels?: string[]
                            createdAt?: string
                        }>
                    }
                ).messages ?? []

                const digest = messages.map((m) => ({
                    message_id: m.messageId,
                    from: m.from,
                    to: m.to,
                    subject: m.subject,
                    content:
                        m.extractedText ??
                        m.extractedHtml ??
                        m.text ??
                        m.html ??
                        '(empty)',
                    labels: m.labels,
                    date: m.createdAt,
                }))

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    thread_id: args.thread_id,
                                    message_count: digest.length,
                                    messages: digest,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                }
            }

            case 'triage': {
                const limit = (args.limit as number) ?? 20
                const threadsPage = await client.inboxes.threads.list(
                    args.inbox_id as string,
                    { limit }
                )
                const threads = (
                    threadsPage as unknown as {
                        threads: Array<{
                            threadId: string
                            subject?: string
                            labels?: string[]
                            updatedAt?: string
                            messageCount?: number
                            latestMessage?: {
                                messageId: string
                                from: string | string[]
                                text?: string
                                extractedText?: string
                                createdAt?: string
                            }
                        }>
                    }
                ).threads ?? []

                const summary = threads.map((t) => ({
                    thread_id: t.threadId,
                    subject: t.subject,
                    labels: t.labels,
                    updated_at: t.updatedAt,
                    message_count: t.messageCount,
                    latest_message: t.latestMessage
                        ? {
                              from: t.latestMessage.from,
                              content:
                                  t.latestMessage.extractedText ??
                                  t.latestMessage.text ??
                                  '(empty)',
                              date: t.latestMessage.createdAt,
                          }
                        : null,
                }))

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    inbox_id: args.inbox_id,
                                    thread_count: summary.length,
                                    threads: summary,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                }
            }

            case 'onboard_tenant': {
                const pod = await client.pods.create({
                    name: args.name as string,
                })
                const podId = (pod as unknown as { podId: string }).podId

                const inbox = await client.pods.inboxes.create(podId, {
                    username: args.username as string,
                    domain: (args.domain as string) ?? undefined,
                })

                const eventTypes = (
                    (args.event_types as string[]) ?? [
                        'message.received',
                    ]
                ) as import('agentmail').AgentMail.EventType[]

                const webhook = await client.webhooks.create({
                    url: args.webhook_url as string,
                    eventTypes,
                })

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(
                                {
                                    pod_id: podId,
                                    inbox_id: (
                                        inbox as unknown as {
                                            inboxId: string
                                        }
                                    ).inboxId,
                                    inbox_email: (
                                        inbox as unknown as { email: string }
                                    ).email,
                                    webhook_id: (
                                        webhook as unknown as {
                                            webhookId: string
                                        }
                                    ).webhookId,
                                    status: 'provisioned',
                                },
                                null,
                                2
                            ),
                        },
                    ],
                }
            }

            default:
                throw new Error(`Unknown tool: ${req.params.name}`)
        }
    })

    // -- Webhook listener --

    const app = express()
    app.use(express.json())

    app.post('/webhook', async (req, res) => {
        const body = req.body
        const eventType: string = body.event_type ?? 'unknown'

        try {
            if (eventType === 'message.received' && body.message) {
                const msg = body.message
                const from = Array.isArray(msg.from_)
                    ? msg.from_.join(', ')
                    : String(msg.from_ ?? '')
                const to = Array.isArray(msg.to)
                    ? msg.to.join(', ')
                    : String(msg.to ?? '')

                await mcp.notification({
                    method: 'notifications/claude/channel',
                    params: {
                        content:
                            msg.text ?? msg.html ?? '(no body — fetch full message)',
                        meta: {
                            event_type: eventType,
                            event_id: body.event_id,
                            inbox_id: msg.inbox_id,
                            thread_id: msg.thread_id,
                            message_id: msg.message_id,
                            from,
                            to,
                            subject: msg.subject ?? '',
                        },
                    },
                })
            } else if (VERBOSE) {
                await mcp.notification({
                    method: 'notifications/claude/channel',
                    params: {
                        content: `Event: ${eventType}`,
                        meta: {
                            event_type: eventType,
                            event_id: body.event_id,
                        },
                    },
                })
            }
        } catch (err) {
            console.error('Failed to push channel notification:', err)
        }

        res.sendStatus(200)
    })

    app.listen(CHANNEL_PORT, CHANNEL_HOST, () => {
        console.error(
            `AgentMail channel webhook listener on http://${CHANNEL_HOST}:${CHANNEL_PORT}/webhook`
        )
    })

    // -- Stdio transport --

    const transport = new StdioServerTransport()
    mcp.connect(transport).then(() => {
        console.error('AgentMail channel connected via stdio')
    })
}
