# SKILL REFACTOR PLAN

## 目标

把现有 46 行工单技能与 20 行标签技能中的确定性业务逻辑移出提示词，只保留语义解析。

## SKILL_WORK_ORDER

输入：ERP 工单文件或文本。  
输出：`sh_no`、`replacement_lines[{sku, qty, erp_warehouse, source_file, source_row}]`、confidence、needs_confirmation。

禁止输出：库位、SN、库存属性、Pickup Code、动作。缺少 Replacement 标题时只返回候选行并要求确认。

## SKILL_RETURN_INTAKE

输入：退回维修自然语言与 SN 列表。  
输出：requested_action、sn_list、explicit_corrections。  
历史查询、SKU/SH 识别、冲突检测和交易生成由代码完成。

## SKILL_MOVE_ADJUSTMENT

输入：移库或维修完成指令。  
输出：intent、sn_list、explicit_target、explicit_corrections。  
来源库位、SKU、库存属性、目标验证和交易生成由代码完成。

## 标签

标签不再单独依赖大型 AI Skill。它直接读取已确认的 Prepared 行，按 Pickup Code 分页并按 SKU+Model+ERP Warehouse 汇总，生成 A4 预览。

## 迁移步骤

1. 冻结旧 Skill 页为参考。
2. 建立三个小 Skill 的 JSON 契约和测试样例。
3. 将 Pickup、库存推荐、写入、标签和校验改为确定性函数。
4. 用历史工单/退回/移库样本回归。
5. 通过后再替换旧入口，保留版本与回滚说明。

