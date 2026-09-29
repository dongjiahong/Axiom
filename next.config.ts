import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是原生模块，必须由 Node 直接加载而不是被打包。
  serverExternalPackages: ["better-sqlite3"],
  // 允许用 127.0.0.1 访问开发服务器：否则 Next 16 会拦截跨域的 dev 资源，
  // 客户端脚本无法完成 hydration，页面上的按钮和勾选都会没有反应。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
