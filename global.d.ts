/**
 * Stub 类型声明：为仓库内 VS Code 消除飘红。
 *
 * 本目录下的 .ts 文件是“复制到目标环境安装”的扩展，
 * 运行时依赖目标机器上已安装的 `@mariozechner/pi-coding-agent`
 * 及 Node.js 内置模块，因此仓库内只做最简声明即可。
 */

declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    on(
      event:
        | "session_start"
        | "tool_result"
        | "tool_call"
        | "before_agent_start"
        | "input"
        | "turn_end"
        | "agent_end"
        | "session_before_compact",
      handler: (event: any, ctx: any) => any | Promise<any>
    ): void;
    registerCommand(name: string, def: {
      description: string;
      handler: (args: string[], ctx: any) => Promise<any>;
    }): void;
    /** 当前轮对模型可见的工具；旧版 PI 可能不提供。 */
    getActiveTools?(): any[];
    /** 宿主注册的完整工具清单；用于识别直连 MCP 工具。 */
    getAllTools?(): any[];
  }
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function homedir(): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};
