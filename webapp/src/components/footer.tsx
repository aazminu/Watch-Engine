import styled from 'styled-components';

const Footer = () => (
  <Wrap>
    <Inner>
      <Left>Watch Engine</Left>
      <Right>
        <A href="/about">About</A>
        <A href="/brands">Brands</A>
        <A href="/pricing">Pro</A>
      </Right>
    </Inner>
    <Copy>&copy; {new Date().getFullYear()} Watch Engine</Copy>
  </Wrap>
);

const Wrap = styled.footer`
  border-top: 1px solid #141414;
  padding: 2.5rem 3rem 2rem;
`;

const Inner = styled.div`
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1.5rem;
`;

const Left = styled.div`
  font-family: 'Georgia', serif;
  font-size: 0.9rem;
  color: #333;
`;

const Right = styled.div`
  display: flex;
  gap: 1.5rem;
`;

const A = styled.a`
  color: #333;
  font-size: 0.75rem;
  text-decoration: none;
  font-family: 'Inter', sans-serif;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  transition: color 0.15s;
  &:hover { color: #666; }
`;

const Copy = styled.div`
  max-width: 1300px;
  margin: 0 auto;
  border-top: 1px solid #141414;
  padding-top: 1.25rem;
  color: #222;
  font-size: 0.7rem;
  font-family: 'Inter', sans-serif;
`;

export default Footer;
