import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { supabase } from '../lib/supabaseClient';
import { useSubscription } from '../contexts/SubscriptionContext';
import UpgradePrompt from './UpgradePrompt';

const FREE_ALERT_LIMIT = 3;

interface Alert {
  id: string;
  target_price: number;
  is_active: boolean;
}

export default function PriceAlertForm({ watchId, currentPrice }: { watchId: string; currentPrice: number | null }) {
  const { isPro } = useSubscription();
  const [targetPrice, setTargetPrice] = useState('');
  const [existingAlert, setExistingAlert] = useState<Alert | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [totalAlerts, setTotalAlerts] = useState(0);

  useEffect(() => {
    const fetchAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('price_alerts')
        .select('id, target_price, is_active')
        .eq('user_id', user.id)
        .eq('watch_id', watchId)
        .maybeSingle();

      if (data) setExistingAlert(data);

      // Count total alerts for free tier limit
      const { count } = await supabase
        .from('price_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setTotalAlerts(count || 0);
    };
    fetchAlert();
  }, [watchId]);

  const handleSetAlert = async () => {
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) return;

    setSaving(true);
    setMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage('Please log in to set alerts'); return; }

      if (existingAlert) {
        const { error } = await supabase
          .from('price_alerts')
          .update({ target_price: price, is_active: true })
          .eq('id', existingAlert.id);
        if (error) throw error;
        setExistingAlert({ ...existingAlert, target_price: price, is_active: true });
      } else {
        const { data, error } = await supabase
          .from('price_alerts')
          .insert({ user_id: user.id, watch_id: watchId, target_price: price })
          .select()
          .single();
        if (error) throw error;
        setExistingAlert(data);
      }
      setMessage('Alert set!');
      setTargetPrice('');
    } catch (err) {
      console.error('Error setting alert:', err);
      setMessage('Failed to set alert');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAlert = async () => {
    if (!existingAlert) return;
    try {
      await supabase.from('price_alerts').delete().eq('id', existingAlert.id);
      setExistingAlert(null);
      setMessage('Alert removed');
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  // Show upgrade prompt if free user is at limit and doesn't have an existing alert for this watch
  if (!isPro && !existingAlert && totalAlerts >= FREE_ALERT_LIMIT) {
    return <UpgradePrompt feature="price alerts" />;
  }

  return (
    <Container>
      <Header>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Price Alert
      </Header>

      {existingAlert ? (
        <AlertActive>
          <AlertInfo>
            <AlertLabel>Alert when price drops below</AlertLabel>
            <AlertPrice>${existingAlert.target_price.toLocaleString()}</AlertPrice>
            {currentPrice && currentPrice <= existingAlert.target_price && (
              <AlertTriggered>Price is already below your target!</AlertTriggered>
            )}
          </AlertInfo>
          <AlertActions>
            <DeleteAlertBtn onClick={handleDeleteAlert}>Remove</DeleteAlertBtn>
          </AlertActions>
        </AlertActive>
      ) : (
        <AlertForm>
          <AlertInput
            type="number"
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
            placeholder={currentPrice ? `e.g. ${Math.round(currentPrice * 0.9)}` : 'Target price'}
          />
          <SetAlertBtn onClick={handleSetAlert} disabled={saving || !targetPrice}>
            {saving ? 'Setting...' : 'Set Alert'}
          </SetAlertBtn>
        </AlertForm>
      )}

      {message && <Message>{message}</Message>}
    </Container>
  );
}

const Container = styled.div`
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 14px;
  padding: 1.25rem;
  margin-top: 1rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #a5b4fc;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
`;

const AlertForm = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const AlertInput = styled.input`
  flex: 1;
  padding: 0.6rem 0.85rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 0.9rem;
  font-family: 'Montserrat', sans-serif;

  &:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.5);
  }
  &::placeholder { color: rgba(255,255,255,0.25); }
`;

const SetAlertBtn = styled.button`
  padding: 0.6rem 1.2rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover { transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;

const AlertActive = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const AlertInfo = styled.div``;

const AlertLabel = styled.div`
  color: rgba(255,255,255,0.4);
  font-size: 0.75rem;
`;

const AlertPrice = styled.div`
  color: #a5b4fc;
  font-size: 1.2rem;
  font-weight: 700;
  margin-top: 0.15rem;
`;

const AlertTriggered = styled.div`
  color: #4ade80;
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 0.25rem;
`;

const AlertActions = styled.div``;

const DeleteAlertBtn = styled.button`
  padding: 0.4rem 0.8rem;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: rgba(239, 68, 68, 0.2); }
`;

const Message = styled.div`
  color: rgba(255,255,255,0.5);
  font-size: 0.8rem;
  margin-top: 0.5rem;
  text-align: center;
`;
