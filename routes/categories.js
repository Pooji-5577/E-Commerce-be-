const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('../generated/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/categories - Get all categories with hierarchy
router.get('/', async (req, res) => {
  try {
    const { gender } = req.query;
    
    const where = {
      parentId: null, // Get root categories
      ...(gender && { gender: gender.toUpperCase() })
    };

    const categories = await prisma.category.findMany({
      where,
      include: {
        children: {
          include: {
            children: true,
            _count: {
              select: { products: true }
            }
          }
        },
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/categories/:id - Get single category with products
router.get('/:id', async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        children: true,
        parent: true,
        products: {
          where: { isActive: true },
          include: {
            category: true,
            reviews: {
              select: { rating: true }
            },
            _count: {
              select: { reviews: true }
            }
          },
          skip: parseInt(skip),
          take: parseInt(limit),
          orderBy: { [sortBy]: order }
        },
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/categories - Create new category (Admin only)
router.post('/', 
  auth,
  [
    body('name').notEmpty().withMessage('Category name is required'),
    body('slug').notEmpty().withMessage('Category slug is required'),
    body('gender').optional().isIn(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).withMessage('Invalid gender')
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, slug, description, imageUrl, parentId, gender } = req.body;

      const category = await prisma.category.create({
        data: {
          name,
          slug,
          description,
          imageUrl,
          parentId,
          gender
        },
        include: {
          parent: true,
          children: true
        }
      });

      res.status(201).json(category);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;