const mongoose = require('/Users/baranakpinar/Desktop/GymGOZ/node_modules/mongoose');
require('/Users/baranakpinar/Desktop/GymGOZ/node_modules/dotenv').config({ path: '/Users/baranakpinar/Desktop/GymGOZ/.env' });
const Product = require('/Users/baranakpinar/Desktop/GymGOZ/models/Product');
const Brand = require('/Users/baranakpinar/Desktop/GymGOZ/models/Brand');
const connectDB = require('/Users/baranakpinar/Desktop/GymGOZ/config/database');

const brandAbbreviations = {
  'Nike': 'NKE',
  'Adidas': 'ADS',
  'Puma': 'PMA',
  'Reebok': 'RBK',
  'Hummel': 'HML',
  'Under Armour': 'UA',
  'Decathlon': 'DEC',
  'Öz Spor': 'ÖZS',
  'Dragon-Do': 'DRG',
  'İppon Gear': 'IPG',
  'Oysho': 'OYS',
  'Miu Miu': 'MIU',
  'Mizuno': 'MZN',
  'Stanley': 'STN',
  'Cyclone': 'CYC',
  'Alo': 'ALO',
  'Dugana': 'DGN',
  'Lacoste': 'LAC',
  'The North Face': 'TNF',
  'the-north-face': 'TNF',
  'North Face': 'TNF',
  'Void': 'VOI',
  'Sea Star': 'SST',
  'sea-star': 'SST',
  'Avva': 'AVV',
  'Li-Ning': 'LIN',
  'Lining': 'LIN',
  'li-ning': 'LIN',
  'Salomon': 'SAL',
  'Delta': 'DLT'
};

const canonicalBrands = {
  'North Face': 'The North Face',
  'the-north-face': 'The North Face',
  'sea-star': 'Sea Star',
  'Lining': 'Li-Ning',
  'li-ning': 'Li-Ning'
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function migrate() {
  try {
    await connectDB();
    console.log('✓ Connected to Database.');

    // Fetch all products
    const products = await Product.find({});
    console.log(`Fetched ${products.length} products to check for brand migrations...`);

    let updatedCount = 0;
    const newBrandsToInsert = new Set();

    // Iterate through brand names (longest first to avoid sub-string replacement issues)
    const sortedBrandNames = Object.keys(brandAbbreviations).sort((a, b) => b.length - a.length);

    for (const product of products) {
      const originalName = product.name;
      let matchedBrand = null;

      for (const brandName of sortedBrandNames) {
        // Match brand name using custom boundaries (whitespace, string start/end, dashes) to support Unicode chars like İ, Ö, vb.
        const escapedBrand = escapeRegExp(brandName);
        const regex = new RegExp('(?:^|\\s|[-–—/])' + escapedBrand + '(?:$|\\s|[-–—/])', 'gi');

        if (regex.test(product.name)) {
          matchedBrand = brandName;
          break;
        }
      }

      if (matchedBrand) {
        const abbr = brandAbbreviations[matchedBrand];
        const suffix = ` (${abbr})`;

        // Remove the brand name from the product name (using same custom boundaries)
        const regex = new RegExp('(?:^|\\s|[-–—/])' + escapeRegExp(matchedBrand) + '(?:$|\\s|[-–—/])', 'gi');
        let cleanedName = product.name.replace(regex, ' ').replace(/\s+/g, ' ').trim();
        
        // Strip any leading/trailing dashes, hyphens, or spaces
        cleanedName = cleanedName.replace(/^[-–—\s]+|[-–—\s]+$/g, '');

        let targetName = cleanedName;
        if (!cleanedName.endsWith(suffix)) {
          targetName = cleanedName + suffix;
        }

        const resolvedBrand = canonicalBrands[matchedBrand] || matchedBrand;

        // Check if anything changed
        if (product.name !== targetName || product.brand !== resolvedBrand) {
          console.log(`Migrating: "${originalName}" (Brand: "${product.brand}") -> "${targetName}" (Brand: "${resolvedBrand}")`);
          
          product.name = targetName;
          product.brand = resolvedBrand;
          await product.save();
          updatedCount++;

          // Track new brands that might need to be inserted in the Brand collection
          newBrandsToInsert.add(resolvedBrand);
        }
      }
    }

    console.log(`\n✓ Migrated ${updatedCount} products successfully.`);

    // Insert new brands in the Brand collection if they don't exist
    if (newBrandsToInsert.size > 0) {
      console.log('\nChecking for missing brand collection entries...');
      for (const brandName of newBrandsToInsert) {
        const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const existing = await Brand.findOne({ name: brandName });
        if (!existing) {
          console.log(`➕ Adding new brand to collection: "${brandName}" (slug: "${slug}")`);
          await Brand.create({ name: brandName, slug });
        }
      }
    }

    console.log('\nMigration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed with error:', err);
    process.exit(1);
  }
}

migrate();
