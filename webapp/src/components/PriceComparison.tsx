import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { API_URL } from '../config';

interface Listing {
  id: string;
  reference: string;
  model_name: string;
  price_eur: number;
  source: string;
  image_url: string;
}

export default function PriceComparison({ watchId }: { watchId: string }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(`${API_URL}/api/price-comparison/${watchId}`);
        const result = await res.json();
        if (result.success && result.data?.length > 1) {
          setListings(result.data);
        }
      } catch (err) {
        console.error('Price comparison error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrices();
  }, [watchId]);

  if (loading || listings.length < 2) return null;

  const lowest = listings[0].price_eur;

  return (
    <Section>
      <Header>Compare Prices</Header>
      <CardRow>
        {listings.map((listing, i) => (
          <Card key={listing.id} $isLowest={i === 0}>
            {i === 0 && <LowestBadge>Lowest</LowestBadge>}
            <SourceName>{listing.source || 'Unknown'}</SourceName>
            <Price $isLowest={i === 0}>${listing.price_eur.toLocaleString()}</Price>
            {i > 0 && (
              <PriceDiff>+${(listing.price_eur - lowest).toLocaleString()} more</PriceDiff>
            )}
          </Card>
        ))}
      </CardRow>
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

const Header = styled.h2`
  color: #ffffff;
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'Montserrat', sans-serif;
  margin: 0 0 1.25rem;
`;

const CardRow = styled.div`
  display: flex;
  gap: 1rem;
  overflow-x: auto;
`;

const Card = styled.div<{ $isLowest: boolean }>`
  flex: 1;
  min-width: 160px;
  padding: 1.25rem;
  background: ${p => p.$isLowest ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255,255,255,0.03)'};
  border: 1px solid ${p => p.$isLowest ? 'rgba(74, 222, 128, 0.25)' : 'rgba(255,255,255,0.06)'};
  border-radius: 14px;
  position: relative;
  text-align: center;
`;

const LowestBadge = styled.span`
  position: absolute;
  top: -0.5rem;
  right: 0.75rem;
  background: #4ade80;
  color: #052e16;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const SourceName = styled.div`
  color: rgba(255,255,255,0.5);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const Price = styled.div<{ $isLowest: boolean }>`
  color: ${p => p.$isLowest ? '#4ade80' : '#ffffff'};
  font-size: 1.3rem;
  font-weight: 700;
  font-family: 'Montserrat', sans-serif;
`;

const PriceDiff = styled.div`
  color: rgba(255,255,255,0.3);
  font-size: 0.75rem;
  margin-top: 0.3rem;
`;
