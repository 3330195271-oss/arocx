interface StatsRowProps {
  sameCity: number
  sameProvince: number
  adjacentProvince: number
}

export function StatsRow({ sameCity, sameProvince, adjacentProvince }: StatsRowProps): JSX.Element {
  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-card__value" style={{ color: '#2e7d32' }}>{sameCity}</div>
        <div className="stat-card__label">同市</div>
      </div>
      <div className="stat-card">
        <div className="stat-card__value" style={{ color: '#1565c0' }}>{sameProvince}</div>
        <div className="stat-card__label">同省</div>
      </div>
      <div className="stat-card">
        <div className="stat-card__value" style={{ color: '#e65100' }}>{adjacentProvince}</div>
        <div className="stat-card__label">邻省 ⚠</div>
      </div>
      <div className="stat-card">
        <div className="stat-card__value">{sameCity + sameProvince + adjacentProvince}</div>
        <div className="stat-card__label">总计可转寄</div>
      </div>
    </div>
  )
}
