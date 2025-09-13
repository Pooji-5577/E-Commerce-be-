const express = require('express');
const { PrismaClient, Prisma } = require('../generated/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/users/profile - Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/become-seller - upgrade current user to SELLER
router.post('/become-seller', auth, async (req, res) => {
  try {
    // If already a seller, return 400
    if (req.user.role === 'SELLER') {
      return res.status(400).json({ error: 'User is already a seller' });
    }

    // Use Prisma enum value to update role
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { role: Prisma.Role.SELLER },
      select: { id: true, email: true, name: true, role: true }
    });

    res.json({ user: updated });
  } catch (error) {
    console.error('Failed to become seller', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;