import styled from 'styled-components';
import { useState } from 'react';
import { redirectToBilling } from '../lib/billing';

export default function UpgradePrompt({ feature }: { feature: string }) {
  const [pending, setPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setPending(true);
    setBillingError(null);
    const error = await redirectToBilling('create-checkout-session');
    if (error) {
      setBillingError(error);
      setPending(false);
    }
  };

  return (
    <Container>
      <Icon>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      </Icon>
      <Title>Upgrade to Pro</Title>
      <Desc>You've reached the free limit for {feature}. Upgrade to Pro for unlimited access.</Desc>
      <UpgradeBtn onClick={handleUpgrade} disabled={pending}>{pending ? 'Opening checkout…' : 'Upgrade — $8/mo'}</UpgradeBtn>
      {billingError && <BillingError role="alert">{billingError}</BillingError>}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.5rem 2rem;
  text-align: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  gap: 0.75rem;
`;

const Icon = styled.div`
  color: #a5b4fc;
  margin-bottom: 0.25rem;
`;

const Title = styled.h3`
  margin: 0;
  color: #ffffff;
  font-size: 1.2rem;
  font-weight: 700;
  font-family: 'Montserrat', sans-serif;
`;

const Desc = styled.p`
  margin: 0;
  color: rgba(255,255,255,0.45);
  font-size: 0.9rem;
  max-width: 350px;
  line-height: 1.5;
`;

const UpgradeBtn = styled.button`
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(99, 102, 241, 0.5);
  }  &:disabled { opacity: 0.5; cursor: default; }
`;

const BillingError = styled.p`
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: #d98080;
  text-align: center;
`;
