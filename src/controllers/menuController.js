const { MenuItem, Category } = require('../models');

exports.getMenuItems = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const menuItems = await MenuItem.findAll({
      where: { tenantId },
      include: [{ model: Category, as: 'category' }],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });
    res.json({ success: true, data: menuItems });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createMenuItem = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { categoryId, name, price, description, isVeg, isAvailable, image, dietaryType, isChefSpecial } = req.body;

    const parsedPrice = Math.round((parseFloat(price) || 0) * 100) / 100;

    const menuItem = await MenuItem.create({
      tenantId,
      categoryId,
      name,
      price: parsedPrice,
      description,
      isVeg: isVeg !== undefined ? isVeg : true,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      image,
      dietaryType,
      isChefSpecial
    });

    res.status(201).json({ success: true, data: menuItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.findByPk(id);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    const updateData = { ...req.body };
    if (updateData.price !== undefined) {
      updateData.price = Math.round((parseFloat(updateData.price) || 0) * 100) / 100;
    }

    await menuItem.update(updateData);
    res.json({ success: true, message: 'Menu item updated', data: menuItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.findByPk(id);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    await menuItem.destroy();
    res.json({ success: true, message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
