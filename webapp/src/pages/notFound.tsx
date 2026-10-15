import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import Navbar from '../components/navbar';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Page>
      <Navbar />
      <Body>
        <Title>Page not found</Title>
        <Hint>The page you're looking for doesn't exist or has moved.</Hint>
        <Btn onClick={() => navigate('/')}>Search watches</Btn>
      </Body>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100vh;
  background: #0a0a0a;
  color: #e8e8e3;
  font-family: 'Inter', -apple-system, sans-serif;
`;

const Body = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.75rem;
  padding: 8rem 1.5rem;
`;

const Title = styled.h1`
  margin: 0;
  font-family: 'Georgia', serif;
  font-size: 2rem;
  font-weight: 400;
  color: #f5f5f0;
`;

const Hint = styled.p`
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: #5a5a5a;
`;

const Btn = styled.button`
  padding: 0.6rem 1.3rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  &:hover { opacity: 0.85; }
`;
