import type { DashboardSnapshot } from './contracts.js';

export interface WarehouseAiAnswer { answer: string; intent: string; asOf: string; source: 'LIVE_FEISHU'; readOnly: true }

export function answerWarehouseQuestion(questionInput: unknown, snapshot: DashboardSnapshot): WarehouseAiAnswer {
  if (typeof questionInput !== 'string') throw new TypeError('question must be text');
  const question = questionInput.trim();
  if (!question || question.length > 200) throw new TypeError('question must contain 1-200 characters');
  const answer = (intent: string, text: string): WarehouseAiAnswer => ({ answer: text, intent, asOf: snapshot.businessDate, source: 'LIVE_FEISHU', readOnly: true });
  const condition = ([
    ['维修良品', 'repaired_good'], ['待修', 'pending_repair'], ['报废', 'scrapped'], ['物料', 'material'], ['新机', 'new_units'],
  ] as const).find(([label]) => question.includes(label));
  if (condition) {
    const row = snapshot.inventoryByCondition.find((item) => item.condition === condition[0]);
    return answer(condition[1]!, `${condition[0]}可用库存为 ${row?.availableQty ?? 0}。`);
  }
  const location = /\b(?:R\d+(?:-\d+){2}-[LMR]|REPAIR-\d+|FLEX-\d+)\b/i.exec(question)?.[0]?.toUpperCase();
  if (location) {
    const row = snapshot.inventoryByLocation.find((item) => item.location.toUpperCase() === location);
    return answer('location_inventory', `${location} 的可用库存为 ${row?.availableQty ?? 0}。`);
  }
  if (question.includes('待取货')) return answer('awaiting_pickup', `当前待取货任务 ${snapshot.metrics.awaitingPickup} 个。`);
  if (question.includes('今日备货')) return answer('today_prepared', `今日备货工单 ${snapshot.metrics.todayPreparedWorkOrders} 个。`);
  if (question.includes('今日出库')) return answer('today_shipped', `今日已出库数量 ${snapshot.metrics.shippedToday}。`);
  if (question.includes('今日返修')) return answer('today_returned', `今日返修数量 ${snapshot.metrics.returnedToday}。`);
  if (question.includes('异常')) return answer('exceptions', `当前异常 ${snapshot.metrics.exceptionCount} 项。`);
  if (question.includes('维修库存')) return answer('repair_inventory', `维修库存合计 ${snapshot.inventory.repairInventory}。`);
  throw new TypeError('unsupported warehouse question');
}
