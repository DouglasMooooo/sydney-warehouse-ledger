import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  async headers() {
    const csp = [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'",
      "frame-ancestors 'self' https://*.feishu.cn https://*.larksuite.com",
      "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'",
    ].join('; ');
    return [{
      source: '/:path*', headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
