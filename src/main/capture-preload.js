// Plain JS preload - hooks fetch/XHR BEFORE page scripts load
const { contextBridge } = require('electron')

const captured = []

// Hook fetch
const origFetch = window.fetch
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || ''
  const resp = await origFetch.call(window, input, init)

  if (url.indexOf('/api/') !== -1) {
    try {
      const clone = resp.clone()
      const text = await clone.text()
      if (text && text.length > 50) {
        captured.push({ url, data: text, time: Date.now() })
        window.__capturedData = captured
      }
    } catch (e) {}
  }
  return resp
}

// Hook XHR
const OrigXHR = window.XMLHttpRequest
window.XMLHttpRequest = function () {
  const xhr = new OrigXHR()
  let _url = ''

  const origOpen = xhr.open
  xhr.open = function (method, url) {
    _url = typeof url === 'string' ? url : url.toString()
    return origOpen.apply(xhr, arguments)
  }

  const origSend = xhr.send
  xhr.send = function () {
    xhr.addEventListener('load', function () {
      const url = _url || xhr.responseURL || ''
      if (url.indexOf('/api/') !== -1 && xhr.responseText && xhr.responseText.length > 50) {
        captured.push({ url, data: xhr.responseText, time: Date.now() })
        window.__capturedData = captured
      }
    })
    return origSend.apply(xhr, arguments)
  }

  return xhr
}
window.XMLHttpRequest.prototype = OrigXHR.prototype

contextBridge.exposeInMainWorld('capture', {
  getData: () => captured
})
