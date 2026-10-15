import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Navbar from '../components/navbar';
import Footer from '../components/footer';
import styled, { keyframes } from 'styled-components';
import type { WatchPreferences } from '../types/supabase';
import { getImageUrl } from '../lib/imageUtils';
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

interface Favorite {
  watch_id: string;
}

interface WatchList {
  id: string;
  name: string;
  items: Watch[];
}

interface CollectionItem {
  id: string;
  watch_id: string;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  watch: Watch;
}

type Tab = 'preferences' | 'favorites' | 'lists' | 'collection';
type ChipPrefKey = 'preferred_styles' | 'preferred_materials' | 'preferred_complications' | 'dial_colors';

const CHIP_GROUPS: { key: ChipPrefKey; label: string; options: string[] }[] = [
  { key: 'preferred_styles', label: 'Styles', options: ['Dress', 'Sport', 'Dive', 'Pilot', 'Field', 'Racing', 'Smart'] },
  { key: 'preferred_materials', label: 'Materials', options: ['Stainless Steel', 'Gold', 'Titanium', 'Ceramic', 'Carbon Fiber', 'Bronze'] },
  { key: 'preferred_complications', label: 'Complications', options: ['Chronograph', 'GMT', 'Perpetual Calendar', 'Moon Phase', 'Tourbillon'] },
  { key: 'dial_colors', label: 'Dial colors', options: ['Black', 'White', 'Blue', 'Green', 'Silver', 'Gold', 'Brown'] },
];

const formatPrice = (n: number) => `$${Math.round(n).toLocaleString()}`;

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';

export default function Profile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preferences, setPreferences] = useState<WatchPreferences>({
    user_id: '',
    preferred_brands: [],
    price_range_min: 0,
    price_range_max: 50000,
    preferred_styles: [],
    preferred_features: [],
    preferred_materials: [],
    preferred_complications: [],
    dial_colors: [],
    case_sizes: [],
    bio: '',
    name: '',
    profile_image: null,
  });
  // Snapshot taken when editing starts, so Cancel can discard unsaved changes
  const [preferencesBeforeEdit, setPreferencesBeforeEdit] = useState<WatchPreferences | null>(null);
  const [favorites, setFavorites] = useState<Watch[]>([]);
  const [lists, setLists] = useState<WatchList[]>([]);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('preferences');

  useEffect(() => {
    fetchProfile();
    fetchFavorites();
    fetchLists();
    fetchCollection();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data, error } = await supabase
        .from('watch_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // new users have no preferences row yet

      if (error) throw error;
      if (data) {
        setPreferences(data);
      } else {
        setPreferences(prev => ({ ...prev, user_id: user.id }));
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function fetchFavorites() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('favorites')
        .select('watch_id')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const watchIds = data.map((fav: Favorite) => fav.watch_id);
        const { data: watchesData, error: watchesError } = await supabase
          .from('watches')
          .select(WATCH_COLUMNS)
          .in('id', watchIds);

        if (watchesError) throw watchesError;
        setFavorites(watchesData || []);
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  }

  async function fetchLists() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('watch_lists')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data) {
        const listsWithWatches = await Promise.all(
          data.map(async (list: WatchList) => {
            const { data: itemsData, error: itemsError } = await supabase
              .from('watch_list_items')
              .select('watch_id')
              .eq('list_id', list.id);

            if (itemsError) throw itemsError;

            if (itemsData && itemsData.length > 0) {
              const watchIds = itemsData.map((item: Favorite) => item.watch_id);
              const { data: watchesData, error: watchesError } = await supabase
                .from('watches')
                .select(WATCH_COLUMNS)
                .in('id', watchIds);

              if (watchesError) throw watchesError;
              return { ...list, items: watchesData || [] };
            }
            return { ...list, items: [] };
          })
        );
        setLists(listsWithWatches);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    }
  }

  async function fetchCollection() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_collection')
        .select('id, watch_id, purchase_price, purchase_date, notes')
        .eq('user_id', user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const watchIds = data.map(item => item.watch_id);
        const { data: watchesData, error: watchesError } = await supabase
          .from('watches')
          .select(WATCH_COLUMNS)
          .in('id', watchIds);

        if (watchesError) throw watchesError;

        const watchMap = new Map((watchesData || []).map(w => [w.id, w]));
        setCollection(data.map(item => ({
          ...item,
          watch: watchMap.get(item.watch_id),
        })).filter(item => item.watch));
      }
    } catch (error) {
      console.error('Error fetching collection:', error);
    }
  }

  const handleRemoveFromCollection = async (collectionId: string) => {
    try {
      const { error } = await supabase.from('user_collection').delete().eq('id', collectionId);
      if (error) throw error;
      setCollection(prev => prev.filter(item => item.id !== collectionId));
    } catch (error) {
      console.error('Error removing from collection:', error);
    }
  };

  async function updateProfile() {
    try {
      setSaving(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');

      const { error } = await supabase
        .from('watch_preferences')
        .upsert({
          ...preferences,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setIsEditingPreferences(false);
      setPreferencesBeforeEdit(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  }

  const startEditing = () => {
    setPreferencesBeforeEdit(preferences);
    setIsEditingPreferences(true);
    setActiveTab('preferences');
  };

  const cancelEditing = () => {
    if (preferencesBeforeEdit) setPreferences(preferencesBeforeEdit);
    setPreferencesBeforeEdit(null);
    setIsEditingPreferences(false);
  };

  const toggleChip = (key: ChipPrefKey, value: string) => {
    setPreferences(prev => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
    }));
  };

  const closeUploadModal = () => {
    setIsEditingProfile(false);
    setSelectedImage(null);
    setPreviewUrl(null);
    setUploadError(null);
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadError(null);
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => { setPreviewUrl(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = async () => {
    if (!selectedImage) return;
    try {
      setUploading(true);
      setUploadError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');

      if (selectedImage.size > 5 * 1024 * 1024) throw new Error('Image size must be less than 5MB');
      if (!selectedImage.type.startsWith('image/')) throw new Error('Please upload an image file');

      const fileExt = selectedImage.name.split('.').pop();
      // One folder per user so storage policies can restrict writes to the owner
      let uploadedFileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(uploadedFileName, selectedImage, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        if (uploadError.message.includes('duplicate')) {
          uploadedFileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error: retryError } = await supabase.storage
            .from('profile-pictures')
            .upload(uploadedFileName, selectedImage, { cacheControl: '3600', upsert: true });
          if (retryError) throw retryError;
        } else {
          throw uploadError;
        }
      }

      const { data: { publicUrl } } = supabase.storage.from('profile-pictures').getPublicUrl(uploadedFileName);
      const { error: updateError } = await supabase
        .from('watch_preferences')
        .update({ profile_image: publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setPreferences(prev => ({ ...prev, profile_image: publicUrl }));
      setAvatarFailed(false);
      closeUploadModal();
    } catch (error) {
      console.error('Error uploading image:', error);
      const message = error instanceof Error ? error.message : 'An error occurred';
      setUploadError(/bucket not found/i.test(message)
        ? 'Photo storage is not set up yet (the profile-pictures bucket is missing).'
        : message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFavorite = async (watchId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('watch_id', watchId);
      if (error) throw error;
      setFavorites(prev => prev.filter(watch => watch.id !== watchId));
    } catch (error) {
      console.error('Error removing favorite:', error);
    }
  };

  const removeFromList = async (listId: string, watchId: string) => {
    try {
      const { error } = await supabase.from('watch_list_items').delete().eq('list_id', listId).eq('watch_id', watchId);
      if (error) throw error;
      setLists(prevLists =>
        prevLists.map(list => list.id === listId
          ? { ...list, items: list.items.filter(watch => watch.id !== watchId) }
          : list
        )
      );
    } catch (error) {
      console.error('Error removing watch from list:', error);
    }
  };

  const handleDeleteList = async (list: WatchList) => {
    if (!window.confirm(`Delete "${list.name}"? This can't be undone.`)) return;
    try {
      const { error } = await supabase.from('watch_lists').delete().eq('id', list.id);
      if (error) throw error;
      setLists(prev => prev.filter(l => l.id !== list.id));
    } catch (error) {
      console.error('Error deleting list:', error);
    }
  };

  const marketValue = collection.reduce((sum, item) => sum + (item.watch.price_eur || 0), 0);
  const totalPaid = collection.reduce((sum, item) => sum + (item.purchase_price || 0), 0);
  // Only compare watches where both prices are known
  const priced = collection.filter(item => item.purchase_price && item.watch.price_eur);
  const valueChange = priced.reduce((sum, item) => sum + (item.watch.price_eur! - item.purchase_price!), 0);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'preferences', label: 'Preferences' },
    { id: 'favorites', label: 'Favorites', count: favorites.length },
    { id: 'lists', label: 'Lists', count: lists.length },
    { id: 'collection', label: 'Collection', count: collection.length },
  ];

  if (loading) {
    return (
      <Page>
        <Navbar />
        <LoadWrap><Dot /><Dot /><Dot /></LoadWrap>
      </Page>
    );
  }

  const removeIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );

  const emptyState = (title: string, hint: string) => (
    <Empty>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyHint>{hint}</EmptyHint>
      <PrimaryBtn onClick={() => navigate('/')}>Search watches</PrimaryBtn>
    </Empty>
  );

  return (
    <Page>
      <Navbar />
      <Content>
        {/* ── Header ── */}
        <Header>
          <Identity>
            <AvatarBtn onClick={() => setIsEditingProfile(true)} aria-label="Change profile picture">
              {preferences.profile_image && !avatarFailed ? (
                <AvatarImg src={preferences.profile_image} alt="" onError={() => setAvatarFailed(true)} />
              ) : (
                <AvatarInitials>{initials(preferences.name || '')}</AvatarInitials>
              )}
              <AvatarHover>Change</AvatarHover>
            </AvatarBtn>
            <IdentityText>
              <Name $placeholder={!preferences.name}>{preferences.name || 'Your name'}</Name>
              {preferences.bio
                ? <Bio>{preferences.bio}</Bio>
                : <Bio as="button" onClick={startEditing} $link>Add a short bio</Bio>}
              <Meta>
                {favorites.length} favorites<Sep>·</Sep>
                {lists.length} lists<Sep>·</Sep>
                {collection.length} owned
              </Meta>
            </IdentityText>
          </Identity>
          <HeaderActions>
            <SecondaryBtn onClick={startEditing}>Edit profile</SecondaryBtn>
            <TextBtn onClick={handleLogout}>Sign out</TextBtn>
          </HeaderActions>
        </Header>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        {/* ── Tabs ── */}
        <TabBar role="tablist">
          {tabs.map(tab => (
            <TabBtn
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              $active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && <TabCount>{tab.count}</TabCount>}
            </TabBtn>
          ))}
        </TabBar>

        {/* ── Preferences ── */}
        {activeTab === 'preferences' && (
          isEditingPreferences ? (
            <Form onSubmit={e => { e.preventDefault(); updateProfile(); }}>
              <Field>
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <TextInput
                  id="profile-name"
                  value={preferences.name || ''}
                  onChange={e => setPreferences(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Your name"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="profile-bio">Bio</FieldLabel>
                <TextArea
                  id="profile-bio"
                  rows={2}
                  value={preferences.bio || ''}
                  onChange={e => setPreferences(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="What are you collecting or hunting for?"
                />
              </Field>

              <Field>
                <FieldLabel>Price range</FieldLabel>
                <PriceRow>
                  <PriceInputWrap>
                    <span>$</span>
                    <TextInput
                      type="number"
                      min={0}
                      aria-label="Minimum price"
                      value={preferences.price_range_min}
                      onChange={e => setPreferences(prev => ({ ...prev, price_range_min: Number(e.target.value) || 0 }))}
                    />
                  </PriceInputWrap>
                  <PriceDivider>to</PriceDivider>
                  <PriceInputWrap>
                    <span>$</span>
                    <TextInput
                      type="number"
                      min={0}
                      aria-label="Maximum price"
                      value={preferences.price_range_max}
                      onChange={e => setPreferences(prev => ({ ...prev, price_range_max: Number(e.target.value) || 0 }))}
                    />
                  </PriceInputWrap>
                </PriceRow>
              </Field>

              {CHIP_GROUPS.map(group => (
                <Field key={group.key}>
                  <FieldLabel>{group.label}</FieldLabel>
                  <ChipGrid>
                    {group.options.map(option => {
                      const selected = preferences[group.key].includes(option);
                      return (
                        <Chip
                          key={option}
                          type="button"
                          aria-pressed={selected}
                          $selected={selected}
                          onClick={() => toggleChip(group.key, option)}
                        >{option}</Chip>
                      );
                    })}
                  </ChipGrid>
                </Field>
              ))}

              <BtnRow>
                <PrimaryBtn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</PrimaryBtn>
                <SecondaryBtn type="button" onClick={cancelEditing}>Cancel</SecondaryBtn>
              </BtnRow>
            </Form>
          ) : (
            <>
              <SectionHead>
                <SectionTitle>Watch preferences</SectionTitle>
                {saved && <SavedNote>Saved</SavedNote>}
              </SectionHead>
              <PrefTable>
                <PrefRow>
                  <PrefLabel>Price range</PrefLabel>
                  <PrefValue>{formatPrice(preferences.price_range_min)} – {formatPrice(preferences.price_range_max)}</PrefValue>
                </PrefRow>
                {CHIP_GROUPS.map(group => (
                  <PrefRow key={group.key}>
                    <PrefLabel>{group.label}</PrefLabel>
                    <PrefValue>
                      {preferences[group.key].length > 0
                        ? <Tags>{preferences[group.key].map(v => <Tag key={v}>{v}</Tag>)}</Tags>
                        : <Muted>Any</Muted>}
                    </PrefValue>
                  </PrefRow>
                ))}
              </PrefTable>
            </>
          )
        )}

        {/* ── Favorites ── */}
        {activeTab === 'favorites' && (
          favorites.length === 0
            ? emptyState('No favorites yet', 'Tap the heart on any watch to save it here.')
            : (
              <Grid>
                {favorites.map(watch => (
                  <Card key={watch.id} onClick={() => navigate(`/watch/${watch.id}`)}>
                    <ImgWrap>
                      <Img src={getImageUrl(watch.image_url)} alt={watch.model_name} loading="lazy" />
                      <RemoveBtn
                        aria-label="Remove from favorites"
                        onClick={e => { e.stopPropagation(); handleRemoveFavorite(watch.id); }}
                      >{removeIcon}</RemoveBtn>
                    </ImgWrap>
                    <Body>
                      <Model>{watch.model_name}</Model>
                      <Family>{watch.family_name}</Family>
                      <Bottom>
                        <Tags>{watch.year_produced && <Tag>{watch.year_produced}</Tag>}</Tags>
                        {watch.price_eur && <Price>{formatPrice(watch.price_eur)}</Price>}
                      </Bottom>
                    </Body>
                  </Card>
                ))}
              </Grid>
            )
        )}

        {/* ── Lists ── */}
        {activeTab === 'lists' && (
          lists.length === 0
            ? emptyState('No lists yet', 'Create a list from any watch page to group watches you are comparing.')
            : (
              <ListStack>
                {lists.map(list => (
                  <section key={list.id}>
                    <SectionHead>
                      <SectionTitle>
                        {list.name}
                        <SectionCount>{list.items.length} {list.items.length === 1 ? 'watch' : 'watches'}</SectionCount>
                      </SectionTitle>
                      <TextBtn $danger onClick={() => handleDeleteList(list)}>Delete list</TextBtn>
                    </SectionHead>
                    {list.items.length > 0 ? (
                      <Grid $compact>
                        {list.items.map(watch => (
                          <Card key={watch.id} onClick={() => navigate(`/watch/${watch.id}`)}>
                            <ImgWrap>
                              <Img $compact src={getImageUrl(watch.image_url)} alt={watch.model_name} loading="lazy" />
                              <RemoveBtn
                                aria-label={`Remove from ${list.name}`}
                                onClick={e => { e.stopPropagation(); removeFromList(list.id, watch.id); }}
                              >{removeIcon}</RemoveBtn>
                            </ImgWrap>
                            <Body $compact>
                              <Model>{watch.model_name}</Model>
                              {watch.price_eur && <Price $small>{formatPrice(watch.price_eur)}</Price>}
                            </Body>
                          </Card>
                        ))}
                      </Grid>
                    ) : (
                      <ListEmpty>No watches in this list yet.</ListEmpty>
                    )}
                  </section>
                ))}
              </ListStack>
            )
        )}

        {/* ── Collection ── */}
        {activeTab === 'collection' && (
          collection.length === 0
            ? emptyState('Your collection is empty', 'Add watches you own from any watch page to track what they are worth.')
            : (
              <>
                <Summary>
                  <SummaryItem>
                    <SummaryLabel>Watches</SummaryLabel>
                    <SummaryValue>{collection.length}</SummaryValue>
                  </SummaryItem>
                  <SummaryItem>
                    <SummaryLabel>Market value</SummaryLabel>
                    <SummaryValue>{formatPrice(marketValue)}</SummaryValue>
                  </SummaryItem>
                  <SummaryItem>
                    <SummaryLabel>Total paid</SummaryLabel>
                    <SummaryValue>{totalPaid > 0 ? formatPrice(totalPaid) : '—'}</SummaryValue>
                  </SummaryItem>
                  <SummaryItem>
                    <SummaryLabel>Change</SummaryLabel>
                    <SummaryValue $tone={priced.length === 0 ? undefined : valueChange >= 0 ? 'up' : 'down'}>
                      {priced.length === 0 ? '—' : `${valueChange >= 0 ? '+' : '−'}${formatPrice(Math.abs(valueChange))}`}
                    </SummaryValue>
                  </SummaryItem>
                </Summary>

                <Grid>
                  {collection.map(item => {
                    const change = item.purchase_price && item.watch.price_eur
                      ? item.watch.price_eur - item.purchase_price
                      : null;
                    return (
                      <Card key={item.id} onClick={() => navigate(`/watch/${item.watch.id}`)}>
                        <ImgWrap>
                          <Img src={getImageUrl(item.watch.image_url)} alt={item.watch.model_name} loading="lazy" />
                          <RemoveBtn
                            aria-label="Remove from collection"
                            onClick={e => { e.stopPropagation(); handleRemoveFromCollection(item.id); }}
                          >{removeIcon}</RemoveBtn>
                        </ImgWrap>
                        <Body>
                          <Model>{item.watch.model_name}</Model>
                          <Family>{item.watch.family_name}</Family>
                          <Ledger>
                            <LedgerRow>
                              <span>Paid</span>
                              <span>{item.purchase_price ? formatPrice(item.purchase_price) : '—'}</span>
                            </LedgerRow>
                            <LedgerRow>
                              <span>Market</span>
                              <span>{item.watch.price_eur ? formatPrice(item.watch.price_eur) : '—'}</span>
                            </LedgerRow>
                            {change !== null && (
                              <LedgerRow $tone={change >= 0 ? 'up' : 'down'}>
                                <span>Change</span>
                                <span>{change >= 0 ? '+' : '−'}{formatPrice(Math.abs(change))}</span>
                              </LedgerRow>
                            )}
                          </Ledger>
                          {item.purchase_date && (
                            <Purchased>Bought {new Date(item.purchase_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Purchased>
                          )}
                        </Body>
                      </Card>
                    );
                  })}
                </Grid>
              </>
            )
        )}
      </Content>

      {/* ── Upload modal ── */}
      {isEditingProfile && (
        <ModalOverlay onClick={closeUploadModal}>
          <Modal onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="upload-title">
            <ModalHead>
              <ModalTitle id="upload-title">Profile picture</ModalTitle>
              <CloseBtn onClick={closeUploadModal} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </CloseBtn>
            </ModalHead>
            {previewUrl ? (
              <ImgPreview src={previewUrl} alt="Preview" />
            ) : (
              <UploadZone type="button" onClick={() => fileInputRef.current?.click()}>
                <UploadLabel>Choose a photo</UploadLabel>
                <UploadHint>JPG or PNG, up to 5MB</UploadHint>
              </UploadZone>
            )}
            {uploadError && <ModalError role="alert">{uploadError}</ModalError>}
            <HiddenInput type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" />
            {previewUrl && (
              <BtnRow>
                <PrimaryBtn onClick={handleImageUpload} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Save photo'}
                </PrimaryBtn>
                <SecondaryBtn onClick={() => { setSelectedImage(null); setPreviewUrl(null); }}>
                  Choose another
                </SecondaryBtn>
              </BtnRow>
            )}
          </Modal>
        </ModalOverlay>
      )}

      <Footer />
    </Page>
  );
}

/* ═══ Animations ═══ */

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
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

const Content = styled.main`
  max-width: 1100px;
  margin: 0 auto;
  padding: 2.5rem 2rem 5rem;
  animation: ${fadeIn} 0.4s ease-out;

  @media (max-width: 640px) {
    padding: 1.5rem 1.25rem 4rem;
  }
`;

const LoadWrap = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: 8rem 0;
`;

const Dot = styled.div`
  width: 6px;
  height: 6px;
  background: #555;
  border-radius: 50%;
  animation: ${pulse} 1s ease-in-out infinite;
  &:nth-child(2) { animation-delay: 0.15s; }
  &:nth-child(3) { animation-delay: 0.3s; }
`;

const ErrorMsg = styled.div`
  color: #d98080;
  border: 1px solid #2a1717;
  background: #120c0c;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
`;

/* ═══ Header ═══ */

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  padding-bottom: 2.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 1.5rem;
    padding-bottom: 2rem;
  }
`;

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-width: 0;

  @media (max-width: 640px) {
    gap: 1rem;
  }
`;

const AvatarBtn = styled.button`
  position: relative;
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #1e1e1e;
  background: #141414;
  overflow: hidden;
  cursor: pointer;

  @media (max-width: 640px) {
    width: 64px;
    height: 64px;
  }
`;

const AvatarImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const AvatarInitials = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: 'Georgia', serif;
  font-size: 1.8rem;
  color: #8a8a85;

  @media (max-width: 640px) {
    font-size: 1.3rem;
  }
`;

const AvatarHover = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  color: #e8e8e3;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  opacity: 0;
  transition: opacity 0.15s;

  ${AvatarBtn}:hover &,
  ${AvatarBtn}:focus-visible & {
    opacity: 1;
  }
`;

const IdentityText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
`;

const Name = styled.h1<{ $placeholder?: boolean }>`
  margin: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: ${p => p.$placeholder ? '#4a4a4a' : '#f5f5f0'};
`;

const Bio = styled.p<{ $link?: boolean }>`
  margin: 0;
  max-width: 460px;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #7a7a75;
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  text-align: left;
  ${p => p.$link && `
    cursor: pointer;
    color: #4a4a4a;
    text-decoration: underline;
    text-underline-offset: 3px;
    &:hover { color: #888; }
  `}
`;

const Meta = styled.div`
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: #4a4a4a;
  letter-spacing: 0.02em;
`;

const Sep = styled.span`
  margin: 0 0.5rem;
  color: #2a2a2a;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`;

/* ═══ Buttons ═══ */

const PrimaryBtn = styled.button`
  padding: 0.6rem 1.3rem;
  background: #f5f5f0;
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const SecondaryBtn = styled.button`
  padding: 0.6rem 1.2rem;
  background: transparent;
  color: #a8a8a3;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    color: #e8e8e3;
    border-color: #333;
  }
`;

const TextBtn = styled.button<{ $danger?: boolean }>`
  padding: 0.6rem 0.8rem;
  background: none;
  border: none;
  color: #4a4a4a;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;

  &:hover { color: ${p => p.$danger ? '#d98080' : '#999'}; }
`;

const BtnRow = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

/* ═══ Tabs ═══ */

const TabBar = styled.div`
  display: flex;
  gap: 2rem;
  border-bottom: 1px solid #151515;
  margin-bottom: 2.5rem;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }

  @media (max-width: 640px) {
    gap: 1.1rem;
    margin-bottom: 2rem;
  }
`;

const TabBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0 0.9rem;
  margin-bottom: -1px;
  background: none;
  border: none;
  border-bottom: 1px solid ${p => p.$active ? '#e8e8e3' : 'transparent'};
  color: ${p => p.$active ? '#e8e8e3' : '#4a4a4a'};
  font-size: 0.75rem;
  font-weight: 500;
  font-family: inherit;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s;

  &:hover { color: ${p => p.$active ? '#e8e8e3' : '#888'}; }

  @media (max-width: 640px) {
    font-size: 0.7rem;
    letter-spacing: 0.03em;
  }
`;

const TabCount = styled.span`
  font-size: 0.7rem;
  color: #3a3a3a;
  letter-spacing: 0;
`;

/* ═══ Sections ═══ */

const SectionHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
`;

const SectionTitle = styled.h2`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin: 0;
  font-family: 'Georgia', serif;
  font-size: 1.2rem;
  font-weight: 400;
  color: #f5f5f0;
`;

const SectionCount = styled.span`
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  color: #4a4a4a;
`;

const SavedNote = styled.span`
  font-size: 0.75rem;
  color: #7fbf8e;
  animation: ${fadeIn} 0.2s ease-out;
`;

/* ═══ Preferences view ═══ */

const PrefTable = styled.dl`
  margin: 0;
  border-top: 1px solid #151515;
`;

const PrefRow = styled.div`
  display: grid;
  grid-template-columns: 180px 1fr;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 0;
  border-bottom: 1px solid #151515;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
`;

const PrefLabel = styled.dt`
  font-size: 0.7rem;
  font-weight: 500;
  color: #4a4a4a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const PrefValue = styled.dd`
  margin: 0;
  font-size: 0.9rem;
  color: #e8e8e3;
`;

const Muted = styled.span`
  color: #3a3a3a;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const Tag = styled.span`
  font-size: 0.75rem;
  color: #a8a8a3;
  padding: 0.25rem 0.6rem;
  border: 1px solid #1e1e1e;
  border-radius: 4px;
`;

/* ═══ Preferences form ═══ */

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 640px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
`;

const FieldLabel = styled.label`
  font-size: 0.7rem;
  font-weight: 500;
  color: #5a5a5a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const inputStyles = `
  width: 100%;
  box-sizing: border-box;
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 8px;
  color: #e8e8e3;
  font-size: 0.9rem;
  font-family: inherit;
  padding: 0.7rem 0.9rem;
  transition: border-color 0.15s;

  &:focus {
    outline: none;
    border-color: #3a3a3a;
  }

  &::placeholder { color: #3a3a3a; }
`;

const TextInput = styled.input`
  ${inputStyles}
`;

const TextArea = styled.textarea`
  ${inputStyles}
  resize: vertical;
  line-height: 1.5;
`;

const PriceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const PriceInputWrap = styled.div`
  position: relative;
  width: 160px;

  span {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: #4a4a4a;
    font-size: 0.9rem;
    pointer-events: none;
  }

  input { padding-left: 1.75rem; }
`;

const PriceDivider = styled.span`
  color: #4a4a4a;
  font-size: 0.8rem;
`;

const ChipGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Chip = styled.button<{ $selected: boolean }>`
  padding: 0.45rem 0.95rem;
  background: ${p => p.$selected ? '#f5f5f0' : 'transparent'};
  color: ${p => p.$selected ? '#0a0a0a' : '#6a6a6a'};
  border: 1px solid ${p => p.$selected ? '#f5f5f0' : '#1e1e1e'};
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: ${p => p.$selected ? 600 : 400};
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: ${p => p.$selected ? '#0a0a0a' : '#aaa'};
    border-color: ${p => p.$selected ? '#f5f5f0' : '#333'};
  }
`;

/* ═══ Watch grid (matches search results) ═══ */

const Grid = styled.div<{ $compact?: boolean }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${p => p.$compact ? '200px' : '250px'}, 1fr));
  gap: 1px;
  padding: 1px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

// Hairlines drawn per card (not via grid background) so a partly filled last row stays clean
const Card = styled.div`
  background: #0a0a0a;
  box-shadow: 0 0 0 1px #151515;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.2s;
  animation: ${fadeIn} 0.3s ease-out both;

  &:hover { background: #111; }
`;

const ImgWrap = styled.div`
  position: relative;
  background: #0d0d0d;
  overflow: hidden;
`;

const Img = styled.img<{ $compact?: boolean }>`
  width: 100%;
  height: ${p => p.$compact ? '170px' : '220px'};
  object-fit: cover;
  display: block;
  opacity: 0.9;
  transition: opacity 0.3s, transform 0.5s;

  ${Card}:hover & {
    opacity: 1;
    transform: scale(1.03);
  }

  @media (max-width: 640px) {
    height: 160px;
  }
`;

const RemoveBtn = styled.button`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: rgba(10, 10, 10, 0.75);
  color: #aaa;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;

  ${Card}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  /* No hover on touch screens, so keep it visible */
  @media (hover: none) {
    opacity: 1;
  }

  &:hover {
    background: #f5f5f0;
    color: #0a0a0a;
  }
`;

const Body = styled.div<{ $compact?: boolean }>`
  padding: ${p => p.$compact ? '0.8rem 1rem 1rem' : '1rem 1.2rem 1.2rem'};
`;

const Model = styled.h3`
  margin: 0;
  font-size: 0.85rem;
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

const Price = styled.span<{ $small?: boolean }>`
  display: block;
  margin-top: ${p => p.$small ? '0.4rem' : '0'};
  font-size: ${p => p.$small ? '0.8rem' : '0.85rem'};
  font-weight: 500;
  color: #e8e8e3;
  letter-spacing: -0.01em;
`;

/* ═══ Lists ═══ */

const ListStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3rem;
`;

const ListEmpty = styled.div`
  padding: 2rem;
  text-align: center;
  font-size: 0.85rem;
  color: #3a3a3a;
  border: 1px dashed #1a1a1a;
  border-radius: 12px;
`;

/* ═══ Collection ═══ */

const toneColor = (tone?: 'up' | 'down') =>
  tone === 'up' ? '#7fbf8e' : tone === 'down' ? '#d98080' : '#e8e8e3';

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid #151515;
  border-bottom: 1px solid #151515;
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const SummaryItem = styled.div`
  padding: 1.25rem 0;

  & + & {
    padding-left: 1.5rem;
    border-left: 1px solid #151515;
  }

  @media (max-width: 640px) {
    &:nth-child(3) {
      padding-left: 0;
      border-left: none;
      border-top: 1px solid #151515;
    }
    &:nth-child(4) { border-top: 1px solid #151515; }
  }
`;

const SummaryLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 500;
  color: #4a4a4a;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.4rem;
`;

const SummaryValue = styled.div<{ $tone?: 'up' | 'down' }>`
  font-family: 'Georgia', serif;
  font-size: 1.5rem;
  color: ${p => toneColor(p.$tone)};
  letter-spacing: -0.01em;
`;

const Ledger = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid #151515;
`;

const LedgerRow = styled.div<{ $tone?: 'up' | 'down' }>`
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;

  span:first-child { color: #4a4a4a; }
  span:last-child { color: ${p => toneColor(p.$tone)}; font-weight: 500; }
`;

const Purchased = styled.div`
  margin-top: 0.6rem;
  font-size: 0.7rem;
  color: #3a3a3a;
`;

/* ═══ Empty states ═══ */

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 4rem 1.5rem;
  border: 1px dashed #1a1a1a;
  border-radius: 12px;
`;

const EmptyTitle = styled.p`
  margin: 0;
  font-family: 'Georgia', serif;
  font-size: 1.15rem;
  color: #c8c8c3;
`;

const EmptyHint = styled.p`
  margin: 0 0 1rem;
  max-width: 320px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #4a4a4a;
`;

/* ═══ Upload modal ═══ */

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  z-index: 1000;
`;

const Modal = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 420px;
  padding: 1.5rem;
  background: #0f0f0f;
  border: 1px solid #1e1e1e;
  border-radius: 14px;
  animation: ${fadeIn} 0.2s ease-out;
`;

const ModalHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-family: 'Georgia', serif;
  font-size: 1.1rem;
  font-weight: 400;
  color: #f5f5f0;
`;

const CloseBtn = styled.button`
  display: flex;
  padding: 4px;
  background: none;
  border: none;
  color: #4a4a4a;
  cursor: pointer;
  transition: color 0.15s;
  &:hover { color: #e8e8e3; }
`;

const UploadZone = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 180px;
  background: #0a0a0a;
  border: 1px dashed #2a2a2a;
  border-radius: 10px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover { border-color: #444; }
`;

const UploadLabel = styled.span`
  font-size: 0.9rem;
  font-weight: 500;
  color: #c8c8c3;
`;

const UploadHint = styled.span`
  font-size: 0.75rem;
  color: #4a4a4a;
`;

const ModalError = styled.div`
  color: #d98080;
  border: 1px solid #2a1717;
  background: #120c0c;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.45;
`;

const HiddenInput = styled.input`
  display: none;
`;

const ImgPreview = styled.img`
  width: 180px;
  height: 180px;
  align-self: center;
  object-fit: cover;
  border-radius: 50%;
  border: 1px solid #1e1e1e;
`;
