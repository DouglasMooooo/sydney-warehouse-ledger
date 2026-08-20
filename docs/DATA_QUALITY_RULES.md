# DATA QUALITY RULES

异常只检测和报告；历史数据不自动修复。

| 代码 | 级别 | 判定 |
|---|---|---|
| DATE_STORED_AS_TEXT | ERROR | 日期字段为文本而非真实日期 |
| HIDDEN_CHARACTER | WARNING | ID/受控字段含首尾空白、CR/LF/TAB/零宽字符 |
| INVALID_ACTION | ERROR | C 不在 8 项动作中 |
| INVALID_STOCK_CONDITION | ERROR | P 不在 5 项属性中 |
| INVALID_LOCATION | ERROR | L/M 非空但不在库位维护 |
| DUPLICATE_SN | WARNING/ERROR | 同 SN 历史重复为 WARNING；同一当前库存状态重复占用为 ERROR |
| MISSING_SKU | ERROR | 需 SKU 的正数量业务行缺 G；允许的退修未知项降为 WARNING |
| MISSING_SN | ERROR | 成品出库/退回维修缺 J |
| MISSING_LOCATION | ERROR | 动作所需来源/目标库位为空 |
| INVALID_QTY | ERROR | K 空、文本、负数；序列化行非整数或不等于 1 |
| PREPARED_WITHOUT_SOURCE_LOCATION | ERROR | 备货缺 L |
| PREPARED_WITHOUT_PICKUP_CODE | ERROR | 备货缺 E |
| PRODUCT_OUTBOUND_WITHOUT_SN | ERROR | 成品出库缺 J |
| RETURN_WITHOUT_TARGET_LOCATION | ERROR | 退回维修缺 M |
| MOVE_WITHOUT_SOURCE | ERROR | 移库缺 L |
| MOVE_WITHOUT_TARGET | ERROR | 移库缺 M |
| CONTAINER_MISMATCH | ERROR | 备货库存键容器与实际可用库存容器不一致 |
| FORMULA_MISSING | ERROR | 业务有效/预留行的保护列缺公式 |
| FORMULA_BROKEN | ERROR | 公式结果含 #REF/#VALUE/#NAME/#N/A/#DIV/0 或兼容性失败 |
| VALIDATION_NOT_OK | ERROR | O/W 等校验结果非“正常” |

## 已识别基线

- DATE_STORED_AS_TEXT：A 248、B 5。
- HIDDEN_CHARACTER：至少 D1575/D1633/D1644/D1714/D1739、N1579。
- FORMULA_MISSING：H/I 1653；AB/AC 1654–1656。
- FORMULA_BROKEN/兼容风险：布局 SKU 提取公式返回空白；旧看板动态数组公式与固定截止行需复核。

## 输出字段

每条异常包含：severity、code、sheet、row、column、business_key、current_value、evidence、suggested_action、status、owner。

