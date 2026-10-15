import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { supabase } from '../lib/supabaseClient';
import Navbar from '../components/navbar';

interface ProfileData {
  name: string;
  bio: string;
  preferred_brands: string[];
  price_range_min: number;
  price_range_max: number;
  preferred_styles: string[];
  preferred_features: string[];
  preferred_materials: string[];
  preferred_complications: string[];
  dial_colors: string[];
  case_sizes: string[];
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: '',
    bio: '',
    preferred_brands: [],
    price_range_min: 0,
    price_range_max: 100000,
    preferred_styles: [],
    preferred_features: [],
    preferred_materials: [],
    preferred_complications: [],
    dial_colors: [],
    case_sizes: [],
  });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) throw userError;
      
      if (!user) {
        navigate('/login');
        return;
      }

      // Check if profile already exists
      const { data: existingProfile, error: profileError } = await supabase
        .from('watch_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (existingProfile) {
        // If profile exists, redirect to profile page
        navigate('/profile');
        return;
      }

      // If no profile exists, get user's name from auth metadata
      if (user.user_metadata?.full_name) {
        setProfileData(prev => ({
          ...prev,
          name: user.user_metadata.full_name
        }));
      }

      setLoading(false);
    } catch (err) {
      console.error('Error checking user:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) throw userError;
      if (!user) throw new Error('No user found');

      const { error: upsertError } = await supabase
        .from('watch_preferences')
        .upsert({
          user_id: user.id,
          ...profileData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (upsertError) throw upsertError;

      navigate('/profile');
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Navbar />
        <LoadingMessage>Loading...</LoadingMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Navbar />
      <Content>
        <Form onSubmit={handleSubmit}>
          <Title>Complete Your Profile</Title>
          <Subtitle>Tell us about your watch preferences to get personalized recommendations</Subtitle>

          <FormGroup>
            <Label>Name</Label>
            <Input
              type="text"
              value={profileData.name}
              onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label>Bio</Label>
            <TextArea
              value={profileData.bio}
              onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell us about yourself and your watch collection..."
            />
          </FormGroup>

          <FormGroup>
            <Label>Price Range (EUR)</Label>
            <PriceRangeContainer>
              <Input
                type="number"
                value={profileData.price_range_min}
                onChange={(e) => setProfileData(prev => ({ ...prev, price_range_min: Number(e.target.value) }))}
                min="0"
                placeholder="Min"
              />
              <Input
                type="number"
                value={profileData.price_range_max}
                onChange={(e) => setProfileData(prev => ({ ...prev, price_range_max: Number(e.target.value) }))}
                min="0"
                placeholder="Max"
              />
            </PriceRangeContainer>
          </FormGroup>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Complete Profile'}
          </Button>
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
  max-width: 480px;
  margin: 3rem auto;
  padding: 0 2rem;
`;
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;
const Title = styled.h1`
  text-align: center;
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-weight: 400;
  font-size: 1.6rem;
  margin-bottom: 0.25rem;
`;
const Subtitle = styled.p`
  text-align: center;
  color: #444;
  font-size: 0.9rem;
  margin-bottom: 2rem;
`;
const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;
const Label = styled.label`
  font-weight: 500;
  color: #666;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
const TextArea = styled.textarea`
  padding: 0.8rem 1rem;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #e8e8e3;
  min-height: 100px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  &:focus { border-color: #333; }
  &::placeholder { color: #3a3a3a; }
`;
const PriceRangeContainer = styled.div`
  display: flex;
  gap: 0.75rem;
  ${Input} { flex: 1; }
`;
const Button = styled.button`
  padding: 0.85rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.3; cursor: default; }
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
const LoadingMessage = styled.div`
  text-align: center;
  padding: 3rem;
  font-size: 0.9rem;
  color: #444;
`; 