import { supabase } from 'webapp/src/lib/supabaseClient.js';
import axios from 'axios';

// API request options
const options = {
  method: 'GET',
  url: 'https://watch-database1.p.rapidapi.com/make',
  headers: {
    'x-rapidapi-key': import.meta.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'watch-database1.p.rapidapi.com'
  }
};

async function importBrands() {
  try {
    const response = await axios.request(options);
    console.log('Response data:', response.data);
    const brands = response.data.make;

    if (!Array.isArray(brands)) {
      console.error('Expected an array of brands in make property, but got:', typeof brands);
      return;
    }

    const formattedBrands = brands.map((brand) => ({
      id: brand.makeId,
      name: brand.makeName,
      created_at: new Date().toISOString()
    }));

    // Insert brands into Supabase
    const { data, error } = await supabase
      .from('brands')
      .insert(formattedBrands);

    if (error) {
      console.error('Error inserting brands:', error);
      return;
    }

    console.log('Successfully imported brands:', data);
  } catch (error) {
    console.error('Error importing brands:', error.message);
  }
}

// Run the import
importBrands();
