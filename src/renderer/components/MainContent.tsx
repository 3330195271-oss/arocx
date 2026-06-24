import type { ExpiringCustomer } from '../types/customer'
import { ForwardingList } from './ForwardingList'
import { StatsRow } from './StatsRow'

interface MainContentProps {
  customer: ExpiringCustomer | null
  hasData: boolean
}

export function MainContent({ customer, hasData }: MainContentProps): JSX.Element {
  if (!hasData) {
    return (
      <div className="main-content__empty">
        <div className="main-content__empty-icon">📋</div>
        <div className="main-content__empty-title">暂无数据</div>
        <div className="main-content__empty-text">
          点击「打开共享表格」下载最新数据，保存到指定路径后点击「读取数据」。
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="main-content__empty">
        <div className="main-content__empty-icon">✅</div>
        <div className="main-content__empty-title">今日无到期客户</div>
        <div className="main-content__empty-text">
          所有客户均未到期，无需进行转寄操作。
        </div>
      </div>
    )
  }

  const sameCity = customer.forwardingOptions.filter((o) => o.matchLevel === 'same_city').length
  const sameProvince = customer.forwardingOptions.filter((o) => o.matchLevel === 'same_province').length
  const adjacentProvince = customer.forwardingOptions.filter((o) => o.matchLevel === 'adjacent_province').length

  return (
    <>
      <div className="main-content__header">
        <div className="main-content__title">
          {customer.name} 的转寄推荐
        </div>
      </div>

      <StatsRow
        sameCity={sameCity}
        sameProvince={sameProvince}
        adjacentProvince={adjacentProvince}
      />

      <ForwardingList
        options={customer.forwardingOptions}
        sourceName={customer.name}
        sourcePhone={customer.phone}
      />
    </>
  )
}
