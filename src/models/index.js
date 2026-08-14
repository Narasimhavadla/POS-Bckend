const { sequelize } = require('../config/database');
const Tenant = require('./Tenant');
const User = require('./User');
const Branch = require('./Branch');
const Category = require('./Category');
const MenuItem = require('./MenuItem');
const Table = require('./Table');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Staff = require('./Staff');
const Ingredient = require('./Ingredient');
const SupportTicket = require('./SupportTicket');
const Setting = require('./Setting');
const AuditLog = require('./AuditLog');
const Subscription = require('./Subscription');
const SubscriptionHistory = require('./SubscriptionHistory');
const ShiftDrawer = require('./ShiftDrawer');
const Attendance = require('./Attendance');
const Holiday = require('./Holiday');
const LeaveRequest = require('./LeaveRequest');

// Tenant Relationships
Tenant.hasMany(User, { foreignKey: 'tenantId', as: 'users' });
User.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Branch, { foreignKey: 'tenantId', as: 'branches' });
Branch.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Category, { foreignKey: 'tenantId', as: 'categories' });
Category.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(MenuItem, { foreignKey: 'tenantId', as: 'menuItems' });
MenuItem.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Table, { foreignKey: 'tenantId', as: 'tables' });
Table.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Order, { foreignKey: 'tenantId', as: 'orders' });
Order.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Staff, { foreignKey: 'tenantId', as: 'staff' });
Staff.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Ingredient, { foreignKey: 'tenantId', as: 'ingredients' });
Ingredient.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(SupportTicket, { foreignKey: 'tenantId', as: 'supportTickets' });
SupportTicket.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasOne(Setting, { foreignKey: 'tenantId', as: 'settings' });
Setting.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasOne(Subscription, { foreignKey: 'tenantId', as: 'subscription' });
Subscription.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(ShiftDrawer, { foreignKey: 'tenantId', as: 'shiftDrawers' });
ShiftDrawer.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Attendance, { foreignKey: 'tenantId', as: 'attendances' });
Attendance.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Holiday, { foreignKey: 'tenantId', as: 'holidays' });
Holiday.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(LeaveRequest, { foreignKey: 'tenantId', as: 'leaveRequests' });
LeaveRequest.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(SubscriptionHistory, { foreignKey: 'tenantId', as: 'subscriptionHistories' });
SubscriptionHistory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Branch.hasMany(Attendance, { foreignKey: 'branchId', as: 'attendances' });
Attendance.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Staff.hasMany(Attendance, { foreignKey: 'userId', sourceKey: 'userId', as: 'attendances', constraints: false });
Attendance.belongsTo(Staff, { foreignKey: 'userId', targetKey: 'userId', as: 'staffProfile', constraints: false });

Branch.hasMany(ShiftDrawer, { foreignKey: 'branchId', as: 'shiftDrawers' });
ShiftDrawer.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

// Branch Relationships
Branch.hasMany(Table, { foreignKey: 'branchId', as: 'tables' });
Table.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Branch.hasMany(Order, { foreignKey: 'branchId', as: 'orders' });
Order.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

// Category & MenuItem Relationships
Category.hasMany(MenuItem, { foreignKey: 'categoryId', as: 'menuItems' });
MenuItem.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

// Order & OrderItem Relationships
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'orderItems' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

MenuItem.hasMany(OrderItem, { foreignKey: 'menuItemId', as: 'orderItems' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });

// Staff & User Relationship
User.hasOne(Staff, { foreignKey: 'userId', as: 'staffProfile' });
Staff.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// SupportTicket & User Relationship
User.hasMany(SupportTicket, { foreignKey: 'userId', as: 'supportTickets' });
SupportTicket.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  Tenant,
  User,
  Branch,
  Category,
  MenuItem,
  Table,
  Order,
  OrderItem,
  Staff,
  Ingredient,
  SupportTicket,
  Setting,
  AuditLog,
  Subscription,
  SubscriptionHistory,
  ShiftDrawer,
  Attendance,
  Holiday,
  LeaveRequest
};
