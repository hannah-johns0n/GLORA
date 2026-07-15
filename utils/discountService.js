  const Offer = require('../models/offerModel');
  const Coupon = require('../models/coupensModel');

  async function getActiveOffers() {
    return Offer.find({
      isActive: true,
      endDate: { $gte: new Date() }
    }).populate('product category');
  }

  function getVariantFromItem(item) {
    const product = item.productId;
    if (!product || !product.variants || product.variants.length === 0) {
      return null;
    }

    const variantIndex = Number.isInteger(item.variantIndex) ? item.variantIndex : 0;
    return product.variants[variantIndex] || product.variants[0] || null;
  }

  function getItemBasePrice(item) {
    const variant = getVariantFromItem(item);
    if (!variant) return 0;
    return variant.salesPrice > 0 ? variant.salesPrice : variant.regularPrice;
  }

  function isOfferProductMatch(offer, product) {
    return offer.offerType === 'Product' && offer.product && product && offer.product._id.toString() === product._id.toString();
  }

  function isOfferCategoryMatch(offer, product) {
    if (offer.offerType !== 'Category' || !offer.category || !product || !product.category) {
      return false;
    }

    const productCategoryValue = product.category.toString();
    const categoryIdMatch = offer.category._id && productCategoryValue === offer.category._id.toString();
    const categoryNameMatch = offer.category.categoryName && productCategoryValue === offer.category.categoryName;

    return Boolean(categoryIdMatch || categoryNameMatch);
  }

  function isOfferGlobal(offer) {
    return offer.offerType === 'Global';
  }

  function calculateOfferDiscountPerUnit(basePrice, offer) {
    if (!offer || basePrice <= 0) return 0;

    let discount = 0;
    if (offer.discountType === 'Percentage') {
      discount = (basePrice * offer.discountValue) / 100;
    } else {
      discount = offer.discountValue;
    }

    if (!Number.isFinite(discount)) return 0;
    return Math.min(Math.max(discount, 0), basePrice);
  }

  function determineBestOffer(item, offers = []) {
    const product = item.productId;
    const basePrice = getItemBasePrice(item);
    if (!product || basePrice <= 0) {
      return {
        offer: null,
        discountPerUnit: 0,
        priceAfterOffer: basePrice
      };
    }

    let bestOffer = null;
    let bestDiscount = 0;

    for (const offer of offers) {
      if (!offer || !offer.offerType) continue;

      const applicable = isOfferGlobal(offer)
        || isOfferProductMatch(offer, product)
        || isOfferCategoryMatch(offer, product);

      if (!applicable) continue;

      const discountPerUnit = calculateOfferDiscountPerUnit(basePrice, offer);
      if (discountPerUnit > bestDiscount) {
        bestDiscount = discountPerUnit;
        bestOffer = offer;
      }
    }

    return {
      offer: bestOffer,
      discountPerUnit: bestDiscount,
      priceAfterOffer: Math.max(basePrice - bestDiscount, 0)
    };
  }

  function calculateCartPricing(cart, offers = []) {
    const items = [];
    let subtotal = 0;
    let offerDiscount = 0;

    if (!cart || !Array.isArray(cart.items)) {
      return {
        items,
        subtotal: 0,
        offerDiscount: 0,
        priceAfterOffer: 0
      };
    }

    for (const item of cart.items) {
      if (!item.productId) continue;

      const quantity = item.quantity || 0;
      const basePrice = getItemBasePrice(item);
      const { offer, discountPerUnit, priceAfterOffer } = determineBestOffer(item, offers);

      const itemTotal = Number((priceAfterOffer * quantity).toFixed(2));
      const itemDiscount = Number((discountPerUnit * quantity).toFixed(2));

      subtotal += Number((basePrice * quantity).toFixed(2));
      offerDiscount += itemDiscount;

      items.push({
        ...item.toObject ? item.toObject() : item,
        basePrice,
        offerDiscount: discountPerUnit,
        priceAfterOffer,
        itemTotal,
        itemDiscount,
        appliedOffer: offer ? {
          id: offer._id,
          offerType: offer.offerType,
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          title: offer.title
        } : null
      });
    }

    return {
      items,
      subtotal: Number(subtotal.toFixed(2)),
      offerDiscount: Number(offerDiscount.toFixed(2)),
      priceAfterOffer: Number((subtotal - offerDiscount).toFixed(2))
    };
  }

  async function findValidCoupon(couponCode, userId = null) {
    if (!couponCode || typeof couponCode !== 'string') return null;

    const coupon = await Coupon.findOne({
      couponCode: couponCode.trim().toUpperCase(),
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    if (!coupon) return null;

    const totalUses = coupon.usedBy.reduce((sum, use) => sum + (use.useCount || 0), 0);
    if (coupon.maxUses > 0 && totalUses >= coupon.maxUses) {
      return null;
    }

    if (userId && coupon.perUserLimit > 0) {
      const userEntry = coupon.usedBy.find(u => u.userId?.toString() === userId.toString());
      if (userEntry && userEntry.useCount >= coupon.perUserLimit) {
        return null;
      }
    }

    return coupon;
  }

  async function updateCouponUsage(couponCode, userId) {
    if (!couponCode || !userId) return null;
    const coupon = await Coupon.findOne({ couponCode: couponCode.trim().toUpperCase(), isActive: true });
    if (!coupon) return null;

    const userIndex = coupon.usedBy.findIndex(u => u.userId?.toString() === userId.toString());
    if (userIndex !== -1) {
      coupon.usedBy[userIndex].useCount += 1;
    } else {
      coupon.usedBy.push({ userId, useCount: 1 });
    }

    return coupon.save();
  }

  function calculateCouponDiscount(amount, coupon) {
    if (!coupon || amount <= 0) return 0;
    const normalizedAmount = Number(amount);
    if (normalizedAmount <= 0) return 0;

    let discount = 0;
    if (coupon.discountType === 'Percentage') {
      discount = (normalizedAmount * coupon.discountValue) / 100;

      if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
        discount = Math.min(discount, coupon.maxDiscountAmount);
      }
    } else {
      discount = coupon.discountValue;
    }

    if (!Number.isFinite(discount)) return 0;
    return Number(Math.min(Math.max(discount, 0), normalizedAmount).toFixed(2));
  }

  function getOfferPriceForProduct(product, basePrice, offers = []) {
    if (!product || basePrice <= 0) {
      return { offer: null, discountPerUnit: 0, priceAfterOffer: basePrice };
    }

    let bestOffer = null;
    let bestDiscount = 0;

    for (const offer of offers) {
      if (!offer || !offer.offerType) continue;

      const applicable = isOfferGlobal(offer)
        || isOfferProductMatch(offer, product)
        || isOfferCategoryMatch(offer, product);

      if (!applicable) continue;

      const discountPerUnit = calculateOfferDiscountPerUnit(basePrice, offer);
      if (discountPerUnit > bestDiscount) {
        bestDiscount = discountPerUnit;
        bestOffer = offer;
      }
    }

    return {
      offer: bestOffer,
      discountPerUnit: bestDiscount,
      priceAfterOffer: Math.max(basePrice - bestDiscount, 0)
    };
  }

  module.exports = {
    getActiveOffers,
    calculateCartPricing,
    findValidCoupon,
    updateCouponUsage,
    calculateCouponDiscount,
    getOfferPriceForProduct
  };