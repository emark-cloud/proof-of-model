/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @proof/shared ships TS-built ESM; transpile it through Next for the app.
  transpilePackages: ["@proof/shared"],
};

export default nextConfig;
