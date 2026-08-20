export default function HomePage() {
  return <main className="login-shell"><section className="card login-card"><div className="brand-mark">SYD</div><p className="eyebrow">FOX ESS · INTERNAL</p><h1>Sydney Warehouse</h1><p>使用已授权的飞书账号进入只读仓库系统。</p><a className="primary-button login-button" href={process.env.WAREHOUSE_DEV_AUTH === 'true' ? '/dashboard' : '/api/auth/feishu/start'}>{process.env.WAREHOUSE_DEV_AUTH === 'true' ? '进入本地开发模式' : '使用飞书登录'}</a><small>只读试运行 · 不执行备货、出库、返修、移库或库存调整写入</small></section></main>;
}
