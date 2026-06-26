// Injected into index.html for browser clients.
// Creates window.electronAPI with the same interface as preload,
// but uses fetch() to call the REST API.
export const API_POLYFILL = `
<script>
window.electronAPI = {
  // Window controls (no-op in browser)
  minimize: function(){},
  maximize: function(){},
  close: function(){},
  isMaximized: function(){ return Promise.resolve(false); },

  // Customer data
  fetchCustomerData: function(){
    return fetch('/api/customers/fetch').then(function(r){ if(!r.ok) throw new Error('获取数据失败'); return r.json(); });
  },
  getSavePath: function(){
    return Promise.resolve('（网页版，文件在服务器上）');
  },
  openSharedLink: function(){
    window.open('https://www.kdocs.cn/l/cvSwqJYu94pp', '_blank');
  },

  // Device management
  addDevice: function(serialNumber, deviceId){
    return fetch('/api/devices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({serialNumber: serialNumber, deviceId: deviceId}) }).then(function(r){ return r.json(); });
  },
  getDevices: function(status){
    var url = '/api/devices' + (status ? '?status=' + encodeURIComponent(status) : '');
    return fetch(url).then(function(r){ return r.json(); });
  },
  getInventoryStats: function(){
    return fetch('/api/stats/inventory').then(function(r){ return r.json(); });
  },

  // Order management
  createOrder: function(name, phone, address, deviceId){
    return fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({customerName: name, customerPhone: phone, customerAddress: address, deviceId: deviceId}) }).then(function(r){ return r.json(); });
  },
  getTodayOrders: function(){
    return fetch('/api/orders').then(function(r){ return r.json(); });
  },
  getAllOrders: function(){
    return fetch('/api/orders').then(function(r){ return r.json(); });
  },
  dispatchOrder: function(orderId, serialNumber, trackingNumber){
    return fetch('/api/orders/dispatch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orderId: orderId, serialNumber: serialNumber, trackingNumber: trackingNumber}) }).then(function(r){ return r.json(); });
  },
  dispatchOrderWithNewDevice: function(orderId, serialNumber, trackingNumber){
    return fetch('/api/orders/dispatch-with-new-device', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orderId: orderId, serialNumber: serialNumber, trackingNumber: trackingNumber}) }).then(function(r){ return r.json(); });
  },
  returnOrder: function(orderId){
    return fetch('/api/orders/return', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orderId: orderId}) }).then(function(r){ return r.json(); });
  },
  getDailyStats: function(){
    return fetch('/api/stats/daily').then(function(r){ return r.json(); });
  },

  // Device import from file (browser: upload, Electron: dialog)
  importDevicesFromExcel: function(){
    return new Promise(function(resolve, reject){
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls';
      input.onchange = function(){
        var file = input.files[0];
        if (!file) { resolve({imported:0, errors:[]}); return; }
        var form = new FormData();
        form.append('file', file);
        fetch('/api/devices/import', { method:'POST', body: form })
          .then(function(r){ return r.json(); })
          .then(resolve)
          .catch(function(e){ resolve({imported:0, errors:[e.message]}); });
      };
      input.click();
    });
  },

  deleteDevice: function(deviceId){
    return fetch('/api/devices/' + encodeURIComponent(deviceId), { method:'DELETE' }).then(function(r){ return r.json(); });
  },

  getRentingOrders: function(){
    return fetch('/api/orders/renting').then(function(r){ return r.json(); });
  },

  openWebUrl: function(url){
    window.open(url, '_blank');
  },

  getWebUrl: function(){
    return Promise.resolve(window.location.origin);
  },

  openDataFolder: function(){
    alert('数据文件夹在服务器上的 data/ 目录');
  }
};
</script>
`
