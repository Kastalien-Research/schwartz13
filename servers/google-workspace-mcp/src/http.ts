import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Request, Response } from 'express'
import { createAuth, createClients } from './env.js'
import { createServer } from './server.js'

const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = parseInt(process.env.PORT ?? '3000', 10)

export async function startHttpServer(): Promise<void> {
    // Dynamic import to avoid top-level express resolution issues
    const { default: express } = await import('express')

    const auth = createAuth()
    const clients = createClients(auth)

    const app = express()
    app.use(express.json())

    const transports: Record<string, StreamableHTTPServerTransport> = {}

    // Ensure Accept header includes required types so the SDK's
    // StreamableHTTPServerTransport doesn't reject with 406.
    // Claude Code's HTTP client may omit this header (claude-code#33817).
    app.use('/mcp', (req: Request, _res: Response, next) => {
        const accept = req.headers['accept'] ?? ''
        if (!accept.includes('text/event-stream') || !accept.includes('application/json')) {
            req.headers['accept'] = 'application/json, text/event-stream'
        }
        next()
    })

    // OAuth discovery — tell clients no auth is required.
    app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
        res.json({ resource: `http://${HOST}:${PORT}`, authorization_servers: [] })
    })
    app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
        res.status(404).end()
    })
    app.post('/register', (_req: Request, res: Response) => {
        res.status(404).end()
    })

    app.post('/mcp', async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined

        try {
            if (sessionId && transports[sessionId]) {
                await transports[sessionId].handleRequest(req, res, req.body)
                return
            }

            if (!sessionId && isInitializeRequest(req.body)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports[sid] = transport
                    },
                })

                transport.onclose = () => {
                    const sid = transport.sessionId
                    if (sid) delete transports[sid]
                }

                const server = createServer(clients)
                await server.connect(transport)
                await transport.handleRequest(req, res, req.body)
                return
            }

            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID' },
                id: null,
            })
        } catch (error) {
            console.error('Error handling MCP request:', error)
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null,
                })
            }
        }
    })

    app.get('/mcp', async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send('Invalid or missing session ID')
            return
        }
        await transports[sessionId].handleRequest(req, res)
    })

    app.delete('/mcp', async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send('Invalid or missing session ID')
            return
        }
        await transports[sessionId].handleRequest(req, res)
    })

    app.listen(PORT, HOST, () => {
        console.log(`Google Workspace MCP server listening on http://${HOST}:${PORT}/mcp`)
    })

    process.on('SIGINT', async () => {
        for (const sid of Object.keys(transports)) {
            await transports[sid].close().catch(() => {})
            delete transports[sid]
        }
        process.exit(0)
    })
}
