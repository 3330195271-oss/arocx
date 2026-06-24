/**
 * WPS 表格 JS 宏 — 一键同步数据到 arocx
 *
 * 安装方法：
 *   1. 打开你的 WPS 表格
 *   2. 点击「开发工具」→「JS 宏编辑器」（如果没有「开发工具」标签，
 *      在功能区右键 → 自定义功能区 → 勾选「开发工具」）
 *   3. 在左侧「模块」上右键 → 插入模块
 *   4. 将本文件全部内容粘贴进去
 *   5. 保存（Ctrl+S），关闭编辑器
 *   6. 回到表格，点击「开发工具」→「宏」→ 选择 syncToAssistant → 运行
 *
 * 可选：在表格中插入一个按钮来触发此宏
 *   点击「开发工具」→「插入」→「按钮」→ 指定宏为 syncToAssistant
 *
 * 两种同步模式（自动切换）：
 *   - HTTP 模式（优先）：直接 POST 到本机 arocx
 *   - 文件模式（备用）：保存 xlsx 到 Documents\arocx\ 目录
 */

function syncToAssistant() {
  try {
    var wb = Application.ActiveWorkbook
    if (!wb) {
      MsgBox("请先打开一个表格！", 0, "错误")
      return
    }

    var sheet = wb.ActiveSheet
    var usedRange = sheet.UsedRange
    var data = usedRange.Value
    // data is a 2D array: data[row][col], 1-based in VBA but 0-based in JS

    if (!data || data.length < 2) {
      MsgBox("表格中至少需要表头和一行数据！", 0, "错误")
      return
    }

    // Convert to plain 2D array of strings (handle null/undefined)
    var rows = []
    for (var r = 0; r < data.length; r++) {
      var row = []
      for (var c = 0; c < data[r].length; c++) {
        var val = data[r][c]
        row.push(val != null ? String(val) : "")
      }
      rows.push(row)
    }

    // Try HTTP mode first
    var httpSuccess = tryHttpSync(rows)
    if (httpSuccess) return

    // Fallback: save to file
    tryFileSync(wb)
  } catch (e) {
    MsgBox("同步出错：" + e.message, 0, "错误")
  }
}

function tryHttpSync(rows) {
  try {
    var json = JSON.stringify({ rows: rows })

    // Try fetch (WPS 2022+)
    if (typeof fetch !== "undefined") {
      var resp = fetch("http://localhost:3000/api/customers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        mode: "cors"
      })
      // fetch in WPS macro is sync-like? We need to check result
      // Actually WPS JSAPI fetch may be async. Use XMLHttpRequest for reliability.
    }

    // Use XMLHttpRequest (more reliable in WPS)
    var xhr = new XMLHttpRequest()
    xhr.open("POST", "http://localhost:3000/api/customers/sync", false) // sync request
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send(json)

    if (xhr.status === 200) {
      var result = JSON.parse(xhr.responseText)
      MsgBox("同步成功！\n已导入 " + result.imported + " 个订单（共 " + result.total + " 行数据）", 0, "同步成功")
      return true
    } else {
      throw new Error("服务器返回 " + xhr.status + ": " + xhr.responseText)
    }
  } catch (e) {
    // HTTP failed, will try file fallback
    return false
  }
}

function tryFileSync(wb) {
  try {
    // Get user's Documents folder
    var shell = new ActiveXObject("WScript.Shell")
    var docsPath = shell.SpecialFolders("MyDocuments")
    var saveDir = docsPath + "\\arocx"

    // Create directory if needed
    var fso = new ActiveXObject("Scripting.FileSystemObject")
    if (!fso.FolderExists(saveDir)) {
      fso.CreateFolder(saveDir)
    }

    // Save with timestamp
    var now = new Date()
    var ts = now.getFullYear() +
      pad2(now.getMonth() + 1) +
      pad2(now.getDate()) + "_" +
      pad2(now.getHours()) +
      pad2(now.getMinutes()) +
      pad2(now.getSeconds())

    var filename = saveDir + "\\WPS同步_" + ts + ".xlsx"

    // 51 = xlOpenXMLWorkbook (.xlsx format)
    wb.SaveAs(filename, 51)

    // Also save as "latest" for auto-sync to pick up
    wb.SaveAs(saveDir + "\\WPS实时同步.xlsx", 51)

    MsgBox("HTTP 同步不可用，已通过文件同步！\n" +
      "文件已保存到：\n" + filename + "\n\n" +
      "arocx 将在下次自动同步时读取。", 0, "文件同步成功")
  } catch (e) {
    // Also try with Application.Worksheets and different save method
    try {
      var docsPath2 = "C:\\Users\\" + Environ("USERNAME") + "\\Documents\\arocx"
      wb.SaveAs(docsPath2 + "\\WPS实时同步.xlsx", 51)
      MsgBox("已通过文件同步（备用路径）！", 0, "文件同步成功")
    } catch (e2) {
      MsgBox("无法保存文件。请确认 arocx 已运行。\n错误：" + e.message, 0, "同步失败")
    }
  }
}

function pad2(n) {
  return n < 10 ? "0" + n : "" + n
}
