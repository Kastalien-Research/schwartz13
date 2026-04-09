import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OAuth2Client } from 'google-auth-library'
import { google, type gmail_v1, type calendar_v3, type drive_v3, type docs_v1, type sheets_v4, type slides_v1, type tasks_v1 } from 'googleapis'

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
 * Creates an authenticated OAuth2Client from environment variables.
 */
export function createAuth(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        console.error(
            'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local'
        )
        process.exit(1)
    }

    const auth = new OAuth2Client({ clientId, clientSecret })
    auth.setCredentials({ refresh_token: refreshToken })
    return auth
}

export interface GoogleClients {
    gmail: gmail_v1.Gmail
    calendar: calendar_v3.Calendar
    drive: drive_v3.Drive
    docs: docs_v1.Docs
    sheets: sheets_v4.Sheets
    slides: slides_v1.Slides
    tasks: tasks_v1.Tasks
}

/**
 * Creates authenticated Google API service clients.
 */
export function createClients(auth?: OAuth2Client): GoogleClients {
    const oauth = auth ?? createAuth()
    return {
        gmail: google.gmail({ version: 'v1', auth: oauth }),
        calendar: google.calendar({ version: 'v3', auth: oauth }),
        drive: google.drive({ version: 'v3', auth: oauth }),
        docs: google.docs({ version: 'v1', auth: oauth }),
        sheets: google.sheets({ version: 'v4', auth: oauth }),
        slides: google.slides({ version: 'v1', auth: oauth }),
        tasks: google.tasks({ version: 'v1', auth: oauth }),
    }
}
