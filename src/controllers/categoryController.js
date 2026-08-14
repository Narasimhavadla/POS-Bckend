const { Category } = require('../models');

exports.getCategories = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const categories = await Category.findAll({
      where: { tenantId, isActive: true },
      order: [['sortOrder', 'ASC']]
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    // Support single object or array of objects
    if (Array.isArray(req.body)) {
      const itemsToCreate = req.body.map((cat, idx) => ({
        tenantId,
        name: cat.name,
        icon: cat.icon || '🍽️',
        sortOrder: cat.sortOrder || idx
      }));
      const createdList = await Category.bulkCreate(itemsToCreate);
      return res.status(201).json({ success: true, data: createdList });
    }

    const { name, icon, sortOrder } = req.body;
    const category = await Category.create({
      tenantId,
      name,
      icon: icon || '🍽️',
      sortOrder: sortOrder || 0
    });

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await category.update(req.body);
    res.json({ success: true, message: 'Category updated successfully', data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await category.destroy();
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

