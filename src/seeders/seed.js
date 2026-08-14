const { sequelize, Tenant, User, Branch, Category, MenuItem, Table, Setting } = require('../models');
const logger = require('../utils/logger');

async function seedDatabase() {
  try {
    await sequelize.sync({ force: true });
    logger.info('✅ Database schema synchronized (fresh table build)');

    // 1. Create Super Admin User
    const superAdmin = await User.create({
      name: 'Super Admin',
      email: 'Admin',
      username: 'Admin',
      password: 'Admin@123',
      role: 'superadmin',
      pin: '0000'
    });
    logger.info('✅ Created Super Admin user (Admin / Admin@123)');

    // 2. Create Demo Tenant: Spice Bistro
    const tenant = await Tenant.create({
      id: 'tenant-spice-bistro',
      ssid: 'SS100001',
      name: 'Spice Bistro Fine Dine',
      ownerName: 'Vikram Malhotra',
      email: 'owner@smartserve.com',
      phone: '+91 98765 43210',
      city: 'New Delhi',
      address: 'Connaught Place, Block B, New Delhi',
      plan: 'enterprise',
      status: 'Active',
      outletsCount: 2,
      currencySymbol: '₹',
      taxRate: 5.0
    });
    logger.info('✅ Created Demo Tenant (Spice Bistro Fine Dine)');

    // 3. Create Tenant Owner User
    await User.create({
      tenantId: tenant.id,
      name: 'Vikram Malhotra',
      email: 'owner@smartserve.com',
      username: 'owner',
      password: 'owner123Password#',
      phone: '+91 98765 43210',
      role: 'owner',
      pin: '1234',
      staffId: '100101'
    });

    // 4. Create Staff Users (Cashier, Kitchen, Waiter)
    await User.create({
      tenantId: tenant.id,
      name: 'Rajesh Kumar (Cashier)',
      email: 'waiter@smartserve.com',
      username: 'cashier',
      password: 'waiter123Password#',
      role: 'cashier',
      pin: '1111'
    });

    await User.create({
      tenantId: tenant.id,
      name: 'Chef Chef (Kitchen)',
      email: 'kitchen@smartserve.com',
      username: 'chef',
      password: 'kitchen123Password#',
      role: 'kitchen',
      pin: '5555'
    });

    // 5. Create Branches
    const hqBranch = await Branch.create({
      id: 'br-1',
      tenantId: tenant.id,
      name: 'Connaught Place (HQ)',
      code: 'DEL-CP',
      address: 'Block B, Connaught Place',
      city: 'New Delhi'
    });

    await Branch.create({
      id: 'br-2',
      tenantId: tenant.id,
      name: 'Gurugram Cyber Hub',
      code: 'GGN-CYB',
      address: 'DLF Cyber City, Sector 24',
      city: 'Gurugram'
    });

    // 6. Create Categories
    const catStarters = await Category.create({
      id: 'cat-starters',
      tenantId: tenant.id,
      name: 'Starters & Appetizers',
      icon: '🍢',
      sortOrder: 1
    });

    const catMains = await Category.create({
      id: 'cat-mains',
      tenantId: tenant.id,
      name: 'Main Course',
      icon: '🥘',
      sortOrder: 2
    });

    const catBreads = await Category.create({
      id: 'cat-breads',
      tenantId: tenant.id,
      name: 'Indian Breads',
      icon: '🫓',
      sortOrder: 3
    });

    const catDrinks = await Category.create({
      id: 'cat-drinks',
      tenantId: tenant.id,
      name: 'Mocktails & Beverages',
      icon: '🍹',
      sortOrder: 4
    });

    // 7. Create Sample Menu Items
    await MenuItem.bulkCreate([
      { tenantId: tenant.id, categoryId: catStarters.id, name: 'Paneer Tikka Angara', price: 280, isVeg: true, isAvailable: true, description: 'Charcoal grilled cottage cheese with aromatic spices' },
      { tenantId: tenant.id, categoryId: catStarters.id, name: 'Murgh Malai Tikka', price: 340, isVeg: false, isAvailable: true, description: 'Tender chicken marinated in cream & cashew paste' },
      { tenantId: tenant.id, categoryId: catMains.id, name: 'Dal Makhani Special', price: 320, isVeg: true, isAvailable: true, description: 'Slow cooked black lentils with white butter' },
      { tenantId: tenant.id, categoryId: catMains.id, name: 'Butter Chicken Masala', price: 420, isVeg: false, isAvailable: true, description: 'Rich tomato gravy chicken with cream' },
      { tenantId: tenant.id, categoryId: catBreads.id, name: 'Butter Naan', price: 60, isVeg: true, isAvailable: true, description: 'Freshly baked tandoori naan with butter' },
      { tenantId: tenant.id, categoryId: catBreads.id, name: 'Garlic Cheese Naan', price: 90, isVeg: true, isAvailable: true, description: 'Stuffed cheese naan infused with garlic' },
      { tenantId: tenant.id, categoryId: catDrinks.id, name: 'Fresh Mint Mojito', price: 180, isVeg: true, isAvailable: true, description: 'Refreshing lime, mint leaves & sparkling soda' }
    ]);

    // 8. Create Tables
    await Table.bulkCreate([
      { tenantId: tenant.id, branchId: hqBranch.id, number: 'T-01', zone: 'Main Hall', seats: 4, status: 'available' },
      { tenantId: tenant.id, branchId: hqBranch.id, number: 'T-02', zone: 'Main Hall', seats: 2, status: 'available' },
      { tenantId: tenant.id, branchId: hqBranch.id, number: 'T-03', zone: 'Outdoor Patio', seats: 6, status: 'available' },
      { tenantId: tenant.id, branchId: hqBranch.id, number: 'T-04', zone: 'VIP Lounge', seats: 8, status: 'available' }
    ]);

    // 9. Default Setting
    await Setting.create({
      tenantId: tenant.id,
      orderWorkflowMode: 'WORKFLOW_1'
    });

    logger.info('🎉 Database seeding complete! Initial demo data loaded.');
  } catch (error) {
    logger.error('❌ Database seeding error: %o', error);
  }
}

if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = seedDatabase;
