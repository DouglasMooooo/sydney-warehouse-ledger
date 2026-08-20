import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect(process.env.WAREHOUSE_DEV_AUTH === 'true' ? '/dashboard' : '/api/auth/feishu/start');
}
