// 注册 .js→.ts 解析钩子（供 node --import 使用）。
import { register } from "node:module";
register("./_ts-resolve.mjs", import.meta.url);
