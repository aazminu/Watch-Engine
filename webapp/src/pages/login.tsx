import { useState, useEffect } from 'react';
import Navbar from '../components/navbar';
import styled from 'styled-components';
import { supabase } from '../lib/supabaseClient';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Where ProtectedRoute sent us from; only same-site paths
  const from = (location.state as { from?: string } | null)?.from;
  const returnTo = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check if we have a mode parameter in the URL
    const modeParam = searchParams.get('mode');
    if (modeParam === 'signup') {
      setMode('signup');
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      
      const {error} = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/profile-setup`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          skipBrowserRedirect: false
        }
      });

      if (error) throw error;
      
      // The redirect will happen automatically
      // No need to navigate manually
    } catch (err) {
      console.error('Google login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/profile-setup`
          }
        });
        if (error) throw error;
        if (data) {
          alert('Check your email for the confirmation link!');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Navbar />
      <Content>
        <Form onSubmit={handleSubmit}>
          <Title>{mode === 'login' ? 'Login' : 'Sign Up'}</Title>
          
          <GoogleButton 
            type="button" 
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <LoadingSpinner />
            ) : (
              <>
                <GoogleIcon src="/google-icon.png" alt="Google" />
                Continue with Google
              </>
            )}
          </GoogleButton>
          
          <Divider>or</Divider>
          
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {error && <ErrorMessage>{error}</ErrorMessage>}
          
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Login' : 'Sign Up'}
          </Button>
          
          <ToggleMode>
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <ToggleButton type="button" onClick={() => setMode('signup')}>
                  Sign Up
                </ToggleButton>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <ToggleButton type="button" onClick={() => setMode('login')}>
                  Login
                </ToggleButton>
              </>
            )}
          </ToggleMode>
        </Form>
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
  max-width: 380px;
  margin: 4rem auto;
  padding: 0 2rem;
`;
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;
const Title = styled.h1`
  text-align: center;
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-weight: 400;
  font-size: 1.6rem;
  margin-bottom: 2rem;
`;
const Input = styled.input`
  padding: 0.8rem 1rem;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #e8e8e3;
  outline: none;
  transition: border-color 0.2s;
  &:focus { border-color: #333; }
  &::placeholder { color: #3a3a3a; }
`;
const Button = styled.button`
  padding: 0.8rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-top: 0.25rem;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.3; cursor: default; }
`;
const GoogleButton = styled.button`
  padding: 0.8rem;
  background: #141414;
  color: #888;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.15s;
  &:hover { border-color: #333; color: #ccc; }
  &:disabled { opacity: 0.3; cursor: default; }
`;
const Divider = styled.div`
  text-align: center;
  color: #333;
  font-size: 0.8rem;
  position: relative;
  margin: 0.5rem 0;
  &:before, &:after {
    content: '';
    position: absolute;
    top: 50%;
    width: 44%;
    height: 1px;
    background: #1e1e1e;
  }
  &:before { left: 0; }
  &:after { right: 0; }
`;
const ErrorMessage = styled.div`
  color: #e8e8e3;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.15);
  padding: 0.7rem;
  border-radius: 6px;
  text-align: center;
  font-size: 0.85rem;
`;
const ToggleMode = styled.div`
  text-align: center;
  color: #444;
  font-size: 0.85rem;
  margin-top: 0.5rem;
`;
const ToggleButton = styled.button`
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  &:hover { color: #e8e8e3; }
`;
const GoogleIcon = styled.img`
  width: 18px;
  height: 18px;
`;
const LoadingSpinner = styled.div`
  width: 18px;
  height: 18px;
  border: 2px solid #333;
  border-top-color: #888;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;