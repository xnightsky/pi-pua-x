// ESM 解析钩子：把相对的 `./x.js` 导入解析到同名 `./x.ts`（若存在）。
// 源码内部用 `.js` 扩展名导入（TS/NodeNext 约定），node 原生 strip-types 不做此重写，
// 故测试加载 index.ts 时需要本钩子补齐。仅用于测试，不影响 pi 运行时。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const tsSpecifier = specifier.slice(0, -3) + ".ts";
    try {
      const candidate = new URL(tsSpecifier, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return next(tsSpecifier, context);
      }
    } catch {
      // 解析失败时回退到默认行为
    }
  }
  return next(specifier, context);
}
