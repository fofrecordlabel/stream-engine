/**
 * StreamEngine AI client (frontend).
 * Calls our backend route so OPENAI_API_KEY never touches the browser.
 */

import { apiFetch } from './apiClient.js'

export async function runStreamEngineAI({ useCase, input, context }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await apiFetch('/api/ai/streamengine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ useCase, input, context }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.error || `AI request failed (${res.status})`
      throw new Error(msg)
    }

    if (!data?.ok) {
      throw new Error(data?.error || 'AI request failed')
    }

    return {
      useCase: data.useCase,
      content: data.content || '',
      meta: data.meta || {},
    }
  } finally {
    clearTimeout(timeout)
  }
}

