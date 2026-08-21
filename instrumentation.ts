export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    const { validateUatRuntimeConfig } = await import('./src/config/runtimeConfig.js');
    try { validateUatRuntimeConfig(); }
    catch { console.error('READ_ONLY_UAT_NOT_READY'); }
  }
}
