import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, 'assets')
const logoSource = join(__dirname, '..', 'resources', 'logo-aro-icon.png')

function appWindow({ title, subtitle, content, width = 1360, height = 860 }) {
  return `
    <g>
      <rect x="0" y="0" width="${width}" height="${height}" rx="34" fill="#ffffff" stroke="rgba(20,24,30,0.08)" stroke-width="2"/>
      <rect x="0" y="0" width="${width}" height="56" rx="34" fill="#fafaf8"/>
      <rect x="0" y="28" width="${width}" height="${height - 28}" fill="#ffffff"/>
      <circle cx="26" cy="28" r="7" fill="#ff5f57"/>
      <circle cx="48" cy="28" r="7" fill="#fdbc40"/>
      <circle cx="70" cy="28" r="7" fill="#34c749"/>
      <text x="120" y="26" font-size="15" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${title}</text>
      <text x="120" y="44" font-size="11" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${subtitle}</text>
      ${content}
    </g>
  `
}

function heroSvg() {
  const sidebar = `
    <rect x="0" y="56" width="254" height="804" fill="#f4f5f1"/>
    <rect x="18" y="88" width="218" height="88" rx="22" fill="#ffffff" stroke="rgba(18,22,29,0.06)"/>
    <rect x="34" y="106" width="44" height="44" rx="12" fill="#e8eef9"/>
    <text x="94" y="120" font-size="17" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">ARO 仓序</text>
    <text x="94" y="144" font-size="12" font-weight="500" fill="#6a7380" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">设备租赁与订单协作</text>

    ${[
      ['首页总览', '#eaf3ff', '#0a84ff'],
      ['AI 截图录单', 'transparent', '#5f6976'],
      ['订单管理', 'transparent', '#5f6976'],
      ['设备库存', 'transparent', '#5f6976'],
      ['微信通知', 'transparent', '#5f6976'],
      ['飞书同步', 'transparent', '#5f6976']
    ].map((item, index) => `
      <rect x="18" y="${198 + index * 62}" width="218" height="48" rx="16" fill="${item[1]}"/>
      <text x="34" y="${227 + index * 62}" font-size="14" font-weight="${index === 0 ? 700 : 600}" fill="${item[2]}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
    `).join('')}
  `

  const cards = `
    <text x="294" y="118" font-size="36" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">把录单、库存、发货和协作放到同一条业务链里</text>
    <text x="294" y="154" font-size="16" font-weight="500" fill="#6a7380" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">AI 截图录单、租期提醒、微信通知、飞书同步，围着订单本身工作。</text>

    ${[
      ['今日待发货', '14', '#ffefe4', '#d86f1d'],
      ['即将到期', '9', '#eef5ff', '#1f64d8'],
      ['空闲库存', '86', '#ebf8ef', '#1f8e4c'],
      ['租用中', '124', '#f2ecff', '#6b45d8']
    ].map((item, index) => `
      <g transform="translate(${294 + index * 202}, 196)">
        <rect width="184" height="132" rx="24" fill="${item[2]}" />
        <text x="20" y="34" font-size="14" font-weight="600" fill="${item[3]}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
        <text x="20" y="94" font-size="54" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[1]}</text>
      </g>
    `).join('')}

    <g transform="translate(294 360)">
      <rect width="620" height="400" rx="28" fill="#ffffff" stroke="rgba(18,22,29,0.07)" />
      <text x="28" y="38" font-size="20" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">订单总览</text>
      <text x="28" y="64" font-size="13" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">起租日、到期日、发货状态会直接显示在同一行</text>

      ${[
        ['王旭', 'ARO-DS09', '2026-06-24', '2026-06-30', '待发货', '#fff1e7', '#db6d20'],
        ['简宁', 'ARO-CAM18', '2026-06-22', '2026-06-28', '租用中', '#e9f5ed', '#237f48'],
        ['周禾', 'ARO-LT06', '2026-06-25', '2026-07-02', '已转寄', '#edf2ff', '#355fd1']
      ].map((row, index) => `
        <g transform="translate(24, ${92 + index * 92})">
          <rect width="572" height="74" rx="20" fill="#f8f9fb"/>
          <text x="18" y="28" font-size="16" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[0]}</text>
          <text x="18" y="50" font-size="12" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[1]}</text>
          <text x="176" y="28" font-size="12" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">起租 ${row[2]}</text>
          <text x="176" y="50" font-size="12" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">到期 ${row[3]}</text>
          <rect x="470" y="18" width="84" height="34" rx="17" fill="${row[5]}"/>
          <text x="512" y="40" text-anchor="middle" font-size="12" font-weight="700" fill="${row[6]}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[4]}</text>
        </g>
      `).join('')}
    </g>

    <g transform="translate(946 360)">
      <rect width="372" height="400" rx="28" fill="#17191d"/>
      <text x="30" y="42" font-size="20" font-weight="700" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">AI 截图录单</text>
      <text x="30" y="68" font-size="13" font-weight="500" fill="rgba(255,255,255,0.66)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">截图识别后直接进入订单流程</text>

      <rect x="28" y="106" width="316" height="118" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.08)"/>
      <text x="50" y="144" font-size="15" font-weight="700" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">识别结果</text>
      <text x="50" y="178" font-size="13" font-weight="500" fill="rgba(255,255,255,0.72)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">客户：王旭</text>
      <text x="50" y="202" font-size="13" font-weight="500" fill="rgba(255,255,255,0.72)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">设备：AR0-DS09</text>

      <rect x="28" y="254" width="316" height="118" rx="24" fill="#ffffff"/>
      <text x="50" y="292" font-size="15" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">自动字段</text>
      <text x="50" y="326" font-size="13" font-weight="500" fill="#6a7380" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">发货日期、起租日、到期日可直接带入</text>
      <rect x="50" y="340" width="108" height="16" rx="8" fill="#d9eaff"/>
      <rect x="166" y="340" width="74" height="16" rx="8" fill="#eceff4"/>
    </g>
  `

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
      <rect width="1600" height="1000" fill="#f4f5f0"/>
      <rect x="54" y="78" width="1492" height="844" rx="46" fill="#e8ebe4"/>
      <g transform="translate(120,120)">
        ${appWindow({
          title: 'ARO 仓序',
          subtitle: '设备租赁与订单协作',
          content: `${sidebar}${cards}`
        })}
      </g>
    </svg>
  `
}

function ordersSvg() {
  const rows = [
    ['待发货', '#fff0e2', '#d57022', '王旭', 'FX6 机身', '2026-06-24', '2026-06-30', '2026-06-24'],
    ['租用中', '#e8f5ec', '#257f47', '简宁', 'A7S3 套机', '2026-06-22', '2026-06-28', '2026-06-22'],
    ['已转寄', '#edf2ff', '#3c5fd4', '周禾', '灯光套装', '2026-06-25', '2026-07-02', '2026-06-25'],
    ['待归还', '#fff7da', '#b48807', '沈遥', '监视器', '2026-06-20', '2026-06-26', '2026-06-20']
  ]

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
      <rect width="1440" height="960" fill="#f4f5f0"/>
      <g transform="translate(84,86)">
        ${appWindow({
          title: '订单管理',
          subtitle: '租期、发货与设备状态联动',
          width: 1272,
          height: 788,
          content: `
            <rect x="0" y="56" width="248" height="732" fill="#f5f6f2"/>
            <text x="28" y="102" font-size="30" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">订单筛选</text>
            ${[
              ['今天待发货', '#eef4ff', '#0a84ff'],
              ['即将到期', '#ffffff', '#5f6976'],
              ['租用中', '#ffffff', '#5f6976'],
              ['已归还', '#ffffff', '#5f6976']
            ].map((item, index) => `
              <rect x="18" y="${132 + index * 68}" width="212" height="52" rx="16" fill="${item[1]}" stroke="rgba(17,25,35,0.06)"/>
              <text x="36" y="${164 + index * 68}" font-size="14" font-weight="700" fill="${item[2]}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
            `).join('')}

            <text x="280" y="104" font-size="34" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">起租日、到期日、发货日直接显示在列表中</text>
            <text x="280" y="134" font-size="15" font-weight="500" fill="#6f7986" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">录单、发货、归还和设备状态会在同一视图里连续更新。</text>

            <g transform="translate(280,172)">
              <rect width="640" height="524" rx="26" fill="#ffffff" stroke="rgba(17,25,35,0.07)"/>
              <text x="26" y="36" font-size="12" font-weight="700" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">客户</text>
              <text x="180" y="36" font-size="12" font-weight="700" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">设备</text>
              <text x="320" y="36" font-size="12" font-weight="700" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">起租日</text>
              <text x="428" y="36" font-size="12" font-weight="700" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">到期日</text>
              <text x="536" y="36" font-size="12" font-weight="700" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">发货日</text>
              ${rows.map((row, index) => `
                <g transform="translate(14, ${58 + index * 112})">
                  <rect width="612" height="92" rx="22" fill="#f7f8fb"/>
                  <text x="14" y="32" font-size="16" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[3]}</text>
                  <text x="14" y="56" font-size="12" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[0]}</text>
                  <text x="168" y="46" font-size="14" font-weight="600" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[4]}</text>
                  <text x="306" y="46" font-size="13" font-weight="600" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[5]}</text>
                  <text x="414" y="46" font-size="13" font-weight="600" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[6]}</text>
                  <text x="522" y="46" font-size="13" font-weight="600" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[7]}</text>
                  <rect x="486" y="58" width="108" height="20" rx="10" fill="${row[1]}"/>
                  <text x="540" y="72" text-anchor="middle" font-size="11" font-weight="700" fill="${row[2]}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${row[0]}</text>
                </g>
              `).join('')}
            </g>

            <g transform="translate(946,172)">
              <rect width="298" height="524" rx="26" fill="#17191d"/>
              <text x="24" y="40" font-size="22" font-weight="700" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">订单详情</text>
              <text x="24" y="68" font-size="13" font-weight="500" fill="rgba(255,255,255,0.64)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">客户、设备与租期记录可以直接跟进</text>
              ${[
                ['客户名称', '王旭'],
                ['设备编号', 'FX6-ARO-09'],
                ['起租日期', '2026-06-24'],
                ['到期日期', '2026-06-30'],
                ['发货日期', '2026-06-24']
              ].map((item, index) => `
                <text x="24" y="${128 + index * 78}" font-size="12" font-weight="700" fill="rgba(255,255,255,0.52)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
                <rect x="24" y="${142 + index * 78}" width="250" height="42" rx="14" fill="rgba(255,255,255,0.08)"/>
                <text x="42" y="${169 + index * 78}" font-size="15" font-weight="600" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[1]}</text>
              `).join('')}
            </g>
          `
        })}
      </g>
    </svg>
  `
}

function syncSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
      <rect width="1440" height="960" fill="#f4f5f0"/>
      <g transform="translate(84,86)">
        ${appWindow({
          title: '同步与提醒',
          subtitle: '飞书共享表格 · 企业微信通知 · 云端数据',
          width: 1272,
          height: 788,
          content: `
            <text x="36" y="112" font-size="38" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">把协作留在流程里，而不是散在群聊里</text>
            <text x="36" y="146" font-size="16" font-weight="500" fill="#6f7986" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">发货提醒、到期提醒、库存状态和飞书同步可直接作为团队对外协作出口。</text>

            <g transform="translate(36,196)">
              <rect width="584" height="536" rx="30" fill="#ffffff" stroke="rgba(17,25,35,0.07)"/>
              <text x="28" y="40" font-size="22" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">飞书共享表格同步</text>
              <text x="28" y="68" font-size="13" font-weight="500" fill="#7a8490" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">把订单、租期和客户信息同步到对外共享表格</text>

              <rect x="28" y="102" width="528" height="84" rx="22" fill="#f6f8fc"/>
              <text x="48" y="136" font-size="14" font-weight="700" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">表格连接状态</text>
              <text x="48" y="160" font-size="12" font-weight="500" fill="#6f7986" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">App ID、App Secret、Table ID 已完成绑定</text>
              <rect x="438" y="126" width="94" height="32" rx="16" fill="#e8f5ec"/>
              <text x="485" y="147" text-anchor="middle" font-size="12" font-weight="700" fill="#257f47" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">已连接</text>

              ${[
                ['客户名称', '王旭'],
                ['设备编号', 'FX6-ARO-09'],
                ['起租日期', '2026-06-24'],
                ['到期日期', '2026-06-30'],
                ['发货日期', '2026-06-24']
              ].map((item, index) => `
                <g transform="translate(28, ${216 + index * 58})">
                  <rect width="528" height="44" rx="14" fill="#f8f9fb"/>
                  <text x="18" y="28" font-size="12" font-weight="700" fill="#6f7986" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
                  <text x="248" y="28" font-size="13" font-weight="600" fill="#17191d" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[1]}</text>
                </g>
              `).join('')}
            </g>

            <g transform="translate(652,196)">
              <rect width="584" height="536" rx="30" fill="#17191d"/>
              <text x="30" y="42" font-size="22" font-weight="700" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">企业微信 / 平台微信通知</text>
              <text x="30" y="70" font-size="13" font-weight="500" fill="rgba(255,255,255,0.64)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">把今天待发货、即将到期和库存变化推送给团队</text>

              ${[
                ['09:00', '今日待发货 14 单，需要优先处理 3 单'],
                ['12:10', '即将到期 9 单，其中 2 单将在明天到期'],
                ['16:40', '空闲库存 86 台，可直接安排下批订单']
              ].map((item, index) => `
                <g transform="translate(28, ${110 + index * 126})">
                  <rect width="528" height="100" rx="24" fill="rgba(255,255,255,0.08)"/>
                  <text x="26" y="34" font-size="12" font-weight="700" fill="rgba(255,255,255,0.46)" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[0]}</text>
                  <text x="26" y="70" font-size="16" font-weight="600" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif">${item[1]}</text>
                </g>
              `).join('')}
            </g>
          `
        })}
      </g>
    </svg>
  `
}

async function writePng(name, width, height, svg) {
  const outputPath = join(outDir, name)
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath)
  return { outputPath, width, height }
}

await mkdir(outDir, { recursive: true })
await copyFile(logoSource, join(outDir, 'logo-aro-icon.png'))

const assets = [
  writePng('hero-overview.png', 1600, 1000, heroSvg()),
  writePng('feature-orders.png', 1440, 960, ordersSvg()),
  writePng('feature-sync.png', 1440, 960, syncSvg())
]

const results = await Promise.all(assets)
await writeFile(join(outDir, '.generated.json'), JSON.stringify(results, null, 2))
