export const WORKFLOW_KNOWLEDGE_SOURCE = Object.freeze({
  kind: 'WORKFLOW_DEFINITION' as const,
  authority: 'Structured workflow definitions derived from ACTION_RULES are authoritative. Markdown, docs and future RAG may explain but never override them.',
  version: '2026-08-25.ai-foundation-1',
});
