import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AgentMailClient } from 'agentmail'

/**
 * Loads variables from .env.local into process.env (does not override existing vars).
 */
export function loadEnv(): void {
    try {
        const envPath = resolve(process.cwd(), '.env.local')
        const content = readFileSync(envPath, 'utf-8')
        for (const line of content.split('\n')) {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/)
            if (match && !process.env[match[1]]) {
                process.env[match[1]] = match[2].trim()
            }
        }
    } catch {
        // .env.local not found — rely on process.env
    }
}

/**
 * Returns the API key from AGENTMAIL_API_KEY env var.
 * Warns if the key is not inbox-scoped (send/reply will fail).
 * Exits if no key is found.
 */
export function getApiKey(): string {
    const key = process.env.AGENTMAIL_API_KEY
    if (!key) {
        console.error(
            'AGENTMAIL_API_KEY is not set. Add it to .env.local or export it in your shell.'
        )
        process.exit(1)
    }
    if (!key.startsWith('am_us_inbox_')) {
        console.error(
            'Warning: API key is not inbox-scoped (am_us_inbox_...). Send/reply operations may fail with 403.'
        )
    }
    return key
}

/**
 * Creates an authenticated AgentMailClient using the environment API key.
 */
export function createClient(): AgentMailClient {
    return new AgentMailClient({
        apiKey: getApiKey(),
        baseUrl: process.env.AGENTMAIL_BASE_URL,
    })
}
