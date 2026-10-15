import styled from 'styled-components';
import Navbar from '../components/navbar';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useState } from 'react';
import { redirectToBilling } from '../lib/billing';

export default function Pricing() {
  const { isPro } = useSubscription();

  const [pending, setPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const openBilling = async (endpoint: 'create-checkout-session' | 'create-portal-session') => {
    setPending(true);
    setBillingError(null);
    const error = await redirectToBilling(endpoint);
    // On success the page is navigating away, so keep the button disabled
    if (error) {
      setBillingError(error);
      setPending(false);
    }
  };

  return (
    <Container>
      <Navbar />
      <Content>
        <PageTitle>Choose Your Plan</PageTitle>
        <PageSubtitle>Unlock the full power of Watch Engine</PageSubtitle>

        <PlanGrid>
          {/* Free Plan */}
          <PlanCard>
            <PlanName>Free</PlanName>
            <PlanPrice>$0<PlanPeriod>/month</PlanPeriod></PlanPrice>
            <PlanDesc>Get started with the basics</PlanDesc>
            <FeatureList>
              <Feature $included>Semantic watch search</Feature>
              <Feature $included>Similar watch recommendations</Feature>
              <Feature $included>10 searches per day</Feature>
              <Feature $included>3 price alerts</Feature>
              <Feature $included>5 collection slots</Feature>
              <Feature $included>Favorites & lists</Feature>
              <Feature>Price history charts</Feature>
              <Feature>Unlimited alerts</Feature>
              <Feature>Unlimited collection</Feature>
              <Feature>Priority support</Feature>
            </FeatureList>
            {!isPro && <CurrentBadge>Current Plan</CurrentBadge>}
          </PlanCard>

          {/* Pro Plan */}
          <PlanCard $highlighted>
            <PopularBadge>Most Popular</PopularBadge>
            <PlanName>Pro</PlanName>
            <PlanPrice>$8<PlanPeriod>/month</PlanPeriod></PlanPrice>
            <PlanDesc>Everything you need for serious collecting</PlanDesc>
            <FeatureList>
              <Feature $included>Semantic watch search</Feature>
              <Feature $included>Similar watch recommendations</Feature>
              <Feature $included>Unlimited searches</Feature>
              <Feature $included>Unlimited price alerts</Feature>
              <Feature $included>Unlimited collection</Feature>
              <Feature $included>Favorites & lists</Feature>
              <Feature $included>Price history charts</Feature>
              <Feature $included>Price comparison across sources</Feature>
              <Feature $included>Collection value tracking</Feature>
              <Feature $included>Priority support</Feature>
            </FeatureList>
            {isPro ? (
              <ManageBtn onClick={() => openBilling('create-portal-session')} disabled={pending}>{pending ? 'Opening…' : 'Manage Subscription'}</ManageBtn>
            ) : (
              <UpgradeBtn onClick={() => openBilling('create-checkout-session')} disabled={pending}>{pending ? 'Opening checkout…' : 'Upgrade to Pro'}</UpgradeBtn>
            )}
            {billingError && <BillingError role="alert">{billingError}</BillingError>}
          </PlanCard>
        </PlanGrid>
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
  max-width: 800px;
  margin: 0 auto;
  padding: 3rem 2rem 5rem;
  text-align: center;
`;
const PageTitle = styled.h1`
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-size: 2rem;
  font-weight: 400;
  margin: 0 0 0.4rem;
`;
const PageSubtitle = styled.p`
  color: #444;
  font-size: 0.9rem;
  margin: 0 0 3rem;
`;
const PlanGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #1e1e1e;
  border: 1px solid #1e1e1e;
  border-radius: 12px;
  overflow: hidden;
  text-align: left;
  @media (max-width: 700px) { grid-template-columns: 1fr; }
`;
const PlanCard = styled.div<{ $highlighted?: boolean }>`
  background: ${p => p.$highlighted ? '#111' : '#0a0a0a'};
  padding: 2.5rem;
  position: relative;
  display: flex;
  flex-direction: column;
`;
const PopularBadge = styled.span`
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  background: #f5f5f0;
  color: #0a0a0a;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;
const PlanName = styled.h2`
  color: #e8e8e3;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
`;
const PlanPrice = styled.div`
  color: #f5f5f0;
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 0.4rem;
`;
const PlanPeriod = styled.span`
  font-size: 0.9rem;
  font-weight: 400;
  color: #444;
`;
const PlanDesc = styled.p`
  color: #444;
  font-size: 0.85rem;
  margin: 0 0 1.5rem;
`;
const FeatureList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  margin-bottom: 1.5rem;
`;
const Feature = styled.div<{ $included?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${p => p.$included ? '#888' : '#2a2a2a'};
  font-size: 0.8rem;
  font-weight: 400;
  &::before {
    content: '${p => p.$included ? '\\2713' : '\\2717'}';
    color: ${p => p.$included ? '#e8e8e3' : '#222'};
    font-size: 0.75rem;
    width: 16px;
    text-align: center;
  }
`;
const CurrentBadge = styled.div`
  text-align: center;
  padding: 0.7rem;
  border: 1px solid #1e1e1e;
  color: #444;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
`;
const UpgradeBtn = styled.button`
  width: 100%;
  padding: 0.85rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }  &:disabled { opacity: 0.5; cursor: default; }
`;
const ManageBtn = styled.button`
  width: 100%;
  padding: 0.85rem;
  background: transparent;
  color: #888;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: #333; color: #ccc; }  &:disabled { opacity: 0.5; cursor: default; }
`;

const BillingError = styled.p`
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: #d98080;
  text-align: center;
`;
