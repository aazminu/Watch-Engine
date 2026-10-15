import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import Footer from '../components/footer';
import styled, { keyframes } from 'styled-components';
import { API_URL } from '../config';
import { getImageUrl } from '../lib/imageUtils';

interface Watch {
  id: string;
  reference: string;
  model_name: string;
  family_name: string;
  movement_name: string | null;
  function_name: string | null;
  year_produced: string;
  limited_edition: string | null;
  price_eur: number | null;
  image_url: string;
  image_filename: string | null;
  description: string | null;
  dial_color: string | null;
  source: string | null;
  brand_id: number;
  similarity?: number;
}

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') searchWatches();
  };

  const searchWatches = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setWatches([]);
    setHasSearched(true);

    try {
      const response = await fetch(`${API_URL}/api/hybrid-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();

      if (result.success && result.data?.length > 0) {
        setWatches(result.data);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      } else {
        setError('No results found. Try a different description.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Navbar />

      <Hero $shrink={hasSearched}>
        <HeroInner>
          <Headline>
            The watch you're
            <br />looking for.
          </Headline>
          <Sub>Search 42,000+ watches by describing what you want.</Sub>

          <SearchBar>
            <SearchIcon>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </SearchIcon>
            <Input
              ref={inputRef}
              type="text"
              placeholder="Blue diving watch under $5,000..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <GoBtn onClick={searchWatches} disabled={loading}>
                {loading ? <Dot /> : 'Search'}
              </GoBtn>
            )}
          </SearchBar>

          {!hasSearched && (
            <Suggestions>
              {['chronograph under $3,000', 'dress watch with moonphase', 'rugged field watch', 'vintage diver'].map(s => (
                <Pill key={s} onClick={() => { setQuery(s); inputRef.current?.focus(); }}>{s}</Pill>
              ))}
            </Suggestions>
          )}
        </HeroInner>
      </Hero>

      {/* Results */}
      <Results ref={resultsRef}>
        {error && <ErrorMsg>{error}</ErrorMsg>}

        {loading && (
          <LoadWrap>
            <Dot />
            <LoadText>Searching...</LoadText>
          </LoadWrap>
        )}

        {watches.length > 0 && (
          <>
            <ResultsMeta>{watches.length} results</ResultsMeta>
            <Grid>
              {watches.map((w, i) => (
                <Card key={w.id} onClick={() => navigate(`/watch/${w.id}`)} style={{ animationDelay: `${i * 40}ms` }}>
                  <ImgWrap>
                    <Img src={getImageUrl(w.image_url)} alt={w.model_name} loading="lazy" />
                    {w.limited_edition && <Ltd>Limited</Ltd>}
                  </ImgWrap>
                  <Body>
                    <Model>{w.model_name}</Model>
                    <Family>{w.family_name}</Family>
                    <Bottom>
                      <Tags>
                        {w.year_produced && <Tag>{w.year_produced}</Tag>}
                        {w.dial_color && <Tag>{w.dial_color}</Tag>}
                      </Tags>
                      {w.price_eur && <Price>${w.price_eur.toLocaleString()}</Price>}
                    </Bottom>
                  </Body>
                </Card>
              ))}
            </Grid>
          </>
        )}
      </Results>

      <Footer />
    </Page>
  );
}

/* ═══ Animations ═══ */

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
`;

/* ═══ Layout ═══ */

const Page = styled.div`
  min-height: 100vh;
  background: #0a0a0a;
  color: #e8e8e3;
  font-family: 'Inter', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
`;

const Hero = styled.section<{ $shrink: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${p => p.$shrink ? '30vh' : '75vh'};
  padding: 2rem;
  transition: min-height 0.5s ease;
`;

const HeroInner = styled.div`
  text-align: center;
  max-width: 640px;
  width: 100%;
  animation: ${fadeIn} 0.6s ease-out;
`;

const Headline = styled.h1`
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(2.4rem, 5vw, 3.8rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #f5f5f0;
  margin: 0 0 1.2rem;
`;

const Sub = styled.p`
  font-size: 0.95rem;
  color: #5a5a5a;
  font-weight: 400;
  margin: 0 0 2.5rem;
  letter-spacing: 0.01em;
`;

/* ═══ Search ═══ */

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 12px;
  padding: 0.2rem 0.3rem 0.2rem 1rem;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: #333;
  }
`;

const SearchIcon = styled.div`
  color: #3a3a3a;
  flex-shrink: 0;
  display: flex;
`;

const Input = styled.input`
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #e8e8e3;
  font-size: 0.95rem;
  padding: 0.85rem 0.75rem;
  font-family: inherit;

  &::placeholder {
    color: #3a3a3a;
  }
`;

const GoBtn = styled.button`
  padding: 0.6rem 1.3rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 9px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const Suggestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 1.4rem;
`;

const Pill = styled.button`
  padding: 0.4rem 0.9rem;
  background: transparent;
  border: 1px solid #1e1e1e;
  border-radius: 20px;
  color: #4a4a4a;
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: #999;
    border-color: #333;
  }
`;

/* ═══ Results ═══ */

const Results = styled.div`
  max-width: 1300px;
  margin: 0 auto;
  padding: 0 2rem 5rem;
`;

const ErrorMsg = styled.div`
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 0.9rem;
`;

const LoadWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 3rem 0;
`;

const Dot = styled.div`
  width: 6px;
  height: 6px;
  background: #555;
  border-radius: 50%;
  animation: ${pulse} 1s ease-in-out infinite;
`;

const LoadText = styled.span`
  color: #444;
  font-size: 0.85rem;
`;

const ResultsMeta = styled.div`
  font-size: 0.7rem;
  color: #3a3a3a;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 500;
  margin-bottom: 1.5rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1px;
  background: #151515;
  border: 1px solid #151515;
  border-radius: 12px;
  overflow: hidden;
`;

const Card = styled.div`
  background: #0a0a0a;
  cursor: pointer;
  animation: ${fadeIn} 0.4s ease-out both;
  transition: background 0.2s;

  &:hover {
    background: #111;
  }
`;

const ImgWrap = styled.div`
  position: relative;
  background: #0d0d0d;
  overflow: hidden;
`;

const Img = styled.img`
  width: 100%;
  height: 240px;
  object-fit: cover;
  display: block;
  opacity: 0.9;
  transition: opacity 0.3s, transform 0.5s;

  ${Card}:hover & {
    opacity: 1;
    transform: scale(1.03);
  }
`;

const Ltd = styled.span`
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  background: #f5f5f0;
  color: #0a0a0a;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const Body = styled.div`
  padding: 1rem 1.2rem 1.2rem;
`;

const Model = styled.h3`
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e8e8e3;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Family = styled.p`
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #444;
`;

const Bottom = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 0.8rem;
`;

const Tags = styled.div`
  display: flex;
  gap: 0.3rem;
`;

const Tag = styled.span`
  font-size: 0.65rem;
  color: #444;
  padding: 0.15rem 0.45rem;
  border: 1px solid #1a1a1a;
  border-radius: 3px;
`;

const Price = styled.span`
  font-size: 0.85rem;
  font-weight: 500;
  color: #e8e8e3;
  letter-spacing: -0.01em;
`;
