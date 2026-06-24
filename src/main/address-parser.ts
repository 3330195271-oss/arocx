import type { AddressParts } from '../types/customer'

const PROVINCES = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '香港', '澳门'
]

const STREET_SUFFIXES = ['街道', '镇', '乡', '新区']

export function parseAddress(address: string): AddressParts {
  const result: AddressParts = {
    province: '',
    city: '',
    district: '',
    street: '',
    detail: ''
  }

  // Clean: remove leading dashes/spaces, normalize separator
  let remaining = address.trim().replace(/^[-.\s]+/, '')

  // Handle dash-separated format: split by dash for cleaner parsing
  if (remaining.includes('-') && remaining.split('-').length >= 3) {
    return parseDashFormat(remaining)
  }

  // Extract province
  for (const prov of PROVINCES) {
    if (remaining.startsWith(prov)) {
      result.province = prov
      remaining = remaining.slice(prov.length)
      if (remaining.startsWith('省')) remaining = remaining.slice(1)
      break
    }
  }

  // Extract city
  const cityMatch = remaining.match(/^([一-龥]+?)市/)
  if (cityMatch) {
    result.city = cityMatch[1] + '市'
    remaining = remaining.slice(cityMatch[0].length)
  }

  // Extract district
  const districtMatch = remaining.match(/^([一-龥]+?)[区县]/)
  if (districtMatch) {
    result.district = districtMatch[1] + remaining.charAt(districtMatch[0].length - 1)
    remaining = remaining.slice(districtMatch[0].length)
  }

  // Extract street
  for (const suffix of STREET_SUFFIXES) {
    const m = remaining.match(new RegExp(`^([一-龥]+?)${suffix}`))
    if (m) {
      result.street = m[1] + suffix
      remaining = remaining.slice(m[0].length)
      break
    }
  }

  result.detail = remaining
  return result
}

function parseDashFormat(address: string): AddressParts {
  const result: AddressParts = { province: '', city: '', district: '', street: '', detail: '' }
  const parts = address.split('-').map(p => p.trim()).filter(p => p)

  for (const part of parts) {
    // Check province
    if (!result.province) {
      for (const prov of PROVINCES) {
        if (part === prov || part === prov + '省' || part === prov + '市') {
          result.province = prov
          if (part.endsWith('市')) result.city = part
          continue
        }
      }
      if (result.province) continue
    }

    // Check city
    if (!result.city && part.endsWith('市')) {
      result.city = part
      continue
    }

    // Check district
    if (!result.district && (part.endsWith('区') || part.endsWith('县'))) {
      result.district = part
      continue
    }

    // Check street
    if (!result.street) {
      for (const suffix of STREET_SUFFIXES) {
        if (part.endsWith(suffix)) {
          result.street = part
          break
        }
      }
      if (result.street) continue
    }

    // Remaining goes to detail
    result.detail = result.detail ? `${result.detail} ${part}` : part
  }

  return result
}

export function getAddressLevel(parts: AddressParts): 'street' | 'district' | 'city' | 'province' | 'none' {
  if (parts.street) return 'street'
  if (parts.district) return 'district'
  if (parts.city) return 'city'
  if (parts.province) return 'province'
  return 'none'
}
