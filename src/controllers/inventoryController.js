const { Ingredient } = require('../models');

exports.getInventory = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const inventory = await Ingredient.findAll({
      where: { tenantId, isActive: true },
      order: [['name', 'ASC']]
    });
    res.json({ success: true, data: inventory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createIngredient = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { name, unit, currentStock, reorderLevel, costPerUnit, supplier } = req.body;

    const ingredient = await Ingredient.create({
      tenantId,
      name,
      unit: unit || 'kg',
      currentStock: currentStock ? parseFloat(currentStock) : 0,
      reorderLevel: reorderLevel ? parseFloat(reorderLevel) : 10,
      costPerUnit: costPerUnit ? parseFloat(costPerUnit) : 0,
      supplier
    });

    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stockAdjustment } = req.body;

    const ingredient = await Ingredient.findByPk(id);
    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    ingredient.currentStock += parseFloat(stockAdjustment);
    await ingredient.save();

    res.json({ success: true, message: 'Stock updated', data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
