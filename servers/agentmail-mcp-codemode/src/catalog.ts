import { AgentMailClient } from 'agentmail'
import { AgentMailToolkit } from 'agentmail-toolkit'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'

interface CatalogEntry {
    name: string
    description: string
    parameters?: Record<string, unknown>
}

interface CatalogResult {
    tools: CatalogEntry[]
    summary: string
}

const toolkit = new AgentMailToolkit(new AgentMailClient({ apiKey: 'catalog' }))
const allTools = toolkit.getTools()

export function searchCatalog(
    query?: string,
    detail: 'brief' | 'detailed' = 'brief'
): CatalogResult {
    let matched = allTools

    if (query) {
        const q = query.toLowerCase()
        matched = allTools.filter(
            (t) =>
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
        )
    }

    const tools: CatalogEntry[] = matched.map((t) => {
        const entry: CatalogEntry = {
            name: t.name,
            description: t.description,
        }
        if (detail === 'detailed') {
            entry.parameters = toJsonSchemaCompat(t.paramsSchema)
        }
        return entry
    })

    return {
        tools,
        summary: `Showing ${tools.length} of ${allTools.length} tools`,
    }
}
