#!/usr/bin/env node

import { loadEnv } from './env.js'

loadEnv()

const main = async () => {
    if (process.argv.includes('--channel')) {
        const { startChannel } = await import('./channel.js')
        startChannel()
    } else if (process.argv.includes('--stdio')) {
        const { StdioServerTransport } = await import(
            '@modelcontextprotocol/sdk/server/stdio.js'
        )
        const { createAuth, createClients } = await import('./env.js')
        const { createServer } = await import('./server.js')
        const clients = createClients(createAuth())
        const server = createServer(clients)
        await server.connect(new StdioServerTransport())
    } else if (process.argv.includes('--auth')) {
        await runAuthFlow()
    } else {
        const { startHttpServer } = await import('./http.js')
        startHttpServer()
    }
}

/**
 * Interactive OAuth flow to obtain a refresh token.
 * Run: npm run auth
 */
async function runAuthFlow(): Promise<void> {
    const { OAuth2Client } = await import('google-auth-library')

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.')
        process.exit(1)
    }

    const scopes = [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/tasks',
    ]

    const codespaceName = process.env.CODESPACE_NAME
    const redirectUri = codespaceName
        ? `https://${codespaceName}-3002.app.github.dev/callback`
        : 'http://localhost:3002/callback'

    const oauth = new OAuth2Client({
        clientId,
        clientSecret,
        redirectUri,
    })

    const authUrl = oauth.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
    })

    console.log('\n1. Open this URL in your browser:\n')
    console.log(authUrl)
    console.log('\n2. Authorize the app, then paste the redirect URL here.\n')

    // Simple HTTP server to catch the callback
    const { default: express } = await import('express')
    const app = express()

    const server = app.listen(3002, '127.0.0.1', () => {
        console.log('Waiting for OAuth callback on http://127.0.0.1:3002/callback ...\n')
    })

    app.get('/callback', async (req, res) => {
        const code = req.query.code as string
        if (!code) {
            res.send('No code received. Try again.')
            return
        }

        try {
            const { tokens } = await oauth.getToken(code)
            console.log('\nAdd this to your .env.local:\n')
            console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`)
            res.send('Success! You can close this tab. Check the terminal for your refresh token.')
        } catch (err) {
            console.error('Token exchange failed:', err)
            res.send('Token exchange failed. Check the terminal.')
        } finally {
            server.close()
            process.exit(0)
        }
    })
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
