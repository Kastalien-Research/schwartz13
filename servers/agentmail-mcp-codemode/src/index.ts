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
        const { createClient } = await import('./env.js')
        const { createServer } = await import('./server.js')
        const client = createClient()
        const server = createServer(client)
        await server.connect(new StdioServerTransport())
    } else {
        const { startHttpServer } = await import('./http.js')
        startHttpServer()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
