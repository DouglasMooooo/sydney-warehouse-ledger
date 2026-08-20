export function ComingSoon({ title, description }: { title: string; description: string }) {
  return <><header className="page-header"><div><p className="eyebrow">DISABLED IN ITERATION 1</p><h2>{title}</h2><p>{description}</p></div><div className="preview-badge">Coming soon</div></header><section className="card coming-soon"><h3>功能尚未启用</h3><p>本轮不会向飞书台账写入任何业务记录。启用前必须通过对应的安全审查和 reconciliation release gates。</p></section></>;
}
