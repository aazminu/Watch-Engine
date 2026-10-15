import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { API_URL } from '../config';

interface PricePoint {
  price: number;
  source: string;
  scraped_at: string;
}

const COLORS: Record<string, string> = {
  'Jomashop': '#6366f1',
  'Chrono24': '#f59e0b',
  'Watch Database API': '#3b82f6',
};

export default function PriceChart({ watchId }: { watchId: string }) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/price-history/${watchId}?days=${days}`);
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (err) {
        console.error('Price history error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [watchId, days]);

  if (loading) return null;
  if (data.length === 0) return null;

  // Group by source and build chart-friendly data
  const sources = [...new Set(data.map(d => d.source))];
  const chartData = data.reduce<Record<string, any>[]>((acc, point) => {
    const date = new Date(point.scraped_at).toLocaleDateString();
    let existing = acc.find(d => d.date === date);
    if (!existing) {
      existing = { date };
      acc.push(existing);
    }
    existing[point.source] = point.price;
    return acc;
  }, []);

  return (
    <Section>
      <Header>
        <Title>Price History</Title>
        <TimeButtons>
          {[30, 90, 180, 365].map(d => (
            <TimeBtn key={d} $active={days === d} onClick={() => setDays(d)}>
              {d < 365 ? `${d}d` : '1y'}
            </TimeBtn>
          ))}
        </TimeButtons>
      </Header>
      <ChartWrap>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                background: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '0.85rem',
              }}
              formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, '']}
            />
            {sources.map(source => (
              <Line
                key={source}
                type="monotone"
                dataKey={source}
                stroke={COLORS[source] || '#8b5cf6'}
                strokeWidth={2}
                dot={data.length < 10}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartWrap>
      <Legend>
        {sources.map(source => (
          <LegendItem key={source}>
            <LegendDot style={{ background: COLORS[source] || '#8b5cf6' }} />
            {source}
          </LegendItem>
        ))}
      </Legend>
    </Section>
  );
}

const Section = styled.div`
  margin-top: 2rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px;
  padding: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const Title = styled.h2`
  color: #ffffff;
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'Montserrat', sans-serif;
  margin: 0;
`;

const TimeButtons = styled.div`
  display: flex;
  gap: 0.35rem;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  padding: 0.2rem;
`;

const TimeBtn = styled.button<{ $active: boolean }>`
  padding: 0.35rem 0.75rem;
  background: ${p => p.$active ? 'rgba(255,255,255,0.1)' : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.4)'};
  border: none;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { color: rgba(255,255,255,0.7); }
`;

const ChartWrap = styled.div`
  margin: 0 -0.5rem;
`;

const Legend = styled.div`
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-top: 1rem;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: rgba(255,255,255,0.5);
  font-size: 0.8rem;
  font-weight: 500;
`;

const LegendDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
`;
