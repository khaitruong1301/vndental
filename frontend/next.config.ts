import type { NextConfig } from 'next';

// Host của backend (Express): production mặc định là project Vercel bevndental, ghi đè bằng BACKEND_URL
const PRODUCTION_BACKEND_URL = 'https://bevndental.vercel.app';
const backendUrl =
  process.env.BACKEND_URL ??
  (process.env.NODE_ENV === 'production' ? PRODUCTION_BACKEND_URL : 'http://localhost:4000');

const nextConfig: NextConfig = {
  // Thư mục gốc có package-lock riêng (concurrently) — chỉ định rõ để Next không đoán sai
  outputFileTracingRoot: __dirname,
  // Request đi qua middleware bị đệm với giới hạn mặc định 10MB → nâng lên để backend tự trả
  // lỗi "File vượt quá 10MB" (BN-06) thay vì proxy treo rồi trả 500
  experimental: { middlewareClientMaxBodySize: '12mb' },
  // Trình duyệt chỉ gọi /api/* cùng origin; Next.js chuyển tiếp sang server Node.js (Express)
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
