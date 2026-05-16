import { useMemo } from 'react';
import type { StudyDashboardStats } from '../studyLibrary';
import { studyDashboardStats, STUDY_SUBJECT_LABELS } from '../studyLibrary';
import type { StudyItem } from '../uiTypes';

export interface DashboardPanelProps {
  studyItems: StudyItem[];
}

function StatCard({ label, value, wide }: { label: string; value: string | number; wide?: boolean }): JSX.Element {
  return (
    <div className={`study-dashboard-card${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HorizontalBar({ items, maxCount }: { items: Array<{ label: string; count: number }>; maxCount: number }): JSX.Element {
  return (
    <div className="dashboard-bar-chart">
      {items.map((item) => (
        <div className="dashboard-bar-row" key={item.label}>
          <span className="dashboard-bar-label">{item.label}</span>
          <div className="dashboard-bar-track">
            <div
              className="dashboard-bar-fill"
              style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
            />
          </div>
          <span className="dashboard-bar-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function SubjectRadar({ stats }: { stats: StudyDashboardStats }): JSX.Element | null {
  const subjects = stats.subjectCounts;

  if (subjects.length < 3) {
    return null;
  }

  const size = 140;
  const center = size / 2;
  const radius = 54;
  const n = subjects.length;
  const maxCount = Math.max(...subjects.map((s) => s.count), 1);

  const axisPoints = subjects.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });

  const dataPoints = subjects.map((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (s.count / maxCount) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  });

  const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="study-dashboard-card wide">
      <span>学科分布</span>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ margin: '0 auto' }}>
        {[0.33, 0.66, 1].map((scale) => (
          <polygon
            key={scale}
            points={axisPoints.map((p) => `${center + (p.x - center) * scale},${center + (p.y - center) * scale}`).join(' ')}
            fill="none"
            stroke="var(--color-border-card)"
            strokeWidth="1"
          />
        ))}
        {axisPoints.map((p, i) => (
          <g key={subjects[i].subject}>
            <line x1={center} y1={center} x2={p.x} y2={p.y} stroke="var(--color-border-card)" strokeWidth="1" />
            <text
              x={p.x + (p.x - center) * 0.15}
              y={p.y + (p.y - center) * 0.15}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill="var(--color-text-muted)"
            >
              {STUDY_SUBJECT_LABELS[subjects[i].subject]}
            </text>
          </g>
        ))}
        <polygon points={polygon} fill="var(--color-primary)" fillOpacity="0.2" stroke="var(--color-primary)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function DashboardPanel({ studyItems }: DashboardPanelProps): JSX.Element {
  const stats = useMemo(() => studyDashboardStats(studyItems), [studyItems]);
  const maxKp = useMemo(() => Math.max(...stats.topKnowledgePoints.map((k) => k.count), 1), [stats.topKnowledgePoints]);
  const maxMt = useMemo(() => Math.max(...stats.topMistakeTraps.map((m) => m.count), 1), [stats.topMistakeTraps]);

  if (studyItems.length === 0) {
    return (
      <div className="history-page">
        <div className="history-page-header">
          <div>
            <strong>数据统计</strong>
            <span>学习库中没有记录，添加学习记录后可查看统计数据。</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="history-page-header">
        <div>
          <strong>数据统计</strong>
          <span>基于学习库中 {stats.total} 条记录的分析。</span>
        </div>
      </div>
      <div className="study-dashboard">
        <StatCard label="总题数" value={stats.total} />
        <StatCard label="待复习" value={stats.due} />
        <StatCard label="错题" value={stats.mistakes} />
        <StatCard label="掌握率" value={`${stats.masteredRate}%`} />
        <StatCard label="近7天复习" value={stats.reviewedLast7Days} />
        <StatCard label="学科数" value={stats.subjectCounts.length} />
      </div>
      <SubjectRadar stats={stats} />
      {stats.topKnowledgePoints.length > 0 && (
        <div className="study-dashboard-card wide">
          <span>高频知识点 Top 5</span>
          <HorizontalBar items={stats.topKnowledgePoints} maxCount={maxKp} />
        </div>
      )}
      {stats.topMistakeTraps.length > 0 && (
        <div className="study-dashboard-card wide">
          <span>高频易错点 Top 5</span>
          <HorizontalBar items={stats.topMistakeTraps} maxCount={maxMt} />
        </div>
      )}
    </div>
  );
}
