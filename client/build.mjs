// client/build.mjs — 把 client/index.jsx 打包成 DSH 浏览器端插件包 client/client.js
//
// 产物格式（与 DSH 内建 client 包一致，见 @deepseek-ai/dsh-client-modules）：
//   window.__ModuleLoader__.load({
//     id: "dsh-lan-proxy",
//     factory: (require) => {
//       var module = { exports: {} };
//       var exports = module.exports;
//       ...CJS bundle...
//       return module.exports;
//     }
//   });
//
// - format: 'cjs'：插件以 CommonJS exports 交付 name/inject/apply 给浏览器 loader；
//   所有 exports/require 都闭包在 factory 内，不依赖 Node 全局。
// - external: react / react/jsx-runtime：DSH 浏览器端 seed 表（platform 模块）
//   已提供，运行时由 window.__ModuleLoader__ 的 seed/factory 解析，不打包。
// - jsx: 'automatic'：JSX 编译为 react/jsx-runtime 调用（同样是 seed）。
// - sourcemap: 生成 client.js.map，DSH 通过 /plugins/dsh-lan-proxy/client.js.map 提供。

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url)); // 本文件所在目录（client/）
const pkgName = 'dsh-lan-proxy';

// factory 外壳：提供 module/exports 变量，require 指向浏览器 loader 注入的 require
const banner = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkgName)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
`;

const footer = `\t\treturn module.exports;
\t}
});
`;

const result = await build({
  entryPoints: [join(root, 'index.jsx')],
  outfile: join(root, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  target: ['es2020'],
  sourcemap: true,
  // 浏览器端由 DSH 模块表（seed）提供的包一律 external，不打包
  external: ['react', 'react/jsx-runtime'],
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
});

console.log('dsh-lan-proxy client bundle written: client/client.js');