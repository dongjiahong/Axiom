import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是原生模块，必须由 Node 直接加载而不是被打包。
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
