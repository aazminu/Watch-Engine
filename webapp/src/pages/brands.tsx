import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { supabase } from "../lib/supabaseClient";

interface Brand {
  id: number;
  name: string;
}

const BrandsPage: React.FC = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data, error } = await supabase
          .from("brands")
          .select("id, name")
          .order("name")
          .limit(1000);

        if (error) {
          console.error("Error fetching brands:", error);
          setError("Failed to load brands. Please try again.");
          return;
        }

        if (!data || data.length === 0) {
          setError("No brands found");
          return;
        }

        setBrands(data);
      } catch (err) {
        console.error("Error in fetchBrands:", err);
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, []);

  const filteredBrands = brands.filter(brand =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedBrands = filteredBrands.reduce((acc: { [key: string]: Brand[] }, brand) => {
    const firstLetter = brand.name.charAt(0).toUpperCase();
    if (!acc[firstLetter]) acc[firstLetter] = [];
    acc[firstLetter].push(brand);
    return acc;
  }, {});

  if (loading) {
    return (
      <Container>
        <Navbar />
        <Content>
          <LoadingMessage>Loading brands...</LoadingMessage>
        </Content>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Navbar />
        <Content>
          <ErrorMessage>{error}</ErrorMessage>
        </Content>
      </Container>
    );
  }

  return (
    <Container>
      <Navbar />
      <Content>
        <Title>Watch Brands</Title>
        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Search brands..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchContainer>
        {Object.entries(groupedBrands).sort().map(([letter, brandList]) => (
          <Section key={letter}>
            <LetterDivider>
              <Letter>{letter}</Letter>
              <Line />
            </LetterDivider>
            <BrandGrid>
              {brandList.map((brand) => (
                <BrandCard key={brand.id}>
                  <StyledLink to={`/brand/${brand.id}`}>
                    {brand.name}
                  </StyledLink>
                </BrandCard>
              ))}
            </BrandGrid>
          </Section>
        ))}
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
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem;
`;
const Title = styled.h1`
  text-align: center;
  color: #f5f5f0;
  margin-bottom: 2rem;
  font-family: 'Georgia', serif;
  font-weight: 400;
  font-size: 2rem;
`;
const BrandGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1px;
  background: #151515;
  border-radius: 8px;
  overflow: hidden;
`;
const BrandCard = styled.div`
  background: #0a0a0a;
  transition: background 0.15s;
  &:hover { background: #111; }
`;
const StyledLink = styled(Link)`
  display: block;
  padding: 1.2rem 1.5rem;
  color: #888;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: color 0.15s;
  &:hover { color: #e8e8e3; }
`;
const SearchContainer = styled.div`
  margin: 0 auto 2.5rem;
  max-width: 500px;
`;
const SearchInput = styled.input`
  width: 100%;
  padding: 0.85rem 1rem;
  font-size: 0.9rem;
  font-family: inherit;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 10px;
  color: #e8e8e3;
  outline: none;
  transition: border-color 0.2s;
  &:focus { border-color: #333; }
  &::placeholder { color: #3a3a3a; }
`;
const Section = styled.div`
  margin-bottom: 2rem;
`;
const LetterDivider = styled.div`
  display: flex;
  align-items: center;
  margin: 2rem 0 0.75rem;
`;
const Letter = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: #555;
  margin-right: 1rem;
  min-width: 20px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;
const Line = styled.div`
  flex: 1;
  height: 1px;
  background: #1a1a1a;
`;
const LoadingMessage = styled.div`
  text-align: center;
  font-size: 0.9rem;
  color: #444;
  margin-top: 3rem;
`;
const ErrorMessage = styled.div`
  text-align: center;
  font-size: 0.9rem;
  color: #666;
  margin-top: 3rem;
`;

export default BrandsPage;
