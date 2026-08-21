'use client';

import { useState } from 'react';
import type { ApiResponse } from '../../../src/application/apiResponse';

interface GoogleWriteTestResult { requestId: string; timestamp: string; updatedRange: string }

export function GoogleWriteTestClient() {
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true); setMessage(undefined);
    try {
      const response = await fetch('/api/warehouse/uat/' + 'write-test', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ remark: 'UAT 页面按钮测试' }),
      });
      const payload = await response.json() as ApiResponse<GoogleWriteTestResult>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setMessage(`成功：${payload.data.requestId} · ${payload.data.updatedRange}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '写入测试失败'); }
    finally { setLoading(false); }
  }

  return <section className="card form-card">
    <p className="eyebrow">ISOLATED WRITE TEST</p>
    <h3>Google Sheet 写入接口</h3>
    <p>只向副本的“UAT_写入测试”页追加一行，不会写入“主表 库存流水”。</p>
    <button className="primary-button" type="button" onClick={runTest} disabled={loading}>{loading ? '正在测试…' : '执行一次写入测试'}</button>
    {message && <div className={message.startsWith('成功') ? 'notice' : 'notice error'}>{message}</div>}
  </section>;
}
