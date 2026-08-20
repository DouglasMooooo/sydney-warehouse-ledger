# IMPLEMENTATION PLAN

每一阶段必须通过对账后才能进入下一阶段。

## Phase 1 — 数据标准与质量检测

- 固化字段类型、动作、库存属性、Location Master。
- 建立只读质量扫描与异常视图。
- 先报告 A/B 文本日期、隐藏字符、公式断点，不自动改历史。
- 验收：20 条规则有测试；现有异常可定位到行；无主表业务值被改写。

## Phase 2 — 今日任务、异常与可视化

- 创建今日任务和异常视图。
- 首先修复库位现场图 SKU 缺失。
- 改造运营看板，移除固定截止行风险。
- 验收：空位/单 SKU/混装样本正确；布局总量与当前库存按库位汇总一致。

## Phase 3 — Pickup Code 与 Work Order Prepared

- 确定性生成 `SYD-00000`。
- 解析 Replacement、库存推荐、预览确认、写入回读。
- Prepared 不扣物理库存，冻结数量正确。
- 验收：重复 Pickup=0；库存不足返回 INSUFFICIENT_STOCK；公式与校验正常。

## Phase 4 — Label

- 从确认后的 Prepared 行直接生成标签数据。
- 一个 Pickup Code 一张 A4；支持 Location/Container。
- 验收：分页、边距、总 Qty、ERP Warehouse 全部对账。

## Phase 5 — Return to Repair

- 支持单个/批量 SN、历史查询、未知 SKU/SH 待补。
- 验收：不虚构字段；目标默认 REPAIR-01；冲突可见。

## Phase 6 — Move / Adjustment

- SN 自动查来源；目标库位校验；属性保持。
- 维修完成走受控调增流程。
- 验收：From/To/Condition、库存前后数量、移库辅助键对账。

## Phase 7 — 最终对账与文档

- 周报与月报逐指标对账。
- 扫描公式错误、日期类型、重复 Pickup/SN、负库存。
- 更新 SOP、三项小 Skill 与操作说明。

## 技术边界

只使用飞书表格/视图、少量脚本和小型 AI Skills。不实现 ERP/WMS 写回、自动销售单、硬件或外部 API。未来连接器只保留接口：ERPConnector、WMSConnector、EmailConnector、PrinterConnector；当前使用手工实现。

