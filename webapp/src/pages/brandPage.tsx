import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/navbar";
import styled from "styled-components";
import { supabase } from "../lib/supabaseClient";
import { getImageUrl } from "../lib/imageUtils";
import { WATCH_COLUMNS } from '../lib/watchColumns';

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
}

const BrandPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch brand name based on the id
        const { data: brandData, error: brandError } = await supabase
          .from("brands")
          .select("name")
          .eq("id", id)
          .single();

        if (brandError || !brandData) {
          setError("Brand not found.");
          setLoading(false);
          return;
        }

        setBrandName(brandData.name);

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Fetch watches based on the brand_id
        const { data, error: watchError, count } = await supabase
          .from("watches")
          .select(WATCH_COLUMNS, { count: "exact" })
          .eq("brand_id", id)
          .range(from, to);

        if (watchError) {
          setError("Failed to load watches.");
          console.error("❌ Watch fetch error:", watchError.message);
          setLoading(false);
          return;
        }

        setWatches(data || []);
        setTotalCount(count || 0);
      } catch (err) {
        setError("An unexpected error occurred.");
        console.error("❌ Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, page]);

  const totalPages = totalCount ? Math.ceil(totalCount / limit) : 1;

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  return (
    <Container>
      <Navbar />
      <Content>
        <Title>{brandName || "Loading..."} Watches</Title>
        {loading ? (
          <Loading>Loading watches...</Loading>
        ) : error ? (
          <Error>{error}</Error>
        ) : (
          <>
            <PaginationInfo>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalCount || 0)} of {totalCount} results
            </PaginationInfo>
            <WatchGrid>
              {watches.map((watch) => (
                <WatchCard key={watch.id} onClick={() => navigate(`/watch/${watch.id}`)}>
                  <WatchImage
                    src={getImageUrl(watch.image_url)}
                    alt={watch.model_name}
                  />
                  <WatchInfo>
                    <ModelName>{watch.model_name}</ModelName>
                    <FamilyName>{watch.family_name}</FamilyName>
                    <Details>
                      <Year>{watch.year_produced}</Year>
                      {watch.movement_name && <Movement>{watch.movement_name}</Movement>}
                      {watch.function_name && <Function>{watch.function_name}</Function>}
                      {watch.limited_edition && <LimitedEdition>{watch.limited_edition}</LimitedEdition>}
                      <Reference>Ref: {watch.reference}</Reference>
                    </Details>
                    {watch.price_eur && (
                      <Price>${watch.price_eur.toLocaleString()}</Price>
                    )}
                  </WatchInfo>
                </WatchCard>
              ))}
            </WatchGrid>
            <PaginationControls>
              <PageButton disabled={page === 1} onClick={handlePrevPage}>
                Previous
              </PageButton>
              <PageText>
                Page {page} of {totalPages}
              </PageText>
              <PageButton disabled={page === totalPages} onClick={handleNextPage}>
                Next
              </PageButton>
            </PaginationControls>
          </>
        )}
      </Content>
    </Container>
  );
};

const Container = styled.div`
  min-height: 100vh;
  background: #0a0a0a;
  font-family: 'Inter', sans-serif;
`;
const Content = styled.div`
  max-width: 1300px;
  margin: 0 auto;
  padding: 2rem;
`;
const Title = styled.h1`
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-weight: 400;
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
`;
const Loading = styled.div`
  text-align: center;
  color: #444;
  font-size: 0.9rem;
  padding: 3rem 0;
`;
const PaginationInfo = styled.div`
  color: #3a3a3a;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1.5rem;
`;
const WatchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1px;
  background: #151515;
  border: 1px solid #151515;
  border-radius: 10px;
  overflow: hidden;
`;
const WatchCard = styled.div`
  background: #0a0a0a;
  cursor: pointer;
  transition: background 0.2s;
  &:hover { background: #111; }
`;
const WatchImage = styled.img`
  width: 100%;
  height: 220px;
  object-fit: cover;
  opacity: 0.9;
  transition: opacity 0.3s;
  ${WatchCard}:hover & { opacity: 1; }
`;
const WatchInfo = styled.div`
  padding: 1rem 1.2rem 1.2rem;
`;
const ModelName = styled.h3`
  margin: 0;
  color: #e8e8e3;
  font-size: 0.9rem;
  font-weight: 500;
`;
const FamilyName = styled.p`
  color: #444;
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
`;
const Year = styled.p`
  color: #3a3a3a;
  margin: 0.15rem 0;
  font-size: 0.75rem;
`;
const Price = styled.p`
  color: #e8e8e3;
  font-weight: 500;
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
`;
const Error = styled.div`
  text-align: center;
  color: #666;
  font-size: 0.9rem;
  padding: 3rem 0;
`;
const Details = styled.div`
  margin: 0.4rem 0;
  font-size: 0.7rem;
  color: #3a3a3a;
`;
const Movement = styled.p`margin: 0.1rem 0;`;
const Function = styled.p`margin: 0.1rem 0;`;
const Reference = styled.p`margin: 0.1rem 0; font-family: 'SF Mono', monospace; font-size: 0.65rem; color: #333;`;
const PaginationControls = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2.5rem;
`;
const PageButton = styled.button`
  padding: 0.5rem 1.2rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  &:disabled { opacity: 0.2; cursor: default; }
`;
const PageText = styled.span`
  font-size: 0.8rem;
  color: #444;
`;
const LimitedEdition = styled.p`
  margin: 0.1rem 0;
  color: #888;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export default BrandPage;
