// This preload runs BEFORE any page JavaScript
// It hooks fetch and XHR to capture spreadsheet data from API responses

import { contextBridge } from 'electron'

// Store captured API responses
const capturedResponses: Array<{ url: string; data: string }> = []

// ---- Hook fetch ----
const origFetch = window.fetch
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : (input as Request).url
  const response = await origFetch.call(window, input, init)

  // Intercept API responses that might contain spreadsheet data
  if (url.includes('/api/') && (
    url.includes('sheet') || url.includes('range') || url.includes('cell') ||
    url.includes('data') || url.includes('values') || url.includes('grid') ||
    url.includes('office') || url.includes('pad')
  )) {
    try {
      const clone = response.clone()
      const text = await clone.text()
      capturedResponses.push({ url, data: text })
      ;(window as any).__capturedData = capturedResponses
    } catch { /* ignore clone errors */ }
  }

  return response
}

// ---- Hook XMLHttpRequest ----
const OrigXHR = window.XMLHttpRequest

class HookedXHR extends OrigXHR {
  private _url: string = ''

  // @ts-ignore
  open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
    this._url = typeof url === 'string' ? url : url.toString()
    return super.open(method, url as string, async ?? true, user ?? null, password ?? null)
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', () => {
      const url = this._url || this.responseURL || ''
      if (url.includes('/api/') && (
        url.includes('sheet') || url.includes('range') || url.includes('cell') ||
        url.includes('data') || url.includes('values') || url.includes('grid') ||
        url.includes('office') || url.includes('pad')
      )) {
        try {
          capturedResponses.push({ url, data: this.responseText })
          ;(window as any).__capturedData = capturedResponses
        } catch { /* ignore */ }
      }
    })
    return super.send(body)
  }
}

window.XMLHttpRequest = HookedXHR as any

// Expose check function
contextBridge.exposeInMainWorld('dataCapture', {
  getCaptured: () => capturedResponses,
  getCount: () => capturedResponses.length
})
