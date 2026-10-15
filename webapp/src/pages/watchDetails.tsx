import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/navbar";
import styled from "styled-components";
import { supabase } from "../lib/supabaseClient";
import { getImageUrl } from "../lib/imageUtils";
import { WATCH_COLUMNS } from '../lib/watchColumns';
import { API_URL } from "../config";
import PriceComparison from "../components/PriceComparison";
import PriceChart from "../components/PriceChart";
import PriceAlertForm from "../components/PriceAlertForm";

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

interface SimilarWatch {
  id: string;
  model_name: string;
  family_name: string;
  price_eur: number | null;
  image_url: string;
  dial_color: string | null;
  similarity: number;
}

interface WatchList {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

const WatchDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [watch, setWatch] = useState<Watch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [lists, setLists] = useState<WatchList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [similarWatches, setSimilarWatches] = useState<SimilarWatch[]>([]);
  const [isInCollection, setIsInCollection] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');

  useEffect(() => {
    const fetchWatch = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("watches")
          .select(WATCH_COLUMNS)
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) { setError("Watch not found"); return; }

        setWatch(data);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: favoriteData } = await supabase
            .from("favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("watch_id", id)
            .maybeSingle();
          setIsFavorite(!!favoriteData);

          // Check if watch is in user's collection
          const { data: collectionData } = await supabase
            .from("user_collection")
            .select("id")
            .eq("user_id", user.id)
            .eq("watch_id", id)
            .maybeSingle();
          setIsInCollection(!!collectionData);
        }
      } catch (err) {
        console.error("Error in fetchWatch:", err);
        setError("Failed to load watch details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchWatch();
  }, [id]);

  // Fetch similar watches
  useEffect(() => {
    const fetchSimilar = async () => {
      if (!id) return;
      try {
        const response = await fetch(`${API_URL}/api/similar-watches/${id}?limit=8`);
        const result = await response.json();
        if (result.success) {
          setSimilarWatches(result.data);
        }
      } catch (err) {
        console.error("Error fetching similar watches:", err);
      }
    };
    fetchSimilar();
  }, [id]);

  const handleFavorite = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      if (isFavorite) {
        const { error } = await supabase.from("favorites").delete()
          .eq("user_id", user.id).eq("watch_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites")
          .insert({ user_id: user.id, watch_id: id });
        if (error) throw error;
      }
      setIsFavorite(!isFavorite);
    } catch (err) {
      console.error("Error updating favorite:", err);
    }
  };

  const handleAddToList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data: listsData, error: listsError } = await supabase
        .from("watch_lists").select("*").eq("user_id", user.id);
      if (listsError) throw listsError;
      setLists(listsData || []);
      setShowListModal(true);
    } catch (err) {
      console.error("Error fetching lists:", err);
    }
  };

  const handleCreateList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !newListName.trim()) return;

      const { data, error } = await supabase
        .from("watch_lists")
        .insert({ name: newListName, user_id: user.id })
        .select().single();
      if (error) throw error;

      await supabase.from("watch_list_items").insert({ list_id: data.id, watch_id: id });
      setShowListModal(false);
      setNewListName("");
      setShowNewListInput(false);
    } catch (err) {
      console.error("Error creating list:", err);
    }
  };

  const handleAddToExistingList = async (listId: string) => {
    try {
      const { error } = await supabase
        .from("watch_list_items").insert({ list_id: listId, watch_id: id });
      if (error) throw error;
      setShowListModal(false);
    } catch (err) {
      console.error("Error adding to list:", err);
    }
  };

  const handleAddToCollection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    if (isInCollection) return;
    setShowCollectionModal(true);
  };

  const handleSaveToCollection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("user_collection").insert({
        user_id: user.id,
        watch_id: id,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_date: purchaseDate || null,
        notes: collectionNotes || null,
      });

      if (error) throw error;
      setIsInCollection(true);
      setShowCollectionModal(false);
      setPurchasePrice('');
      setPurchaseDate('');
      setCollectionNotes('');
    } catch (err) {
      console.error("Error adding to collection:", err);
    }
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = event.target as HTMLImageElement;
    img.src = "/placeholder.jpg";
  };

  if (loading) return <Loading>Loading...</Loading>;
  if (error) return <ErrorMsg>{error}</ErrorMsg>;
  if (!watch) return <ErrorMsg>Watch not found</ErrorMsg>;

  return (
    <Container>
      <Navbar />
      <Content>
        <WatchContainer>
          <ImageSection>
            <WatchImage
              src={getImageUrl(watch.image_url)}
              alt={watch.model_name}
              onError={handleImageError}
            />
          </ImageSection>
          <DetailsSection>
            <Title>{watch.model_name}</Title>
            <BrandName>{watch.family_name}</BrandName>
            <ActionButtons>
              <ActionButton onClick={handleFavorite}>
                {isFavorite ? "❤️" : "🤍"} Favorite
              </ActionButton>
              <ActionButton onClick={handleAddToList}>
                📋 Add to List
              </ActionButton>
              <ActionButton onClick={handleAddToCollection} style={isInCollection ? { background: '#dcfce7', color: '#166534' } : {}}>
                {isInCollection ? "✅ In Collection" : "⌚ Add to Collection"}
              </ActionButton>
            </ActionButtons>
            <StatsGrid>
              <StatItem>
                <StatLabel>Reference</StatLabel>
                <StatValue>{watch.reference}</StatValue>
              </StatItem>
              <StatItem>
                <StatLabel>Year</StatLabel>
                <StatValue>{watch.year_produced}</StatValue>
              </StatItem>
              {watch.movement_name && (
                <StatItem>
                  <StatLabel>Movement</StatLabel>
                  <StatValue>{watch.movement_name}</StatValue>
                </StatItem>
              )}
              {watch.function_name && (
                <StatItem>
                  <StatLabel>Function</StatLabel>
                  <StatValue>{watch.function_name}</StatValue>
                </StatItem>
              )}
              {watch.limited_edition && (
                <StatItem>
                  <StatLabel>Edition</StatLabel>
                  <StatValue>{watch.limited_edition}</StatValue>
                </StatItem>
              )}
              {watch.dial_color && (
                <StatItem>
                  <StatLabel>Dial Color</StatLabel>
                  <StatValue>{watch.dial_color}</StatValue>
                </StatItem>
              )}
              {watch.price_eur && (
                <StatItem>
                  <StatLabel>Price</StatLabel>
                  <StatValue>${watch.price_eur.toLocaleString()}</StatValue>
                </StatItem>
              )}
            </StatsGrid>
            {watch.description && (
              <Description>
                <DescriptionTitle>Description</DescriptionTitle>
                <DescriptionText>{watch.description}</DescriptionText>
              </Description>
            )}
          </DetailsSection>
        </WatchContainer>

        {/* Price Comparison */}
        {id && <PriceComparison watchId={id} />}

        {/* Price History Chart */}
        {id && <PriceChart watchId={id} />}

        {/* Price Alert */}
        {id && <PriceAlertForm watchId={id} currentPrice={watch.price_eur} />}

        {/* Similar Watches */}
        {similarWatches.length > 0 && (
          <SimilarSection>
            <SimilarHeader>You might also like</SimilarHeader>
            <SimilarGrid>
              {similarWatches.map(sw => (
                <SimilarCard key={sw.id} onClick={() => navigate(`/watch/${sw.id}`)}>
                  <SimilarImgWrap>
                    <SimilarImg
                      src={getImageUrl(sw.image_url)}
                      alt={sw.model_name}
                      onError={handleImageError}
                    />
                    <SimilarOverlay />
                    <SimilarBadge>{Math.round(sw.similarity * 100)}% match</SimilarBadge>
                  </SimilarImgWrap>
                  <SimilarBody>
                    <SimilarName>{sw.model_name}</SimilarName>
                    <SimilarFamily>{sw.family_name}</SimilarFamily>
                    {sw.price_eur && (
                      <SimilarPrice>${sw.price_eur.toLocaleString()}</SimilarPrice>
                    )}
                  </SimilarBody>
                </SimilarCard>
              ))}
            </SimilarGrid>
          </SimilarSection>
        )}
      </Content>

      {showCollectionModal && (
        <ModalOverlay onClick={() => setShowCollectionModal(false)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalTitle>Add to Collection</ModalTitle>
            <ModalContent>
              <CollectionField>
                <FieldLabel>Purchase Price (USD)</FieldLabel>
                <Input
                  type="number"
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </CollectionField>
              <CollectionField>
                <FieldLabel>Purchase Date</FieldLabel>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                />
              </CollectionField>
              <CollectionField>
                <FieldLabel>Notes (optional)</FieldLabel>
                <TextArea
                  value={collectionNotes}
                  onChange={e => setCollectionNotes(e.target.value)}
                  placeholder="Where you bought it, condition, etc."
                  rows={3}
                />
              </CollectionField>
              <BtnGroup>
                <Btn onClick={handleSaveToCollection}>Save to Collection</Btn>
                <Btn onClick={() => setShowCollectionModal(false)} style={{ background: '#6b7280' }}>Cancel</Btn>
              </BtnGroup>
            </ModalContent>
          </Modal>
        </ModalOverlay>
      )}

      {showListModal && (
        <ModalOverlay onClick={() => setShowListModal(false)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalTitle>Add to List</ModalTitle>
            <ModalContent>
              {lists.map(list => (
                <ListButton key={list.id} onClick={() => handleAddToExistingList(list.id)}>
                  {list.name}
                </ListButton>
              ))}
              {showNewListInput ? (
                <NewListInput>
                  <Input
                    type="text"
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    placeholder="Enter list name"
                  />
                  <BtnGroup>
                    <Btn onClick={handleCreateList}>Create</Btn>
                    <Btn onClick={() => setShowNewListInput(false)}>Cancel</Btn>
                  </BtnGroup>
                </NewListInput>
              ) : (
                <CreateListButton onClick={() => setShowNewListInput(true)}>
                  + Create New List
                </CreateListButton>
              )}
            </ModalContent>
          </Modal>
        </ModalOverlay>
      )}
    </Container>
  );
};

/* ═══ Styled Components ═══ */

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
const WatchContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  padding: 2rem 0;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`;
const ImageSection = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #0d0d0d;
  border-radius: 10px;
  overflow: hidden;
`;
const WatchImage = styled.img`
  max-width: 100%;
  height: auto;
`;
const DetailsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;
const Title = styled.h1`
  margin: 0;
  color: #f5f5f0;
  font-family: 'Georgia', serif;
  font-size: 1.8rem;
  font-weight: 400;
`;
const BrandName = styled.h2`
  margin: 0;
  color: #444;
  font-size: 0.9rem;
  font-weight: 500;
`;
const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;
  flex-wrap: wrap;
`;
const ActionButton = styled.button`
  padding: 0.5rem 0.9rem;
  border: 1px solid #1e1e1e;
  border-radius: 6px;
  background: #141414;
  color: #888;
  cursor: pointer;
  font-size: 0.8rem;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  transition: all 0.15s;
  &:hover { border-color: #333; color: #ccc; }
`;
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
`;
const StatItem = styled.div`
  padding: 0.85rem 1rem;
  background: #0a0a0a;
`;
const StatLabel = styled.div`
  color: #3a3a3a;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.3rem;
`;
const StatValue = styled.div`
  color: #e8e8e3;
  font-size: 0.85rem;
  font-weight: 500;
`;
const Description = styled.div`
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #141414;
`;
const DescriptionTitle = styled.h3`
  color: #555;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
`;
const DescriptionText = styled.p`
  color: #666;
  line-height: 1.7;
  font-size: 0.85rem;
`;

/* ── Similar Watches ── */
const SimilarSection = styled.div`
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #141414;
`;
const SimilarHeader = styled.h2`
  color: #555;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1.25rem;
`;
const SimilarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #151515;
  border-radius: 8px;
  overflow: hidden;
  @media (max-width: 1024px) { grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 768px) { grid-template-columns: repeat(2, 1fr); }
`;
const SimilarCard = styled.div`
  background: #0a0a0a;
  cursor: pointer;
  transition: background 0.2s;
  &:hover { background: #111; }
`;
const SimilarImgWrap = styled.div`
  position: relative;
  overflow: hidden;
  background: #0d0d0d;
`;
const SimilarImg = styled.img`
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
  opacity: 0.9;
  transition: opacity 0.3s;
  ${SimilarCard}:hover & { opacity: 1; }
`;
const SimilarOverlay = styled.div`display: none;`;
const SimilarBadge = styled.span`
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  background: rgba(0,0,0,0.7);
  color: #888;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 500;
`;
const SimilarBody = styled.div`
  padding: 0.8rem 1rem;
`;
const SimilarName = styled.h3`
  margin: 0;
  color: #e8e8e3;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;
const SimilarFamily = styled.p`
  margin: 0.2rem 0 0;
  color: #3a3a3a;
  font-size: 0.7rem;
`;
const SimilarPrice = styled.p`
  margin: 0.4rem 0 0;
  color: #e8e8e3;
  font-weight: 500;
  font-size: 0.8rem;
`;

/* ── Modal ── */
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;
const Modal = styled.div`
  background: #141414;
  border: 1px solid #1e1e1e;
  padding: 2rem;
  border-radius: 12px;
  width: 90%;
  max-width: 440px;
  max-height: 80vh;
  overflow-y: auto;
`;
const ModalTitle = styled.h2`
  margin: 0 0 1.5rem;
  color: #e8e8e3;
  font-family: 'Georgia', serif;
  font-weight: 400;
  font-size: 1.2rem;
`;
const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;
const ListButton = styled.button`
  padding: 0.85rem 1rem;
  border: 1px solid #1e1e1e;
  border-radius: 6px;
  background: #0a0a0a;
  color: #888;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 0.85rem;
  transition: all 0.15s;
  &:hover { border-color: #333; color: #ccc; }
`;
const CreateListButton = styled.button`
  padding: 0.85rem 1rem;
  border: 1px dashed #1e1e1e;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #444;
  font-family: inherit;
  font-size: 0.85rem;
  transition: all 0.15s;
  &:hover { border-color: #333; color: #888; }
`;
const NewListInput = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;
const Input = styled.input`
  padding: 0.7rem 0.85rem;
  background: #0a0a0a;
  border: 1px solid #1e1e1e;
  border-radius: 6px;
  color: #e8e8e3;
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  &:focus { border-color: #333; }
  &::placeholder { color: #3a3a3a; }
`;
const BtnGroup = styled.div`
  display: flex;
  gap: 0.5rem;
`;
const Btn = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: #f5f5f0;
  color: #0a0a0a;
  font-weight: 600;
  font-size: 0.8rem;
  font-family: inherit;
  &:hover { opacity: 0.85; }
`;
const CollectionField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;
const FieldLabel = styled.label`
  font-size: 0.7rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;
const TextArea = styled.textarea`
  padding: 0.7rem 0.85rem;
  background: #0a0a0a;
  border: 1px solid #1e1e1e;
  border-radius: 6px;
  color: #e8e8e3;
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  &:focus { border-color: #333; }
  &::placeholder { color: #3a3a3a; }
`;
const Loading = styled.div`
  text-align: center;
  padding: 3rem;
  color: #444;
  font-size: 0.9rem;
`;
const ErrorMsg = styled.div`
  text-align: center;
  padding: 3rem;
  color: #666;
  font-size: 0.9rem;
`;

export default WatchDetails;
