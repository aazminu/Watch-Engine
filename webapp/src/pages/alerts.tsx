import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import Navbar from '../components/navbar';
import { supabase } from '../lib/supabaseClient';
import { getImageUrl } from '../lib/imageUtils';

interface Alert {
  id: string;
  watch_id: string;
  target_price: number;
  is_active: boolean;
  created_at: string;
  watch: {
    id: string;
    model_name: string;
    family_name: string;
    price_eur: number | null;
    image_url: string;
  } | null;
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data, error } = await supabase
        .from('price_alerts')
        .select('id, watch_id, target_price, is_active, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const watchIds = data.map(a => a.watch_id);
        const { data: watches } = await supabase
          .from('watches')
          .select('id, model_name, family_name, price_eur, image_url')
          .in('id', watchIds);

        const watchMap = new Map((watches || []).map(w => [w.id, w]));
        setAlerts(data.map(a => ({ ...a, watch: watchMap.get(a.watch_id) || null })));
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  }

  const toggleAlert = async (alertId: string, isActive: boolean) => {
    try {
      await supabase.from('price_alerts').update({ is_active: !isActive }).eq('id', alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_active: !isActive } : a));
    } catch (err) {
      console.error('Error toggling alert:', err);
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      await supabase.from('price_alerts').delete().eq('id', alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  if (loading) return <LoadingScreen>Loading alerts...</LoadingScreen>;

  return (
    <Container>
      <Navbar />
      <Content>
        <PageHeader>
          <PageTitle>Price Alerts</PageTitle>
          <AlertCount>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</AlertCount>
        </PageHeader>

        {alerts.length === 0 ? (
          <EmptyState>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <EmptyTitle>No price alerts yet</EmptyTitle>
            <EmptyHint>Set alerts from any watch detail page to get notified when prices drop.</EmptyHint>
            <BrowseBtn onClick={() => navigate('/')}>Search Watches</BrowseBtn>
          </EmptyState>
        ) : (
          <AlertList>
            {alerts.map(alert => (
              <AlertCard key={alert.id} $inactive={!alert.is_active}>
                <AlertImage
                  src={alert.watch ? getImageUrl(alert.watch.image_url) : '/placeholder.jpg'}
                  alt={alert.watch?.model_name || ''}
                  onClick={() => alert.watch && navigate(`/watch/${alert.watch.id}`)}
                />
                <AlertInfo>
                  <AlertName onClick={() => alert.watch && navigate(`/watch/${alert.watch.id}`)}>
                    {alert.watch?.model_name || 'Unknown Watch'}
                  </AlertName>
                  <AlertFamily>{alert.watch?.family_name}</AlertFamily>
                  <AlertPrices>
                    <PriceLabel>
                      Target: <PriceValue>${alert.target_price.toLocaleString()}</PriceValue>
                    </PriceLabel>
                    <PriceLabel>
                      Current: <PriceValue $current>
                        {alert.watch?.price_eur ? `$${alert.watch.price_eur.toLocaleString()}` : 'N/A'}
                      </PriceValue>
                    </PriceLabel>
                    {alert.watch?.price_eur && alert.watch.price_eur <= alert.target_price && (
                      <TriggeredBadge>Below target!</TriggeredBadge>
                    )}
                  </AlertPrices>
                </AlertInfo>
                <AlertControls>
                  <ToggleBtn $active={alert.is_active} onClick={() => toggleAlert(alert.id, alert.is_active)}>
                    {alert.is_active ? 'Active' : 'Paused'}
                  </ToggleBtn>
                  <DeleteBtn onClick={() => deleteAlert(alert.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </DeleteBtn>
                </AlertControls>
              </AlertCard>
            ))}
          </AlertList>
        )}
      </Content>
    </Container>
  );
}

const Container = styled.div`
  min-height: 100vh;
  background: #0a0a0a;
  font-family: 'Inter', sans-serif;
`;

const Content = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 2rem 4rem;
`;

const LoadingScreen = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.4);
  background: #0a0a0a;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const PageTitle = styled.h1`
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-size: 1.6rem;
  font-weight: 400;
  margin: 0;
`;

const AlertCount = styled.span`
  color: rgba(255,255,255,0.35);
  font-size: 0.9rem;
  font-weight: 500;
  background: rgba(255,255,255,0.05);
  padding: 0.3rem 0.8rem;
  border-radius: 8px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4rem 2rem;
  text-align: center;
  gap: 0.75rem;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 12px;
`;

const EmptyTitle = styled.p`
  margin: 0;
  color: #666;
  font-size: 1rem;
  font-weight: 500;
`;

const EmptyHint = styled.p`
  margin: 0;
  color: rgba(255,255,255,0.25);
  font-size: 0.9rem;
  max-width: 350px;
  line-height: 1.5;
`;

const BrowseBtn = styled.button`
  padding: 0.6rem 1.5rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`;

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const AlertCard = styled.div<{ $inactive: boolean }>`
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px;
  opacity: ${p => p.$inactive ? 0.5 : 1};
  transition: all 0.2s;

  &:hover {
    border-color: rgba(255,255,255,0.12);
  }
`;

const AlertImage = styled.img`
  width: 70px;
  height: 70px;
  border-radius: 10px;
  object-fit: cover;
  cursor: pointer;
  flex-shrink: 0;
`;

const AlertInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const AlertName = styled.div`
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover { text-decoration: underline; }
`;

const AlertFamily = styled.div`
  color: rgba(255,255,255,0.35);
  font-size: 0.8rem;
  margin-top: 0.15rem;
`;

const AlertPrices = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 0.5rem;
`;

const PriceLabel = styled.span`
  color: rgba(255,255,255,0.35);
  font-size: 0.8rem;
`;

const PriceValue = styled.span<{ $current?: boolean }>`
  color: ${p => p.$current ? '#4ade80' : '#a5b4fc'};
  font-weight: 700;
`;

const TriggeredBadge = styled.span`
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
`;

const AlertControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 0.4rem 0.8rem;
  background: ${p => p.$active ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.05)'};
  color: ${p => p.$active ? '#4ade80' : 'rgba(255,255,255,0.35)'};
  border: 1px solid ${p => p.$active ? 'rgba(74, 222, 128, 0.25)' : 'rgba(255,255,255,0.08)'};
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
`;

const DeleteBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255,255,255,0.2);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  display: flex;
  transition: all 0.15s;
  &:hover { color: #f87171; background: rgba(239, 68, 68, 0.1); }
`;
