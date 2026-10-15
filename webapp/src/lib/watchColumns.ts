// Columns the UI renders. Never select('*') on watches: each row also carries a
// 768-dim embedding and the raw scraped record, which the client never uses.
export const WATCH_COLUMNS =
  'id, reference, brand_id, model_name, family_name, movement_name, function_name, year_produced, ' +
  'limited_edition, price_eur, image_url, image_filename, description, dial_color, source';
