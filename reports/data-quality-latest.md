# Data Quality Scan

Generated: 2026-08-20T02:48:21.805Z

Scanned rows: 2341

| Rule | Count | Safe row numbers |
|---|---:|---|
| DATE_STORED_AS_TEXT | 0 |  |
| HIDDEN_CHARACTER | 6 | 1575, 1579, 1633, 1644, 1714, 1739 |
| INVALID_ACTION | 0 |  |
| INVALID_STOCK_CONDITION | 532 | omitted (>100 rows) |
| INVALID_LOCATION | 0 |  |
| INVALID_QTY | 1887 | omitted (>100 rows) |
| MISSING_SKU | 166 | omitted (>100 rows) |
| MISSING_SN | 0 |  |
| PREPARED_WITHOUT_SOURCE_LOCATION | 1 | 1649 |
| PREPARED_WITHOUT_PICKUP_CODE | 2 | 1634, 1649 |
| PRODUCT_OUTBOUND_WITHOUT_SN | 207 | omitted (>100 rows) |
| RETURN_WITHOUT_TARGET_LOCATION | 621 | omitted (>100 rows) |
| MOVE_WITHOUT_SOURCE | 0 |  |
| MOVE_WITHOUT_TARGET | 0 |  |
| FORMULA_MISSING | 0 |  |
| FORMULA_BROKEN | 0 |  |
| VALIDATION_NOT_OK | 86 | 1480, 1481, 1562, 1563, 1564, 1565, 1568, 1569, 1570, 1571, 1572, 1573, 1576, 1577, 1578, 1582, 1583, 1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1614, 1635, 1636, 1645, 1646, 1647, 1648, 1649, 1654, 1655, 1719, 1720, 1733, 1734, 1735, 1736, 1737, 1738, 1764, 1765, 1766, 1767, 1768, 1769, 1770, 1771, 1837, 1838, 1839, 1840, 1841, 1842, 1843, 1844, 1845, 1846, 1847, 1848, 1849, 1850, 1851, 1852, 1853, 1877, 1878, 1879, 1880, 1881, 1882, 1883, 1884, 1885, 1886, 1888, 1889, 1890, 1891, 1892, 1893, 1894 |

Controlled actions checked: 期初库存、备货、出库、退回维修、入库、移库、库存调增、库存调减.

Limitation: DATE_STORED_AS_TEXT requires per-cell stored-type metadata. The current CLI response did not expose it; a zero live count is not proof that historical text dates are absent.

No operational values, SNs, customer data, or credentials are included.
