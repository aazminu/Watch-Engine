import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';

const LEFT_LINKS = [
  { to: '/', label: 'Search' },
  { to: '/brands', label: 'Brands' },
];

const RIGHT_LINKS = [
  { to: '/alerts', label: 'Alerts' },
  { to: '/pricing', label: 'Pro' },
  { to: '/profile', label: 'Profile' },
];

export default function Navbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu after navigating
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const renderLinks = (links: typeof LEFT_LINKS) =>
    links.map(link => <NavItem key={link.to} to={link.to} end>{link.label}</NavItem>);

  return (
    <Nav>
      <Section>{renderLinks(LEFT_LINKS)}</Section>
      <Logo to="/">Watch Engine</Logo>
      <Section $end>{renderLinks(RIGHT_LINKS)}</Section>

      <MenuBtn
        type="button"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMenuOpen(open => !open)}
      >
        <MenuIcon $open={menuOpen}><span /><span /></MenuIcon>
      </MenuBtn>

      {menuOpen && (
        <>
          <Backdrop onClick={() => setMenuOpen(false)} />
          <MobileMenu id="mobile-menu">
            {renderLinks([...LEFT_LINKS, ...RIGHT_LINKS])}
          </MobileMenu>
        </>
      )}
    </Nav>
  );
}

const MOBILE = '@media (max-width: 720px)';

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Nav = styled.nav`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 1.5rem 3rem;
  position: relative;
  z-index: 10;

  ${MOBILE} {
    display: flex;
    justify-content: space-between;
    padding: 1rem 1.25rem;
  }
`;

const Section = styled.div<{ $end?: boolean }>`
  display: flex;
  align-items: center;
  gap: 2rem;
  justify-self: ${p => p.$end ? 'end' : 'start'};

  ${MOBILE} {
    display: none;
  }
`;

const NavItem = styled(NavLink)`
  color: #4a4a4a;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  text-decoration: none;
  transition: color 0.15s;

  &:hover { color: #888; }
  &.active { color: #e8e8e3; }
`;

const Logo = styled(Link)`
  font-family: 'Georgia', serif;
  font-size: 1.05rem;
  font-weight: 400;
  color: #f5f5f0;
  letter-spacing: -0.02em;
  text-decoration: none;
  white-space: nowrap;
`;

const MenuBtn = styled.button`
  display: none;
  width: 40px;
  height: 40px;
  margin-right: -0.6rem;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  align-items: center;
  justify-content: center;

  ${MOBILE} {
    display: flex;
  }
`;

const MenuIcon = styled.span<{ $open: boolean }>`
  position: relative;
  width: 18px;
  height: 10px;

  span {
    position: absolute;
    left: 0;
    width: 100%;
    height: 1.5px;
    background: #e8e8e3;
    transition: transform 0.2s, top 0.2s;
  }

  span:first-child {
    top: ${p => p.$open ? '4px' : '0'};
    transform: ${p => p.$open ? 'rotate(45deg)' : 'none'};
  }

  span:last-child {
    top: ${p => p.$open ? '4px' : '8.5px'};
    transform: ${p => p.$open ? 'rotate(-45deg)' : 'none'};
  }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: -1;
`;

const MobileMenu = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1.25rem 1.25rem;
  background: #0a0a0a;
  border-bottom: 1px solid #151515;
  animation: ${slideDown} 0.18s ease-out;

  ${NavItem} {
    padding: 0.9rem 0;
    font-size: 0.85rem;
    border-bottom: 1px solid #111;
  }

  ${NavItem}:last-child {
    border-bottom: none;
  }
`;
