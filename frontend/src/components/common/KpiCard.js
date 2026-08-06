import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  subtitle = 'vs last period', 
  onClick, 
  sparklineData = [10, 15, 8, 22, 18, 28, 24],
  accentColor = 'brand'
}) {
  const colorMap = {
    brand: {
      bg: 'bg-brand-50 dark:bg-brand-950/40',
      text: 'text-brand-600 dark:text-brand-400',
      border: 'hover:border-brand-300 dark:hover:border-brand-700',
      sparkline: '#0070c7'
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'hover:border-emerald-300 dark:hover:border-emerald-700',
      sparkline: '#10b981'
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'hover:border-amber-300 dark:hover:border-amber-700',
      sparkline: '#f59e0b'
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'hover:border-rose-300 dark:hover:border-rose-700',
      sparkline: '#ef4444'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'hover:border-purple-300 dark:hover:border-purple-700',
      sparkline: '#8b5cf6'
    }
  };

  const scheme = colorMap[accentColor] || colorMap.brand;

  // Simple SVG Sparkline points calculation
  const max = Math.max(...sparklineData, 1);
  const min = Math.min(...sparklineData, 0);
  const range = max - min || 1;
  const points = sparklineData
    .map((val, idx) => {
      const x = (idx / (sparklineData.length - 1)) * 100;
      const y = 30 - ((val - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div 
      onClick={onClick}
      className={`group relative p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer overflow-hidden ${scheme.border}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
            {value}
          </div>
        </div>
        <div className={`p-2.5 rounded-xl ${scheme.bg} ${scheme.text} transition-transform group-hover:scale-110 duration-200`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
      </div>

      <div className="flex items-end justify-between mt-4">
        {/* Trend Info */}
        <div className="flex items-center gap-1.5 text-xs">
          {trend === 'up' && (
            <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              {trendValue}
            </span>
          )}
          {trend === 'down' && (
            <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              {trendValue}
            </span>
          )}
          {trend === 'neutral' && (
            <span className="flex items-center gap-0.5 text-slate-500 font-medium">
              <Minus className="w-3.5 h-3.5" />
              {trendValue || '0%'}
            </span>
          )}
          <span className="text-slate-400 dark:text-slate-500 text-[11px] truncate max-w-[100px]">{subtitle}</span>
        </div>

        {/* Mini SVG Sparkline */}
        <div className="w-20 h-8">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
            <polyline
              fill="none"
              stroke={scheme.sparkline}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
