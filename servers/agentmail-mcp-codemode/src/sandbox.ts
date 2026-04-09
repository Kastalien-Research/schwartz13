import vm from 'node:vm'
import { AgentMailClient } from 'agentmail'

interface ExecuteResult {
    result: unknown
    logs: string[]
    isError: boolean
}

const TIMEOUT_MS = parseInt(process.env.EXECUTE_TIMEOUT_MS ?? '10000', 10)

export async function executeCode(
    code: string,
    client: AgentMailClient
): Promise<ExecuteResult> {
    const logs: string[] = []
    const capture =
        (...args: unknown[]) =>
            logs.push(args.map(String).join(' '))

    const sandbox = {
        agentmail: client,
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
        const message =
            error instanceof Error ? error.message : String(error)
        return { result: message, logs, isError: true }
    }
}
