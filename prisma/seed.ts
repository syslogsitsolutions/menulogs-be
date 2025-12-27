import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.util';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const hashedPassword = await hashPassword('demo123');
  
  const user = await prisma.user.upsert({
    where: { email: 'demo@restaurant.com' },
    update: {},
    create: {
      email: 'demo@restaurant.com',
      name: 'Demo User',
      password: hashedPassword,
      emailVerified: true,
      role: 'OWNER',
    },
  });

  console.log('✅ Created user:', user.email);

  // Create business
  const business = await prisma.business.upsert({
    where: { id: 'demo-business-id' },
    update: {},
    create: {
      id: 'demo-business-id',
      name: 'Fine Dining Group',
      logo: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&h=200&fit=crop',
      description: 'Premium restaurant chain',
      ownerId: user.id,
    },
  });

  console.log('✅ Created business:', business.name);

  // Create location
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const location = await prisma.location.upsert({
    where: { id: 'demo-location-id' },
    update: {},
    create: {
      id: 'demo-location-id',
      businessId: business.id,
      name: 'Downtown Branch',
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA',
      phone: '+91 99999-12345',
      email: 'downtown@restaurant.com',
      isActive: true,
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'PROFESSIONAL',
      trialEndsAt,
      openingHours: {
        monday: { isOpen: true, openTime: '11:00', closeTime: '22:00' },
        tuesday: { isOpen: true, openTime: '11:00', closeTime: '22:00' },
        wednesday: { isOpen: true, openTime: '11:00', closeTime: '22:00' },
        thursday: { isOpen: true, openTime: '11:00', closeTime: '22:00' },
        friday: { isOpen: true, openTime: '11:00', closeTime: '23:00' },
        saturday: { isOpen: true, openTime: '10:00', closeTime: '23:00' },
        sunday: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
      },
    },
  });

  console.log('✅ Created location:', location.name);

  // Create categories
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        locationId: location.id,
        name: 'Starters',
        description: 'Begin your culinary journey with our exquisite appetizers',
        image: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=800&h=600&fit=crop',
        icon: 'ChefHat',
        isVisible: true,
        sortOrder: 0,
      },
    }),
    prisma.category.create({
      data: {
        locationId: location.id,
        name: 'Main Course',
        description: 'Our signature dishes that define luxury dining',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop',
        icon: 'Utensils',
        isVisible: true,
        sortOrder: 1,
      },
    }),
    prisma.category.create({
      data: {
        locationId: location.id,
        name: 'Desserts',
        description: 'Sweet endings to remember',
        image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&h=600&fit=crop',
        icon: 'Cake',
        isVisible: true,
        sortOrder: 2,
      },
    }),
  ]);

  console.log('✅ Created categories:', categories.length);

  // Create menu items
  const menuItems = await Promise.all([
    prisma.menuItem.create({
      data: {
        locationId: location.id,
        categoryId: categories[0].id,
        name: 'Truffle Burrata',
        description: 'Creamy burrata cheese with black truffle, heirloom tomatoes, and aged balsamic',
        price: 24,
        image: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=800&h=600&fit=crop',
        images: ['https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=800&h=600&fit=crop'],
        ingredients: ['Burrata cheese', 'Black truffle', 'Heirloom tomatoes', 'Basil'],
        allergens: ['Dairy'],
        tags: ['Popular', 'Premium'],
        nutritionalInfo: { calories: 320, protein: '18g', carbs: '12g', fat: '24g' },
        isVegetarian: true,
        availability: 'IN_STOCK',
        preparationTime: '10 mins',
        sortOrder: 0,
      },
    }),
    prisma.menuItem.create({
      data: {
        locationId: location.id,
        categoryId: categories[1].id,
        name: 'Wagyu Beef Tenderloin',
        description: 'Premium A5 Wagyu beef with roasted root vegetables, red wine demi-glace',
        price: 89,
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=600&fit=crop',
        images: ['https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=600&fit=crop'],
        ingredients: ['A5 Wagyu beef', 'Root vegetables', 'Red wine', 'Beef jus'],
        allergens: ['Dairy', 'Alcohol'],
        tags: ['Chef Special', 'Premium'],
        nutritionalInfo: { calories: 680, protein: '52g', carbs: '18g', fat: '46g' },
        availability: 'IN_STOCK',
        preparationTime: '25 mins',
        sortOrder: 0,
      },
    }),
  ]);

  console.log('✅ Created menu items:', menuItems.length);

  // Create banners
  const banner = await prisma.banner.create({
    data: {
      locationId: location.id,
      title: 'Experience Culinary Excellence',
      subtitle: 'Discover our signature dishes crafted by world-class chefs',
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&h=600&fit=crop',
      isActive: true,
      sortOrder: 0,
    },
  });

  console.log('✅ Created banner:', banner.title);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📝 Demo credentials:');
  console.log('   Email: demo@restaurant.com');
  console.log('   Password: demo123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

