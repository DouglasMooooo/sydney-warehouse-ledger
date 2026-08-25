import type { LedgerAction } from '../../src/config/controlledValues';

export function ControlledActionPanel({ action, workflow, effect }: { action: LedgerAction; workflow: string; effect: string }) {
  return <section className="control-panel workflow-context">
    <div className="panel-kicker">当前业务流程</div>
    <strong className="workflow-name">{workflow}</strong>
    <div className="readonly-action"><span>库存动作</span><b>{action}</b></div>
    <div className="readonly-action"><span>库存影响</span><b>{effect}</b></div>
    <p>动作由系统根据流程自动确定，不能在表单中切换。</p>
    <div className="enabled-row"><span>发布状态</span><strong>UAT 受控写入</strong></div>
  </section>;
}
