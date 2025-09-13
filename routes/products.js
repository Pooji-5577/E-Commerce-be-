const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient, Prisma } = require('../generated/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/products - Get all products with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search, gender, brand, isFeatured, sortBy = 'createdAt', order = 'desc', sellerId } = req.query;
    const skip = (page - 1) * limit;
    
    const where = {
      isActive: true,
      ...(category && { categoryId: category }),
      ...(gender && { gender: gender.toUpperCase() }),
      ...(brand && { brand: { contains: brand, mode: 'insensitive' } }),
      ...(isFeatured && { isFeatured: isFeatured === 'true' }),
      ...(sellerId && { sellerId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const orderBy = {};
    orderBy[sortBy] = order;

    const products = await prisma.product.findMany({
      where,
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
      orderBy
    });

    const total = await prisma.product.count({ where });

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/products/:id - Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        reviews: {
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products - Create new product (Admin or Seller)
router.post('/', 
  auth,
  [
    body('name').notEmpty().withMessage('Product name is required'),
    body('price').isDecimal({ gt: 0 }).withMessage('Price must be greater than 0'),
    body('categoryId').notEmpty().withMessage('Category is required'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')
  ],
  async (req, res) => {
    try {
      // Allow ADMIN or SELLER to create products
      if (req.user.role !== 'ADMIN' && req.user.role !== 'SELLER') {
        return res.status(403).json({ error: 'Access denied. Admin or Seller only.' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, price, stock, imageUrl, categoryId, brand, gender } = req.body;

      const data = {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock),
        imageUrl,
        categoryId,
        ...(brand && { brand }),
        ...(gender && { gender: gender.toUpperCase() })
      };

      // If a seller creates the product, attach their user id as sellerId
      if (req.user.role === 'SELLER') {
        data.sellerId = req.user.id;
      } else if (req.body.sellerId) {
        // Admin can set sellerId when creating products
        data.sellerId = req.body.sellerId;
      }

      const product = await prisma.product.create({
        data,
        include: {
          category: true
        }
      });

      res.status(201).json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PUT /api/products/:id - Update product (Admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { name, description, price, stock, imageUrl, categoryId, isActive, gender } = req.body;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(price && { price: parseFloat(price) }),
        ...(stock !== undefined && { stock: parseInt(stock) }),
        ...(imageUrl && { imageUrl }),
        ...(categoryId && { categoryId }),
        ...(isActive !== undefined && { isActive }),
        ...(gender && { gender: gender.toUpperCase() })
      },
      include: {
        category: true
      }
    });

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;