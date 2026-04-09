import vm from 'node:vm'
import type { GoogleClients } from './env.js'

interface ExecuteResult {
    result: unknown
    logs: string[]
    isError: boolean
}

const TIMEOUT_MS = parseInt(process.env.EXECUTE_TIMEOUT_MS ?? '30000', 10)

/**
 * MIME message helpers injected into the sandbox so LLM-generated code
 * doesn't have to manually construct base64url MIME strings.
 */
const mimeHelpers = {
    /**
     * Build a base64url-encoded RFC 2822 message ready for gmail.users.messages.send().
     */
    createMimeMessage(opts: {
        to: string | string[]
        subject: string
        body: string
        from?: string
        cc?: string | string[]
        bcc?: string | string[]
        inReplyTo?: string
        references?: string
        html?: boolean
        threadId?: string
    }): string {
        const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
        const cc = opts.cc ? (Array.isArray(opts.cc) ? opts.cc.join(', ') : opts.cc) : undefined
        const bcc = opts.bcc ? (Array.isArray(opts.bcc) ? opts.bcc.join(', ') : opts.bcc) : undefined
        const contentType = opts.html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'

        let message = ''
        if (opts.from) message += `From: ${opts.from}\r\n`
        message += `To: ${to}\r\n`
        if (cc) message += `Cc: ${cc}\r\n`
        if (bcc) message += `Bcc: ${bcc}\r\n`
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
    },

    /**
     * Extract plain text body from a Gmail message response.
     */
    extractBody(message: { payload?: { parts?: Array<{ mimeType?: string; body?: { data?: string } }>; body?: { data?: string }; mimeType?: string } }): string {
        const payload = message.payload
        if (!payload) return ''

        // Simple message (no parts)
        if (payload.body?.data && payload.mimeType === 'text/plain') {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8')
        }

        // Multipart — find text/plain
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8')
                }
            }
            // Fallback to text/html
            for (const part of payload.parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8')
                }
            }
        }

        return ''
    },

    /**
     * Extract a header value from a Gmail message response.
     */
    getHeader(message: { payload?: { headers?: Array<{ name?: string; value?: string }> } }, name: string): string {
        return message.payload?.headers?.find(
            (h) => h.name?.toLowerCase() === name.toLowerCase()
        )?.value ?? ''
    },
}

export async function executeCode(
    code: string,
    clients: GoogleClients
): Promise<ExecuteResult> {
    const logs: string[] = []
    const capture = (...args: unknown[]) => logs.push(args.map(String).join(' '))

    const sandbox = {
        google: clients,
        helpers: mimeHelpers,
        console: { log: capture, error: capture, warn: capture },
        JSON,
        Date,
        Math,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Buffer,
        URL,
        URLSearchParams,
        Promise,
        setTimeout,
        clearTimeout,
    }

    const wrapped = `(async () => { ${code} })()`

    try {
        const script = new vm.Script(wrapped, { filename: 'execute.js' })
        const ctx = vm.createContext(sandbox)
        const promise = script.runInContext(ctx, { timeout: TIMEOUT_MS })
        const result = await promise
        return { result, logs, isError: false }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { result: message, logs, isError: true }
    }
}
