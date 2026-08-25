export default function HomePage() {
  return <main className="login-shell"><section className="card login-card"><div className="brand-mark">SYD</div><p className="eyebrow">FOX ESS · INTERNAL</p><h1>Sydney Warehouse</h1><p>使用已授权的飞书账号进入悉尼仓库操作系统。</p><a className="primary-button login-button" href={process.env.WAREHOUSE_DEV_AUTH === 'true' ? '/dashboard' : '/api/auth/feishu/start'}>{process.env.WAREHOUSE_DEV_AUTH === 'true' ? '进入本地开发模式' : '使用飞书登录'}</a><small>UAT 受控写入 · 每笔操作执行权限校验和写后复核</small></section></main>;
}
