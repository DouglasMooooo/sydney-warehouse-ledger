import { isVisualDemoMode } from '../src/demo/visualDemo';

export default function HomePage() {
  const visualDemo = isVisualDemoMode();
  const devMode = process.env.WAREHOUSE_DEV_AUTH === 'true';
  const href = visualDemo || devMode ? '/dashboard' : '/api/auth/feishu/start';
  const label = visualDemo ? '进入视觉演示' : devMode ? '进入本地开发模式' : '使用飞书登录';
  return <main className="login-shell"><section className="card login-card"><div className="brand-mark">SYD</div><p className="eyebrow">FOX ESS · INTERNAL</p><h1>Sydney Warehouse</h1><p>{visualDemo ? '浏览脱敏示例界面；暂不连接飞书或任何真实库存来源。' : '使用已授权的飞书账号进入只读仓库系统。'}</p><a className="primary-button login-button" href={href}>{label}</a><small>{visualDemo ? '视觉演示 · 示例数据 · 禁止业务写入' : '只读试运行 · 不执行备货、出库、返修、移库或库存调整写入'}</small></section></main>;
}
