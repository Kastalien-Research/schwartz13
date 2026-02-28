import type { App } from '@modelcontextprotocol/ext-apps';

export interface TaskResult {
  data: unknown;
  isError: boolean;
  errorText?: string;
}

export async function callTask(
  app: App,
  toolName: string,
  args: Record<string, unknown>,
): Promise<TaskResult> {
  try {
    const result = await app.callServerTool({
      name: toolName,
      arguments: args,
    });

    if (result.isError) {
      const text = result.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') ?? 'Unknown error';
      return { data: null, isError: true, errorText: text };
    }

    if (result.structuredContent) {
      return {
        data: (result.structuredContent as any).data,
        isError: false,
      };
    }

    const text = result.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n') ?? '';
    try {
      return { data: JSON.parse(text), isError: false };
    } catch {
      return { data: text, isError: false };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, isError: true, errorText: msg };
  }
}
